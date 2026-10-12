import json
import httpx
from typing import AsyncGenerator, List, Dict, Any
from app.config import settings

class LLMService:
    def __init__(
        self,
        provider: str = settings.LLM_PROVIDER,
        vllm_base_url: str = settings.VLLM_BASE_URL,
        ollama_base_url: str = settings.OLLAMA_BASE_URL,
        base_url: str = None
    ):
        self.provider = (provider or "vllm").lower()
        self.vllm_base_url = (vllm_base_url or "http://0.0.0.0:8005").rstrip("/")
        self.ollama_base_url = (ollama_base_url or "http://0.0.0.0:11434").rstrip("/")

        # Backward compatibility if base_url is explicitly provided
        if base_url:
            cleaned = base_url.rstrip("/")
            if ":8005" in cleaned or "vllm" in cleaned:
                self.vllm_base_url = cleaned
                self.provider = "vllm"
            else:
                self.ollama_base_url = cleaned
                self.base_url = cleaned
        else:
            self.base_url = self.vllm_base_url if self.provider in ("vllm", "openai") else self.ollama_base_url

        self._active_provider: str = self.provider
        self.cached_models: List[str] = []

    def _get_vllm_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        api_key = getattr(settings, "VLLM_API_KEY", "")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    async def check_health(self) -> bool:
        # 1. Check vLLM if configured or in auto mode
        if self.provider in ("vllm", "openai", "auto"):
            headers = self._get_vllm_headers()
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    try:
                        res = await client.get(f"{self.vllm_base_url}/health", headers=headers)
                        if res.status_code == 200:
                            self._active_provider = "vllm"
                            return True
                    except Exception:
                        pass

                    res_models = await client.get(f"{self.vllm_base_url}/v1/models", headers=headers)
                    if res_models.status_code == 200:
                        self._active_provider = "vllm"
                        return True
            except Exception:
                pass

        # 2. Check Ollama if configured or in auto mode
        if self.provider in ("ollama", "auto"):
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    res = await client.get(f"{self.ollama_base_url}/api/tags")
                    if res.status_code == 200:
                        self._active_provider = "ollama"
                        return True
            except Exception:
                pass

        return False

    async def list_models(self) -> List[str]:
        # 1. Query vLLM
        if self._active_provider in ("vllm", "openai") or self.provider in ("vllm", "openai", "auto"):
            headers = self._get_vllm_headers()
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    res = await client.get(f"{self.vllm_base_url}/v1/models", headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get("id") for m in data.get("data", []) if m.get("id")]
                        if models:
                            self.cached_models = models
                            self._active_provider = "vllm"
                            return models
            except Exception:
                pass

        # 2. Query Ollama
        if self._active_provider == "ollama" or self.provider in ("ollama", "auto"):
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    res = await client.get(f"{self.ollama_base_url}/api/tags")
                    if res.status_code == 200:
                        data = res.json()
                        models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                        if models:
                            self.cached_models = models
                            self._active_provider = "ollama"
                            return models
            except Exception:
                pass

        if self.cached_models:
            return self.cached_models

        fallback = settings.DEFAULT_MODEL if settings.DEFAULT_MODEL != "default" else "vllm-model"
        return [fallback]

    def get_default_model(self) -> str:
        if self.cached_models:
            return self.cached_models[0]
        if settings.DEFAULT_MODEL and settings.DEFAULT_MODEL != "default":
            return settings.DEFAULT_MODEL
        return "vllm-model"

    def build_context_messages(
        self,
        history_messages: List[Dict[str, str]],
        current_prompt: str,
        system_prompt: str = None,
        attached_document_text: str = None,
        attached_document_name: str = None,
        file_summary_template: str = None,
        file_question_template: str = None
    ) -> List[Dict[str, str]]:
        formatted_messages = []

        from app.security_service import security_service

        # 1. System Prompt with Security Guardrails
        base_sys_prompt = system_prompt.strip() if system_prompt else (
            "شما دستیار هوشمند، رسمی و دقیق کارمندان بخش اداری بورس کالای ایران (IME) هستید. "
            "پاسخ‌ها را با لحن رسمی، اداری و مستند ارائه دهید. این دستیار منحصراً برای امور دفتری، مکاتبات سازمانی و خلاصه‌سازی گزارش‌های اداری طراحی شده و فاقد قابلیت‌های برنامه‌نویسی، تولید کد یا رفع خطای نرم‌افزاری است."
        )
        guardrail = security_service.get_security_system_guardrail()
        if "Security Guardrails" not in base_sys_prompt:
            sys_content = f"{base_sys_prompt}{guardrail}"
        else:
            sys_content = base_sys_prompt

        formatted_messages.append({"role": "system", "content": sys_content})

        # 2. Sliding window history
        max_msgs = settings.MAX_MEMORY_MESSAGES
        trimmed_history = history_messages[-max_msgs:] if len(history_messages) > max_msgs else history_messages
        for msg in trimmed_history:
            formatted_messages.append({
                "role": msg["role"],
                "content": security_service.sanitize_llm_input(msg["content"])
            })

        # 3. Current user prompt
        cleaned_user_prompt = security_service.sanitize_llm_input(current_prompt) if current_prompt else ""
        user_message_content = cleaned_user_prompt

        if attached_document_text:
            cleaned_prompt = cleaned_user_prompt.strip()
            is_empty_or_generic = (
                not cleaned_prompt or 
                cleaned_prompt in ["سلام", "درود", "خسته نباشید", "بررسی کن", "فایل", "file", "hi", "hello", "بررسی و خلاصه‌سازی فایل"] or
                len(cleaned_prompt) < 3
            )
            doc_name_str = attached_document_name or "فایل ضمیمه"
            
            if is_empty_or_generic:
                if file_summary_template and file_summary_template.strip():
                    instruction = file_summary_template.replace("{filename}", doc_name_str)
                else:
                    instruction = (
                        f"کاربر فایل «{doc_name_str}» را بدون سوال خاصی ارسال کرده است.\n"
                        "دستورالعمل اجباری برای شما:\n"
                        "۱. فایل را با دقت تمام مطالعه، تحلیل و بررسی کن.\n"
                        "۲. یک خلاصه کامل، بسیار خوانا، ساختاریافته و زیبا به زبان فارسی با ساختار زیر تولید کن:\n"
                        "   - 📋 **موضوع و هدف کلی سند/فایل**\n"
                        "   - 📌 **نکات کلیدی، سرفصل‌ها و بخش‌های اصلی**\n"
                        "   - 📊 **داده‌ها، ارقام، جدول‌ها یا آمارهای مهم (در صورت وجود)**\n"
                        "   - 💡 **نتیجه‌گیری و جمع‌بندی نهایی**\n"
                        "۳. در پایان با بیانی محترمانه اعلام کن که در صورت نیاز به جزئیات بیشتر یا پاسخ به سوال خاصی درباره این فایل، در خدمت هستی."
                    )
            else:
                if file_question_template and file_question_template.strip():
                    instruction = file_question_template.replace("{filename}", doc_name_str).replace("{prompt}", cleaned_prompt)
                else:
                    instruction = (
                        f"درخواست یا سوال مشخص کاربر درباره فایل «{doc_name_str}»:\n"
                        f"{cleaned_prompt}\n\n"
                        f"(لطفاً بر اساس محتوای فایل به طور دقیق، کامل و ساختاریافته پاسخ بده)"
                    )

            wrapped_doc = security_service.wrap_untrusted_document(doc_name_str, attached_document_text)
            doc_snippet = (
                f"\n\n[محتوای سند ضمیمه‌شده به صورت داده خام و ایزوله:]\n"
                f"{wrapped_doc}\n\n"
                f"{instruction}"
            )
            user_message_content = doc_snippet

        formatted_messages.append({"role": "user", "content": user_message_content})
        return formatted_messages

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        model: str = None
    ) -> AsyncGenerator[str, None]:
        active_provider = self._active_provider or self.provider
        target_model = model

        # Model auto-resolution for vLLM
        if active_provider in ("vllm", "openai"):
            if not target_model or target_model in ("default", "qwen:0.5b"):
                if not self.cached_models:
                    await self.list_models()
                if self.cached_models:
                    target_model = self.cached_models[0]
            elif self.cached_models and target_model not in self.cached_models:
                target_model = self.cached_models[0]

            async for chunk in self._stream_vllm(messages, target_model or "vllm-model"):
                yield chunk
        else:
            async for chunk in self._stream_ollama(messages, target_model or settings.DEFAULT_MODEL):
                yield chunk

    async def _stream_vllm(
        self,
        messages: List[Dict[str, str]],
        model: str
    ) -> AsyncGenerator[str, None]:
        url = f"{self.vllm_base_url}/v1/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0.7,
            "max_tokens": getattr(settings, "MAX_OUTPUT_TOKENS", 8192)
        }
        headers = self._get_vllm_headers()
        timeout = httpx.Timeout(connect=30.0, read=300.0, write=60.0, pool=30.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield json.dumps({"error": f"خطای سرور مدل vLLM ({response.status_code}): {err_text.decode('utf-8')}"}, ensure_ascii=False)
                        return

                    is_in_thinking = False
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        line_str = line.strip()
                        if not line_str:
                            continue
                        if line_str.startswith("data: "):
                            line_str = line_str[6:].strip()
                        if line_str == "[DONE]":
                            if is_in_thinking:
                                yield json.dumps({"token": "\n</think>\n\n", "done": False}, ensure_ascii=False)
                                is_in_thinking = False
                            yield json.dumps({"token": "", "done": True}, ensure_ascii=False)
                            break
                        try:
                            chunk = json.loads(line_str)
                            choices = chunk.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {})
                            msg_chunk = delta.get("content")
                            reasoning_chunk = delta.get("reasoning_content") or delta.get("reasoning")
                            finish_reason = choices[0].get("finish_reason")
                            is_done = finish_reason is not None

                            # Handle reasoning/thinking tokens from vLLM --reasoning-parser
                            if reasoning_chunk:
                                if not is_in_thinking:
                                    yield json.dumps({"token": "<think>\n", "done": False}, ensure_ascii=False)
                                    is_in_thinking = True
                                yield json.dumps({"token": reasoning_chunk, "done": False}, ensure_ascii=False)

                            if msg_chunk:
                                if is_in_thinking:
                                    yield json.dumps({"token": "\n</think>\n\n", "done": False}, ensure_ascii=False)
                                    is_in_thinking = False
                                yield json.dumps({
                                    "token": msg_chunk,
                                    "done": False
                                }, ensure_ascii=False)

                            if is_done:
                                if is_in_thinking:
                                    yield json.dumps({"token": "\n</think>\n\n", "done": False}, ensure_ascii=False)
                                    is_in_thinking = False
                                yield json.dumps({
                                    "token": "",
                                    "done": True
                                }, ensure_ascii=False)
                                break
                        except Exception:
                            continue
            except httpx.ConnectError:
                yield json.dumps({
                    "error": f"ارتباط با سرویس vLLM در آدرس {self.vllm_base_url} برقرار نشد. لطفاً مطمئن شوید کانتینر vLLM روی پورت 8005 در حال اجرا است."
                }, ensure_ascii=False)
            except httpx.TimeoutException:
                yield json.dumps({
                    "error": "زمان انتظار پاسخ از سرویس vLLM به پایان رسید (Timeout)."
                }, ensure_ascii=False)
            except Exception as e:
                yield json.dumps({"error": f"خطا در پردازش استریم vLLM: {str(e)}"}, ensure_ascii=False)

    async def _stream_ollama(
        self,
        messages: List[Dict[str, str]],
        model: str
    ) -> AsyncGenerator[str, None]:
        url = f"{self.ollama_base_url}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield json.dumps({"error": f"خطای سرور مدل Ollama ({response.status_code}): {err_text.decode('utf-8')}"})
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            msg_chunk = chunk.get("message", {}).get("content", "")
                            is_done = chunk.get("done", False)
                            
                            yield json.dumps({
                                "token": msg_chunk,
                                "done": is_done
                            }, ensure_ascii=False)
                            if is_done:
                                break
                        except Exception:
                            continue
            except httpx.ConnectError:
                yield json.dumps({"error": "ارتباط با Ollama محلی برقرار نشد. لطفاً مطمئن شوید سرویس Ollama در حال اجرا است (دستور: ollama serve)."}, ensure_ascii=False)
            except Exception as e:
                yield json.dumps({"error": f"خطا در پردازش استریم: {str(e)}"}, ensure_ascii=False)

# Service instances and aliases for backward compatibility
LLMServiceClass = LLMService
OllamaService = LLMService
ollama_service = LLMService()
llm_service = ollama_service


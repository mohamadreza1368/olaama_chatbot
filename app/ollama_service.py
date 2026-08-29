import json
import httpx
from typing import AsyncGenerator, List, Dict, Any
from app.config import settings

class OllamaService:
    def __init__(self, base_url: str = settings.OLLAMA_BASE_URL):
        self.base_url = base_url.rstrip("/")

    async def check_health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                    return models if models else [settings.DEFAULT_MODEL]
        except Exception:
            pass
        return [settings.DEFAULT_MODEL]

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

        # 1. System Prompt
        sys_content = system_prompt.strip() if system_prompt else (
            "You are a helpful, accurate, and intelligent AI assistant. "
            "Respond in the same language the user is speaking (e.g. Persian or English). "
            "Format your answers with clean Markdown and code blocks where appropriate."
        )
        formatted_messages.append({"role": "system", "content": sys_content})

        # 2. Sliding window history
        max_msgs = settings.MAX_MEMORY_MESSAGES
        trimmed_history = history_messages[-max_msgs:] if len(history_messages) > max_msgs else history_messages
        for msg in trimmed_history:
            formatted_messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })

        # 3. Current user prompt
        user_message_content = current_prompt
        if attached_document_text:
            cleaned_prompt = current_prompt.strip() if current_prompt else ""
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

            doc_snippet = (
                f"\n\n[محتوای استخراج‌شده از فایل: {doc_name_str}]\n"
                f"```\n{attached_document_text.strip()}\n```\n\n"
                f"{instruction}"
            )
            user_message_content = doc_snippet

        formatted_messages.append({"role": "user", "content": user_message_content})
        return formatted_messages

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        model: str = settings.DEFAULT_MODEL
    ) -> AsyncGenerator[str, None]:
        url = f"{self.base_url}/api/chat"
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
                            })
                            if is_done:
                                break
                        except Exception:
                            continue
            except httpx.ConnectError:
                yield json.dumps({"error": "ارتباط با Ollama محلی برقرار نشد. لطفاً مطمئن شوید سرویس Ollama در حال اجرا است (دستور: ollama serve)."})
            except Exception as e:
                yield json.dumps({"error": f"خطا در پردازش استریم: {str(e)}"})

ollama_service = OllamaService()

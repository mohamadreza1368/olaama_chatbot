import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.config import settings
from app.ollama_service import LLMService
from app.database import get_system_model, SessionLocal, SystemSetting

@pytest.mark.anyio
async def test_vllm_list_models():
    service = LLMService(base_url="http://0.0.0.0:8005", provider="vllm")
    
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "object": "list",
        "data": [
            {"id": "meta-llama/Llama-3.1-8B-Instruct"},
            {"id": "qwen2.5:7b"}
        ]
    }
    
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        models = await service.list_models()
        assert "meta-llama/Llama-3.1-8B-Instruct" in models
        assert "qwen2.5:7b" in models
        assert service.get_default_model() == "meta-llama/Llama-3.1-8B-Instruct"

@pytest.mark.anyio
async def test_vllm_check_health():
    service = LLMService(base_url="http://0.0.0.0:8005", provider="vllm")
    
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        is_alive = await service.check_health()
        assert is_alive is True

@pytest.mark.anyio
async def test_vllm_stream_chat_sse_parsing():
    service = LLMService(base_url="http://0.0.0.0:8005", provider="vllm")
    service.cached_models = ["my-vllm-model"]
    
    # Mock SSE stream lines
    sse_lines = [
        'data: {"choices": [{"delta": {"content": "سلام "}}]}',
        '',
        'data: {"choices": [{"delta": {"content": "خوش آمدید"}}]}',
        '',
        'data: [DONE]'
    ]
    
    async def mock_aiter_lines():
        for line in sse_lines:
            yield line

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.aiter_lines = mock_aiter_lines

    # Mock AsyncClient.stream context manager
    class MockStreamContext:
        async def __aenter__(self):
            return mock_response
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("httpx.AsyncClient.stream", return_value=MockStreamContext()):
        tokens = []
        async for chunk in service.stream_chat(messages=[{"role": "user", "content": "سلام"}], model="default"):
            data = json.loads(chunk)
            tokens.append(data.get("token", ""))
            
        full_text = "".join(tokens)
        assert "سلام خوش آمدید" in full_text

def test_database_get_system_model_vllm_migration():
    db = SessionLocal()
    try:
        # If active_model is set to legacy 'qwen:0.5b' but provider is vllm
        setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
        if not setting:
            setting = SystemSetting(key="active_model", value="qwen:0.5b")
            db.add(setting)
        else:
            setting.value = "qwen:0.5b"
        db.commit()
        
        with patch.object(settings, "LLM_PROVIDER", "vllm"):
            model = get_system_model(db)
            assert model == settings.DEFAULT_MODEL
    finally:
        db.close()

@pytest.mark.anyio
async def test_vllm_reasoning_tokens_stream():
    service = LLMService(base_url="http://127.0.0.1:8005", provider="vllm")
    service.cached_models = ["Qwen/Qwen3.8-27B-FP8"]
    
    # Mock SSE stream lines containing reasoning_content followed by content
    sse_lines = [
        'data: {"choices": [{"delta": {"reasoning_content": "در حال محاسبه"}}]}',
        'data: {"choices": [{"delta": {"reasoning_content": " و بررسی دادها"}}]}',
        'data: {"choices": [{"delta": {"content": "پاسخ نهایی تحلیلی"}}]}',
        'data: {"choices": [{"delta": {}, "finish_reason": "stop"}]}'
    ]
    
    async def mock_aiter_lines():
        for line in sse_lines:
            yield line

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.aiter_lines = mock_aiter_lines

    class MockStreamContext:
        async def __aenter__(self):
            return mock_response
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("httpx.AsyncClient.stream", return_value=MockStreamContext()):
        tokens = []
        async for chunk in service.stream_chat(messages=[{"role": "user", "content": "تحلیل"}], model="default"):
            data = json.loads(chunk)
            tokens.append(data.get("token", ""))
            
        full_text = "".join(tokens)
        assert "<think>" in full_text
        assert "در حال محاسبه و بررسی دادها" in full_text
        assert "</think>" in full_text
        assert "پاسخ نهایی تحلیلی" in full_text

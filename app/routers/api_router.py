import time
import json
from typing import List, Optional, Union
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db, PromptLog
from app.auth import get_auth_context, AuthContext
from app.ollama_service import ollama_service
from app.config import settings

router = APIRouter(prefix="/api/v1", tags=["Public API (API Key Auth)"])

class ChatMessageItem(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = settings.DEFAULT_MODEL
    messages: List[ChatMessageItem]
    stream: Optional[bool] = False
    system_prompt: Optional[str] = None

@router.post("/chat/completions")
async def chat_completions(
    req: ChatCompletionRequest,
    request: Request,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db)
):
    """
    OpenAI-compatible & custom chat completion endpoint authenticated via API Key or JWT.
    """
    active_model = req.model or settings.DEFAULT_MODEL
    client_ip = request.client.host if request.client else "127.0.0.1"
    start_time = time.time()

    # Format messages
    messages_payload = []
    if req.system_prompt:
        messages_payload.append({"role": "system", "content": req.system_prompt})
    for m in req.messages:
        messages_payload.append({"role": m.role, "content": m.content})

    user_prompt_summary = "\n".join([m.content for m in req.messages if m.role == "user"][-2:])

    if req.stream:
        async def stream_wrapper():
            full_response = []
            try:
                async for chunk_str in ollama_service.stream_chat(messages_payload, model=active_model):
                    chunk_data = json.loads(chunk_str)
                    if "error" in chunk_data:
                        yield f"data: {json.dumps({'error': chunk_data['error']})}\n\n"
                        break
                    token = chunk_data.get("token", "")
                    if token:
                        full_response.append(token)
                        openai_chunk = {
                            "id": f"chatcmpl-{int(time.time())}",
                            "object": "chat.completion.chunk",
                            "model": active_model,
                            "choices": [{
                                "delta": {"content": token},
                                "finish_reason": None
                            }]
                        }
                        yield f"data: {json.dumps(openai_chunk)}\n\n"
                    
                    if chunk_data.get("done", False):
                        openai_end = {
                            "id": f"chatcmpl-{int(time.time())}",
                            "object": "chat.completion.chunk",
                            "model": active_model,
                            "choices": [{
                                "delta": {},
                                "finish_reason": "stop"
                            }]
                        }
                        yield f"data: {json.dumps(openai_end)}\n\n"
                        yield "data: [DONE]\n\n"
                        break
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

            latency = int((time.time() - start_time) * 1000)
            final_text = "".join(full_response)
            
            # Log Prompt
            from app.database import SessionLocal
            bg_db = SessionLocal()
            try:
                log = PromptLog(
                    user_id=auth.user.id,
                    api_key_id=auth.api_key.id if auth.api_key else None,
                    username_display=auth.user.username,
                    auth_type=auth.auth_type,
                    model=active_model,
                    prompt=user_prompt_summary,
                    response=final_text,
                    prompt_tokens=len(user_prompt_summary.split()),
                    response_tokens=len(final_text.split()),
                    latency_ms=latency,
                    ip_address=client_ip,
                    status="success" if final_text else "error"
                )
                bg_db.add(log)
                bg_db.commit()
            finally:
                bg_db.close()

        return StreamingResponse(stream_wrapper(), media_type="text/event-stream")

    # Non-streaming response
    full_tokens = []
    async for chunk_str in ollama_service.stream_chat(messages_payload, model=active_model):
        chunk_data = json.loads(chunk_str)
        if "error" in chunk_data:
            raise HTTPException(status_code=502, detail=chunk_data["error"])
        token = chunk_data.get("token", "")
        if token:
            full_tokens.append(token)
    
    response_content = "".join(full_tokens)
    latency = int((time.time() - start_time) * 1000)

    # Save log
    log = PromptLog(
        user_id=auth.user.id,
        api_key_id=auth.api_key.id if auth.api_key else None,
        username_display=auth.user.username,
        auth_type=auth.auth_type,
        model=active_model,
        prompt=user_prompt_summary,
        response=response_content,
        prompt_tokens=len(user_prompt_summary.split()),
        response_tokens=len(response_content.split()),
        latency_ms=latency,
        ip_address=client_ip,
        status="success"
    )
    db.add(log)
    db.commit()

    return {
        "id": f"chatcmpl-{int(time.time())}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": active_model,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": response_content
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": len(user_prompt_summary.split()),
            "completion_tokens": len(response_content.split()),
            "total_tokens": len(user_prompt_summary.split()) + len(response_content.split())
        }
    }

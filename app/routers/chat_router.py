import time
import uuid
import json
import re
import datetime
from typing import Optional
from urllib.parse import quote
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from app.database import get_db, User, ChatSession, ChatMessage, PromptLog, Skill, get_system_model, get_system_prompt, get_reference_prompts, check_and_reset_user_daily_tokens, get_active_skills
from app.auth import get_current_user
from app.ollama_service import ollama_service
from app.queue_service import request_queue
from app.document_parser import extract_text_from_file
from app.security_service import security_service
from app.export_service import export_to_docx, export_to_xlsx, detect_export_intent
from app.config import settings

class ExportRequest(BaseModel):
    format: str = "docx"
    content: Optional[str] = None
    session_id: Optional[str] = None
    message_id: Optional[int] = None
    title: Optional[str] = None

router = APIRouter(prefix="/api/chat", tags=["Chat & Sessions"])

def generate_smart_title(prompt: str) -> str:
    if not prompt:
        return "گفتگوی جدید"
    
    clean = re.sub(r'\[File:.*?\]', '', prompt).strip()
    pattern = r'^(سلام|درود|خسته نباشید|لطفا|لطفاً|میشه|می‌شه|میخوام|می‌خوام|چطور|چگونه|آیا|بگو|توضیح بده|یک|درباره|hello|hi|hey|please|tell me|explain|how to|what is|can you)[،,\s\.:\-]+\s*'
    while True:
        new_clean = re.sub(pattern, '', clean, flags=re.IGNORECASE).strip()
        if new_clean == clean:
            break
        clean = new_clean
    
    first_line = clean.split('\n')[0].strip()
    first_line = re.sub(r'[؟?!.,:;]+$', '', first_line).strip()
    
    words = first_line.split()
    if len(words) > 6:
        return ' '.join(words[:6]) + '...'
    elif words:
        return first_line
    else:
        return (prompt[:30] + '...') if len(prompt) > 30 else prompt

@router.get("/models")
async def get_models(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sys_model = get_system_model(db)
    if sys_model in ("default", "qwen:0.5b", "auto") and settings.LLM_PROVIDER == "vllm":
        vllm_def = ollama_service.get_default_model()
        if vllm_def:
            sys_model = vllm_def
    return {"active_model": sys_model, "provider": settings.LLM_PROVIDER}

@router.get("/skills")
def get_active_skills_chat(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    skills = get_active_skills(db)
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description
        }
        for s in skills
    ]

@router.get("/sessions")
def get_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "title": s.title,
            "model_name": s.model_name,
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
            "message_count": len(s.messages)
        }
        for s in sessions
    ]

@router.post("/sessions")
def create_session(
    title: Optional[str] = "گفتگوی جدید",
    system_prompt: Optional[str] = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sys_model = get_system_model(db)
    global_sys_prompt = get_system_prompt(db)
    session_id = str(uuid.uuid4())
    new_sess = ChatSession(
        id=session_id,
        user_id=current_user.id,
        title=title or "گفتگوی جدید",
        model_name=sys_model,
        system_prompt=system_prompt or global_sys_prompt
    )
    db.add(new_sess)
    db.commit()
    db.refresh(new_sess)
    return {
        "id": new_sess.id,
        "title": new_sess.title,
        "model_name": new_sess.model_name,
        "created_at": new_sess.created_at.isoformat()
    }

@router.get("/sessions/{session_id}")
def get_session_details(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session_id = security_service.validate_session_id(session_id)
    sess = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    messages = [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "has_attachment": m.has_attachment,
            "attachment_name": m.attachment_name,
            "created_at": m.created_at.isoformat()
        }
        for m in sess.messages
    ]
    
    return {
        "id": sess.id,
        "title": sess.title,
        "model_name": sess.model_name,
        "system_prompt": sess.system_prompt,
        "created_at": sess.created_at.isoformat(),
        "messages": messages
    }

@router.patch("/sessions/{session_id}")
def update_session(
    session_id: str,
    title: Optional[str] = None,
    system_prompt: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session_id = security_service.validate_session_id(session_id)
    sess = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    if title is not None:
        sess.title = title.strip()[:200]
    if system_prompt is not None:
        sess.system_prompt = system_prompt.strip()
    
    sess.updated_at = datetime.datetime.utcnow()
    db.commit()
    return {"message": "Session updated", "id": sess.id, "title": sess.title}

@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session_id = security_service.validate_session_id(session_id)
    sess = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    db.delete(sess)
    db.commit()
    return {"message": "Session deleted successfully"}

@router.post("/send")
async def send_message(
    request: Request,
    session_id: str = Form(...),
    prompt: Optional[str] = Form(""),
    skill_id: Optional[int] = Form(None),
    system_prompt: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Validate session_id format to prevent SQL / Path Injection
    session_id = security_service.validate_session_id(session_id)

    # Check if at least prompt or file is provided
    if not (prompt and prompt.strip()) and not file:
        raise HTTPException(status_code=400, detail="لطفاً متن پیام یا فایلی را برای ارسال مشخص کنید.")

    # Defense against Prompt Injection in user text prompt
    if prompt and prompt.strip():
        is_inj, inj_reason = security_service.detect_prompt_injection(prompt)
        if is_inj:
            raise HTTPException(
                status_code=400,
                detail=f"درخواست شما به دلیل وجود الگوهای غیرمجاز امنیتی (Prompt Injection) مسدود شد: {inj_reason}"
            )

    # 0. Check and Reset User Daily Token Quota
    check_and_reset_user_daily_tokens(current_user, db)
    if current_user.token_quota > 0 and current_user.tokens_used >= current_user.token_quota:
        raise HTTPException(
            status_code=403,
            detail=f"سقف مجاز توکن امروز شما ({current_user.token_quota:,} توکن) به پایان رسیده است. سهمیه روزانه شما بامداد فردا به صورت خودکار شارژ خواهد شد."
        )

    # 1. Extract Document Content if uploaded
    doc_text = None
    doc_name = None
    if file and file.filename:
        doc_name = file.filename
        file_bytes = await file.read()
        if len(file_bytes) > settings.UPLOAD_MAX_BYTES:
            raise HTTPException(status_code=400, detail="حجم فایل ارسالی بیش از ۱۵ مگابایت است.")
        doc_text = extract_text_from_file(doc_name, file_bytes)

        # Defense against Indirect Prompt Injection in uploaded documents
        if doc_text:
            is_inj, inj_reason = security_service.detect_prompt_injection(doc_text)
            if is_inj:
                raise HTTPException(
                    status_code=400,
                    detail="فایل ارسالی شامل الگوهای غیرمجاز امنیتی (Indirect Prompt Injection) است و پردازش آن متوقف شد."
                )

    # 2. Compute Title & Content
    user_prompt_clean = prompt.strip() if prompt else ""
    if doc_name and not user_prompt_clean:
        smart_title = f"خلاصه {doc_name}"
        user_msg_content = f"[File: {doc_name}]\n\nبررسی و خلاصه‌سازی فایل"
    elif doc_name:
        smart_title = generate_smart_title(user_prompt_clean)
        user_msg_content = f"[File: {doc_name}]\n\n{user_prompt_clean}"
    else:
        smart_title = generate_smart_title(user_prompt_clean)
        user_msg_content = user_prompt_clean

    # 3. Fetch or create session with Admin-configured system model & Admin global system prompt
    active_model = get_system_model(db)
    global_system_prompt = get_system_prompt(db)
    sess = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()

    if not sess:
        sess = ChatSession(
            id=session_id,
            user_id=current_user.id,
            title=smart_title,
            model_name=active_model,
            system_prompt=system_prompt or global_system_prompt
        )
        db.add(sess)
        db.commit()
        db.refresh(sess)
    else:
        sess.model_name = active_model
        if not sess.system_prompt:
            sess.system_prompt = global_system_prompt
        if sess.title in ["New Chat", "گفتگوی جدید", "New Conversation"]:
            sess.title = smart_title
            db.commit()
    
    active_system_prompt = system_prompt if (system_prompt and system_prompt.strip()) else (sess.system_prompt or global_system_prompt)

    # 3.1 Prioritize selected skill (via skill_id or prompt slash trigger) or load active skills
    selected_skill = None
    if skill_id:
        selected_skill = db.query(Skill).filter(Skill.id == skill_id).first()
    elif user_prompt_clean:
        skill_tag_match = re.match(r'^(?:\[(?:مهارت|Skill):\s*([^\]]+)\]|/([\w\u0600-\u06FF\-_]+))\s*', user_prompt_clean)
        if skill_tag_match:
            target_name = (skill_tag_match.group(1) or skill_tag_match.group(2)).strip()
            escaped_target = security_service.escape_sql_like(target_name)
            selected_skill = db.query(Skill).filter(Skill.name.ilike(f"%{escaped_target}%")).first()

    if selected_skill:
        skills_block = f"\n\n### 🎯 مهارت تخصصی منتخب کاربر ({selected_skill.name}):\n{selected_skill.content.strip()}"
        active_system_prompt += skills_block
    else:
        active_skills = get_active_skills(db)
        if active_skills:
            skills_blocks = ["\n\n### دستورالعمل‌ها و مهارت‌های تخصصی فعال (Active Skills):"]
            for sk in active_skills:
                skills_blocks.append(f"\n\n#### مهارت: {sk.name}\n{sk.content.strip()}")
            active_system_prompt += "".join(skills_blocks)

    # 4. Store User Message in DB
    user_msg = ChatMessage(
        session_id=sess.id,
        user_id=current_user.id,
        role="user",
        content=user_msg_content,
        has_attachment=bool(doc_name),
        attachment_name=doc_name
    )
    db.add(user_msg)
    sess.updated_at = datetime.datetime.utcnow()
    db.commit()

    # 4. Prepare Context from Message History (Memory)
    history_messages = [
        {"role": m.role, "content": m.content}
        for m in sess.messages
        if m.id != user_msg.id
    ]

    ref_prompts = get_reference_prompts(db)
    file_summary_tpl = ref_prompts.get("file_summary_prompt")
    file_question_tpl = ref_prompts.get("file_question_prompt")

    context_messages = ollama_service.build_context_messages(
        history_messages=history_messages,
        current_prompt=prompt,
        system_prompt=active_system_prompt,
        attached_document_text=doc_text,
        attached_document_name=doc_name,
        file_summary_template=file_summary_tpl,
        file_question_template=file_question_tpl
    )

    client_ip = request.client.host if request.client else "127.0.0.1"
    start_time = time.time()
    user_id_val = current_user.id
    username_val = current_user.username

    user_export_intent = detect_export_intent(user_prompt_clean)

    # Register in Request Queue
    ticket_id = await request_queue.enter_queue(user_id_val, username_val)

    async def event_generator():
        full_response_text = []
        try:
            # 5. Handle Queue Waiting & Acquire Slot
            async for queue_status in request_queue.acquire_slot(ticket_id):
                if await request.is_disconnected():
                    return
                if queue_status["status"] == "waiting":
                    yield f"data: {json.dumps({'queue_status': 'waiting', 'position': queue_status['position'], 'total_queued': queue_status.get('total_queued', 1), 'message': queue_status['message']})}\n\n"
                elif queue_status["status"] == "active":
                    yield f"data: {json.dumps({'queue_status': 'active', 'message': queue_status['message']})}\n\n"
                    break

            # 6. Stream Chat with Ollama
            async for chunk_str in ollama_service.stream_chat(context_messages, model=active_model):
                if await request.is_disconnected():
                    break

                chunk_data = json.loads(chunk_str)
                if "error" in chunk_data:
                    yield f"data: {json.dumps({'error': chunk_data['error']})}\n\n"
                    break
                
                token = chunk_data.get("token", "")
                if token:
                    full_response_text.append(token)
                    yield f"data: {json.dumps({'token': token, 'title': sess.title, 'done': False})}\n\n"
                
                if chunk_data.get("done", False):
                    yield f"data: {json.dumps({'token': '', 'title': sess.title, 'done': True, 'export_intent': user_export_intent})}\n\n"
                    break
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            await request_queue.release_slot(ticket_id)

        latency = int((time.time() - start_time) * 1000)
        final_text = "".join(full_response_text)

        # 7. Save Assistant Message & Prompt Log & Calculate Daily Token Quota
        from app.database import SessionLocal
        bg_db = SessionLocal()
        try:
            prompt_tokens_est = int(len(user_msg_content.split()) * 1.3) + 2
            resp_tokens_est = int(len(final_text.split()) * 1.3) + 2 if final_text else 0
            total_tokens_consumed = prompt_tokens_est + resp_tokens_est

            db_user = bg_db.query(User).filter(User.id == user_id_val).first()
            if db_user:
                check_and_reset_user_daily_tokens(db_user, bg_db)
                db_user.tokens_used += total_tokens_consumed

            if final_text.strip():
                asst_msg = ChatMessage(
                    session_id=sess.id,
                    user_id=user_id_val,
                    role="assistant",
                    content=final_text,
                    tokens=resp_tokens_est
                )
                bg_db.add(asst_msg)

            prompt_log = PromptLog(
                user_id=user_id_val,
                session_id=sess.id,
                username_display=db_user.username if db_user else "user",
                auth_type="web",
                model=active_model,
                prompt=user_msg_content,
                response=final_text,
                prompt_tokens=prompt_tokens_est,
                response_tokens=resp_tokens_est,
                latency_ms=latency,
                ip_address=client_ip,
                status="success" if final_text.strip() else "error"
            )
            bg_db.add(prompt_log)
            bg_db.commit()

            if db_user:
                yield f"data: {json.dumps({'tokens_used': db_user.tokens_used, 'token_quota': db_user.token_quota, 'update_stats': True, 'export_intent': user_export_intent})}\n\n"

        except Exception:
            bg_db.rollback()
        finally:
            bg_db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/export")
def export_chat_post(
    req: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return handle_export(
        format_type=req.format,
        content=req.content,
        session_id=req.session_id,
        message_id=req.message_id,
        title=req.title,
        db=db,
        current_user=current_user
    )

@router.get("/export")
def export_chat_get(
    format: str = Query("docx", description="Export format: docx or xlsx"),
    session_id: Optional[str] = Query(None),
    message_id: Optional[int] = Query(None),
    title: Optional[str] = Query(None),
    content: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return handle_export(
        format_type=format,
        content=content,
        session_id=session_id,
        message_id=message_id,
        title=title,
        db=db,
        current_user=current_user
    )

def handle_export(
    format_type: str,
    content: Optional[str],
    session_id: Optional[str],
    message_id: Optional[int],
    title: Optional[str],
    db: Session,
    current_user: User
):
    export_content = content
    doc_title = title or "گزارش تحلیلی بورس کالا"

    if not export_content:
        if message_id:
            msg = db.query(ChatMessage).filter(
                ChatMessage.id == message_id,
                ChatMessage.user_id == current_user.id
            ).first()
            if not msg:
                raise HTTPException(status_code=404, detail="پیام مورد نظر یافت نشد.")
            export_content = msg.content
        elif session_id:
            session_id = security_service.validate_session_id(session_id)
            sess = db.query(ChatSession).filter(
                ChatSession.id == session_id,
                ChatSession.user_id == current_user.id
            ).first()
            if not sess:
                raise HTTPException(status_code=404, detail="گفتگوی مورد نظر یافت نشد.")
            doc_title = title or sess.title
            
            # Combine conversation messages
            parts = []
            for m in sess.messages:
                prefix = "👤 **پرسش کاربر:**\n" if m.role == "user" else "🤖 **پاسخ دستیار هوشمند:**\n"
                parts.append(f"{prefix}{m.content}\n")
            export_content = "\n\n---\n\n".join(parts)

    if not export_content or not export_content.strip():
        raise HTTPException(status_code=400, detail="محتوایی برای تولید خروجی فایل وجود ندارد.")

    # Strip thinking blocks from export content so internal thoughts are never included in Word or Excel files
    export_content = re.sub(r'<think>[\s\S]*?<\/think>', '', export_content, flags=re.IGNORECASE).strip()
    export_content = re.sub(r'<think>[\s\S]*$', '', export_content, flags=re.IGNORECASE).strip()

    if not export_content:
        raise HTTPException(status_code=400, detail="محتوایی برای تولید خروجی فایل وجود ندارد.")

    format_clean = format_type.lower().replace(".", "").strip()
    clean_title = re.sub(r'[\/\\:*?"<>|]', '_', doc_title).strip() or "گزارش_تحلیلی"

    if format_clean in ["xlsx", "excel"]:
        file_bytes = export_to_xlsx(export_content, title=doc_title)
        filename = f"{clean_title}.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else: # default docx
        file_bytes = export_to_docx(export_content, title=doc_title)
        filename = f"{clean_title}.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    encoded_filename = quote(filename)
    headers = {
        "Content-Disposition": f"attachment; filename=\"report.{format_clean}\"; filename*=UTF-8''{encoded_filename}",
        "Access-Control-Expose-Headers": "Content-Disposition"
    }

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers=headers
    )

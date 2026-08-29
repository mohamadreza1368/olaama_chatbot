from app.queue_service import request_queue
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db, User, ChatSession, ChatMessage, PromptLog, get_system_model, set_system_model, get_system_prompt, set_system_prompt, get_reference_prompts, set_reference_prompts, reset_reference_prompts, check_and_reset_user_daily_tokens
from app.auth import get_current_admin, hash_password
from app.ollama_service import ollama_service
from app.cleanup_service import cleanup_old_records
from app.config import settings

router = APIRouter(prefix="/api/admin", tags=["Admin Panel"])

class CreateUserReq(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4)
    role: str = "user"
    token_quota: int = 50000

class UpdateUserStatusReq(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None
    token_quota: Optional[int] = None
    tokens_used: Optional[int] = None

class UpdateReferencePromptsReq(BaseModel):
    system_prompt: Optional[str] = None
    file_summary_prompt: Optional[str] = None
    file_question_prompt: Optional[str] = None

class UpdateSystemPromptReq(BaseModel):
    system_prompt: str

class UpdateModelReq(BaseModel):
    model_name: str

@router.get("/system-settings")
async def get_system_settings(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    current_model = get_system_model(db)
    current_prompt = get_system_prompt(db)
    detected_models = await ollama_service.list_models()
    queue_stats = await request_queue.get_queue_stats()
    return {
        "active_model": current_model,
        "system_prompt": current_prompt,
        "available_models": detected_models,
        "queue_stats": queue_stats
    }

@router.get("/prompts")
def get_prompts(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return get_reference_prompts(db)

@router.post("/prompts")
def update_prompts(req: UpdateReferencePromptsReq, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    set_reference_prompts(
        db,
        system_prompt=req.system_prompt,
        file_summary_prompt=req.file_summary_prompt,
        file_question_prompt=req.file_question_prompt
    )
    return {"message": "پرامپت‌های مرجع با موفقیت به‌روزرسانی شدند", "prompts": get_reference_prompts(db)}

@router.post("/prompts/reset")
def reset_prompts(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    reset_reference_prompts(db)
    return {"message": "تمامی پرامپت‌ها به مقادیر پیش‌فرض بازنشانی شدند", "prompts": get_reference_prompts(db)}

@router.post("/system-settings/prompt")
def update_system_prompt(req: UpdateSystemPromptReq, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    set_system_prompt(db, req.system_prompt.strip())
    return {"message": "سیستم پرامپت سراسری با موفقیت به‌روزرسانی شد", "system_prompt": req.system_prompt.strip()}

@router.post("/system-settings/model")
def update_system_model(req: UpdateModelReq, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    set_system_model(db, req.model_name.strip())
    return {"message": "مدل پیش‌فرض سیستم با موفقیت تغییر یافت", "active_model": req.model_name.strip()}

@router.get("/stats")
def get_admin_stats(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    total_users = db.query(User).count()
    total_sessions = db.query(ChatSession).count()
    total_messages = db.query(ChatMessage).count()
    total_logs = db.query(PromptLog).count()
    
    avg_latency = db.query(func.avg(PromptLog.latency_ms)).scalar() or 0

    return {
        "total_users": total_users,
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "total_logs": total_logs,
        "avg_latency_ms": round(float(avg_latency), 1),
        "retention_days": settings.RETENTION_DAYS
    }

@router.get("/users")
def list_users(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    users = db.query(User).order_by(User.id.asc()).all()
    results = []
    for u in users:
        check_and_reset_user_daily_tokens(u, db)
        msg_count = len(u.messages)
        sess_count = len(u.sessions)
        log_count = len(u.prompt_logs)
        results.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "is_active": u.is_active,
            "token_quota": u.token_quota,
            "tokens_used": u.tokens_used,
            "session_count": sess_count,
            "message_count": msg_count,
            "log_count": log_count,
            "created_at": u.created_at.isoformat()
        })
    return results

@router.get("/users/{user_id}/details")
def get_user_details(user_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    check_and_reset_user_daily_tokens(user, db)

    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    
    logs = db.query(PromptLog).filter(PromptLog.user_id == user_id).order_by(PromptLog.created_at.desc()).limit(50).all()

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "token_quota": user.token_quota,
            "tokens_used": user.tokens_used,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat()
        },
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "model_name": s.model_name,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
                "message_count": len(s.messages)
            }
            for s in sessions
        ],
        "recent_logs": [
            {
                "id": l.id,
                "model": l.model,
                "auth_type": l.auth_type,
                "prompt_preview": (l.prompt[:80] + "...") if len(l.prompt) > 80 else l.prompt,
                "prompt_full": l.prompt,
                "response_full": l.response,
                "latency_ms": l.latency_ms,
                "created_at": l.created_at.isoformat()
            }
            for l in logs
        ]
    }

@router.get("/users/{user_id}/sessions/{session_id}")
def get_user_session_messages(
    user_id: int,
    session_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    sess = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == user_id
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found for this user")
    
    return {
        "id": sess.id,
        "title": sess.title,
        "model_name": sess.model_name,
        "created_at": sess.created_at.isoformat(),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "has_attachment": m.has_attachment,
                "attachment_name": m.attachment_name,
                "tokens": m.tokens,
                "created_at": m.created_at.isoformat()
            }
            for m in sess.messages
        ]
    }

@router.post("/users")
def create_user_by_admin(req: CreateUserReq, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    clean_username = req.username.strip()
    existing = db.query(User).filter(User.username == clean_username).first()
    if existing:
        raise HTTPException(status_code=400, detail="این نام کاربری قبلاً ثبت شده است.")
    
    # 1. Create User
    new_user = User(
        username=clean_username,
        password_hash=hash_password(req.password),
        role=req.role if req.role in ["admin", "user"] else "user",
        token_quota=req.token_quota if req.token_quota > 0 else 50000,
        tokens_used=0,
        last_token_reset_date=datetime.date.today(),
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": f"کاربر {new_user.username} با موفقیت ایجاد شد",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "role": new_user.role,
            "token_quota": new_user.token_quota,
            "tokens_used": new_user.tokens_used
        },
        "credentials": {
            "username": new_user.username,
            "password": req.password,
            "token_quota": new_user.token_quota,
            "role": new_user.role
        }
    }

@router.patch("/users/{user_id}")
def update_user_status(user_id: int, req: UpdateUserStatusReq, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.role is not None and req.role in ["admin", "user"]:
        user.role = req.role
    if req.token_quota is not None:
        user.token_quota = req.token_quota
    if req.tokens_used is not None:
        user.tokens_used = req.tokens_used
    
    db.commit()
    return {
        "message": "اطلاعات کاربر به‌روزرسانی شد",
        "id": user.id,
        "is_active": user.is_active,
        "role": user.role,
        "token_quota": user.token_quota,
        "tokens_used": user.tokens_used
    }

@router.post("/users/{user_id}/reset-daily-tokens")
def reset_daily_tokens(user_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.tokens_used = 0
    user.last_token_reset_date = datetime.date.today()
    db.commit()
    return {"message": f"توکن‌های امروز کاربر {user.username} با موفقیت ریست شد", "tokens_used": 0}

@router.get("/logs")
def list_prompt_logs(
    search: Optional[str] = None,
    auth_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    query = db.query(PromptLog)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter((PromptLog.prompt.like(s)) | (PromptLog.username_display.like(s)) | (PromptLog.response.like(s)))
    if auth_type:
        query = query.filter(PromptLog.auth_type == auth_type)
    
    total = query.count()
    logs = query.order_by(PromptLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    items = [
        {
            "id": l.id,
            "username": l.username_display,
            "auth_type": l.auth_type,
            "model": l.model,
            "prompt_preview": (l.prompt[:100] + "...") if len(l.prompt) > 100 else l.prompt,
            "prompt_full": l.prompt,
            "response_preview": (l.response[:120] + "...") if (l.response and len(l.response) > 120) else (l.response or ""),
            "response_full": l.response or "",
            "latency_ms": l.latency_ms,
            "prompt_tokens": l.prompt_tokens,
            "response_tokens": l.response_tokens,
            "ip_address": l.ip_address,
            "status": l.status,
            "created_at": l.created_at.isoformat()
        }
        for l in logs
    ]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items
    }

@router.post("/cleanup")
def trigger_cleanup(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = cleanup_old_records(db, retention_days=settings.RETENTION_DAYS)
    return {"message": "پاکسازی با موفقیت انجام شد", "details": result}

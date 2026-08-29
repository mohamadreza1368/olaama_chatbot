from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db, User, ApiKey, get_system_model, check_and_reset_user_daily_tokens
from app.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    clean_username = req.username.strip()
    user = db.query(User).filter(User.username == clean_username).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="نام کاربری یا کلمه عبور وارد شده نادرست است.")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="این حساب کاربری توسط مدیر سیستم غیرفعال شده است.")

    check_and_reset_user_daily_tokens(user, db)

    token = create_access_token({"sub": user.username, "role": user.role})
    
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=60 * 60 * 24 * 7,
        samesite="lax"
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "token_quota": user.token_quota,
            "tokens_used": user.tokens_used
        }
    }

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"message": "با موفقیت خارج شدید"}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_and_reset_user_daily_tokens(current_user, db)
    sys_model = get_system_model(db)
    remaining = (current_user.token_quota - current_user.tokens_used) if current_user.token_quota > 0 else 999999
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "token_quota": current_user.token_quota,
        "tokens_used": current_user.tokens_used,
        "remaining_tokens": max(0, remaining),
        "system_model": sys_model,
        "created_at": current_user.created_at.isoformat()
    }

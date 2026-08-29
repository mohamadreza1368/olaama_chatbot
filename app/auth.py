import datetime
import hashlib
import secrets
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Security, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db, User, ApiKey

security_bearer = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: datetime.timedelta = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

def generate_api_key() -> tuple[str, str, str]:
    """
    Generates a new API key.
    Returns (raw_key, key_prefix, key_hash)
    """
    raw_random = secrets.token_hex(20)
    raw_key = f"sk-ollama-{raw_random}"
    key_prefix = raw_key[:14] + "..."
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return raw_key, key_prefix, key_hash

def hash_raw_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()

def get_current_user(
    request: Request,
    bearer: HTTPAuthorizationCredentials = Security(security_bearer),
    db: Session = Depends(get_db)
) -> User:
    token = None
    if bearer and bearer.credentials:
        token = bearer.credentials
    elif "access_token" in request.cookies:
        token = request.cookies.get("access_token")
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("sub")
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user

def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

class AuthContext:
    def __init__(self, user: User, auth_type: str, api_key: ApiKey = None):
        self.user = user
        self.auth_type = auth_type  # "jwt" or "api_key"
        self.api_key = api_key

def get_auth_context(
    request: Request,
    bearer: HTTPAuthorizationCredentials = Security(security_bearer),
    x_api_key: str = Security(api_key_header),
    db: Session = Depends(get_db)
) -> AuthContext:
    """
    Authenticates either via JWT Bearer / Cookie OR via X-API-Key / Bearer sk-ollama-...
    """
    # 1. Check API Key header
    raw_api_key = x_api_key
    if not raw_api_key and bearer and bearer.credentials and bearer.credentials.startswith("sk-"):
        raw_api_key = bearer.credentials

    if raw_api_key:
        key_hash = hash_raw_key(raw_api_key)
        api_key_obj = db.query(ApiKey).filter(ApiKey.key_hash == key_hash, ApiKey.is_active == True).first()
        if not api_key_obj:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API Key")
        
        user = db.query(User).filter(User.id == api_key_obj.user_id, User.is_active == True).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Associated user inactive or not found")
        
        # Update last used timestamp
        api_key_obj.last_used_at = datetime.datetime.utcnow()
        db.commit()
        return AuthContext(user=user, auth_type="api_key", api_key=api_key_obj)

    # 2. Check JWT Bearer or Cookie
    token = None
    if bearer and bearer.credentials and not bearer.credentials.startswith("sk-"):
        token = bearer.credentials
    elif "access_token" in request.cookies:
        token = request.cookies.get("access_token")

    if token:
        payload = decode_access_token(token)
        if payload and "sub" in payload:
            user = db.query(User).filter(User.username == payload["sub"], User.is_active == True).first()
            if user:
                return AuthContext(user=user, auth_type="jwt", api_key=None)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid JWT token or X-API-Key required",
        headers={"WWW-Authenticate": "Bearer or X-API-Key"}
    )

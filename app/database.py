import datetime
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Date, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(50), primary_key=True, index=True)
    value = Column(String(255), nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="user", nullable=False)  # "admin" or "user"
    token_quota = Column(Integer, default=50000, nullable=False)  # Daily token limit
    tokens_used = Column(Integer, default=0, nullable=False)  # Tokens consumed today
    last_token_reset_date = Column(Date, default=datetime.date.today, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="user", cascade="all, delete-orphan")
    prompt_logs = relationship("PromptLog", back_populates="user", cascade="all, delete-orphan")

class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(100), default="Default Key", nullable=False)
    key_prefix = Column(String(16), nullable=False)
    key_hash = Column(String(64), unique=True, index=True, nullable=False)  # SHA-256 hash
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="api_keys")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), default="New Chat", nullable=False)
    system_prompt = Column(Text, default="", nullable=True)
    model_name = Column(String(100), default="qwen:0.5b", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    has_attachment = Column(Boolean, default=False)
    attachment_name = Column(String(255), nullable=True)
    tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)

    session = relationship("ChatSession", back_populates="messages")
    user = relationship("User", back_populates="messages")

class PromptLog(Base):
    __tablename__ = "prompt_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), nullable=True)
    session_id = Column(String(36), nullable=True)
    username_display = Column(String(64), default="anonymous", nullable=False)
    auth_type = Column(String(20), default="web", nullable=False)
    model = Column(String(100), nullable=False)
    prompt = Column(Text, nullable=False)
    response = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, default=0)
    response_tokens = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    ip_address = Column(String(45), default="127.0.0.1")
    status = Column(String(20), default="success")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)

    user = relationship("User", back_populates="prompt_logs")

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful, accurate, and intelligent AI assistant. "
    "Respond in the same language the user is speaking (e.g. Persian or English). "
    "Format your answers with clean Markdown and code blocks where appropriate."
)

DEFAULT_FILE_SUMMARY_PROMPT = (
    "کاربر فایل «{filename}» را بدون سوال خاصی ارسال کرده است.\n"
    "دستورالعمل اجباری برای شما:\n"
    "۱. فایل را با دقت تمام مطالعه، تحلیل و بررسی کن.\n"
    "۲. یک خلاصه کامل، بسیار خوانا، ساختاریافته و زیبا به زبان فارسی با ساختار زیر تولید کن:\n"
    "   - 📋 **موضوع و هدف کلی سند/فایل**\n"
    "   - 📌 **نکات کلیدی، سرفصل‌ها و بخش‌های اصلی**\n"
    "   - 📊 **داده‌ها، ارقام، جدول‌ها یا آمارهای مهم (در صورت وجود)**\n"
    "   - 💡 **نتیجه‌گیری و جمع‌بندی نهایی**\n"
    "۳. در پایان با بیانی محترمانه اعلام کن که در صورت نیاز به جزئیات بیشتر یا پاسخ به سوال خاصی درباره این فایل، در خدمت هستی."
)

DEFAULT_FILE_QUESTION_PROMPT = (
    "درخواست یا سوال مشخص کاربر درباره فایل «{filename}»:\n"
    "{prompt}\n\n"
    "(لطفاً بر اساس محتوای فایل به طور دقیق، کامل و ساختاریافته پاسخ بده)"
)

def get_system_prompt(db: SessionLocal) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "system_prompt").first()
    if setting and setting.value:
        return setting.value
    return DEFAULT_SYSTEM_PROMPT

def set_system_prompt(db: SessionLocal, prompt: str):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "system_prompt").first()
    if not setting:
        setting = SystemSetting(key="system_prompt", value=prompt, description="Global system prompt for all users")
        db.add(setting)
    else:
        setting.value = prompt
    db.commit()

def get_reference_prompts(db: SessionLocal) -> dict:
    sys_prompt = get_system_prompt(db)
    
    sum_setting = db.query(SystemSetting).filter(SystemSetting.key == "file_summary_prompt").first()
    file_summary_prompt = sum_setting.value if (sum_setting and sum_setting.value) else DEFAULT_FILE_SUMMARY_PROMPT

    q_setting = db.query(SystemSetting).filter(SystemSetting.key == "file_question_prompt").first()
    file_question_prompt = q_setting.value if (q_setting and q_setting.value) else DEFAULT_FILE_QUESTION_PROMPT

    return {
        "system_prompt": sys_prompt,
        "file_summary_prompt": file_summary_prompt,
        "file_question_prompt": file_question_prompt,
        "default_system_prompt": DEFAULT_SYSTEM_PROMPT,
        "default_file_summary_prompt": DEFAULT_FILE_SUMMARY_PROMPT,
        "default_file_question_prompt": DEFAULT_FILE_QUESTION_PROMPT
    }

def set_reference_prompts(db: SessionLocal, system_prompt: str = None, file_summary_prompt: str = None, file_question_prompt: str = None):
    if system_prompt is not None:
        set_system_prompt(db, system_prompt.strip())
    
    if file_summary_prompt is not None:
        setting = db.query(SystemSetting).filter(SystemSetting.key == "file_summary_prompt").first()
        if not setting:
            setting = SystemSetting(key="file_summary_prompt", value=file_summary_prompt.strip(), description="Default prompt for files without user question")
            db.add(setting)
        else:
            setting.value = file_summary_prompt.strip()
            
    if file_question_prompt is not None:
        setting = db.query(SystemSetting).filter(SystemSetting.key == "file_question_prompt").first()
        if not setting:
            setting = SystemSetting(key="file_question_prompt", value=file_question_prompt.strip(), description="Default prompt for files with user question")
            db.add(setting)
        else:
            setting.value = file_question_prompt.strip()

    db.commit()

def reset_reference_prompts(db: SessionLocal):
    set_system_prompt(db, DEFAULT_SYSTEM_PROMPT)
    set_reference_prompts(db, 
        system_prompt=DEFAULT_SYSTEM_PROMPT, 
        file_summary_prompt=DEFAULT_FILE_SUMMARY_PROMPT, 
        file_question_prompt=DEFAULT_FILE_QUESTION_PROMPT
    )

def get_system_model(db: SessionLocal) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
    if setting and setting.value:
        return setting.value
    return settings.DEFAULT_MODEL

def set_system_model(db: SessionLocal, model_name: str):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
    if not setting:
        setting = SystemSetting(key="active_model", value=model_name, description="Global active Ollama model")
        db.add(setting)
    else:
        setting.value = model_name
    db.commit()

def check_and_reset_user_daily_tokens(user: User, db: SessionLocal):
    today = datetime.date.today()
    if user.last_token_reset_date != today:
        user.tokens_used = 0
        user.last_token_reset_date = today
        db.commit()

def migrate_schema():
    with engine.connect() as conn:
        try:
            cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()]
            if cols:
                if "token_quota" not in cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN token_quota INTEGER DEFAULT 50000")
                if "tokens_used" not in cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN tokens_used INTEGER DEFAULT 0")
                if "last_token_reset_date" not in cols:
                    conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN last_token_reset_date DATE DEFAULT '{datetime.date.today().isoformat()}'")
        except Exception:
            pass

        try:
            msg_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(chat_messages)").fetchall()]
            if msg_cols and "tokens" not in msg_cols:
                conn.exec_driver_sql("ALTER TABLE chat_messages ADD COLUMN tokens INTEGER DEFAULT 0")
        except Exception:
            pass

        try:
            key_info = conn.exec_driver_sql("PRAGMA table_info(api_keys)").fetchall()
            for col in key_info:
                if col[1] == "user_id" and col[3] == 1:
                    conn.exec_driver_sql("CREATE TABLE IF NOT EXISTS api_keys_new (id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(100) NOT NULL, key_prefix VARCHAR(16) NOT NULL, key_hash VARCHAR(64) NOT NULL UNIQUE, is_active BOOLEAN NOT NULL, created_at DATETIME NOT NULL, last_used_at DATETIME, FOREIGN KEY(user_id) REFERENCES users(id))")
                    conn.exec_driver_sql("INSERT INTO api_keys_new SELECT id, user_id, name, key_prefix, key_hash, is_active, created_at, last_used_at FROM api_keys")
                    conn.exec_driver_sql("DROP TABLE api_keys")
                    conn.exec_driver_sql("ALTER TABLE api_keys_new RENAME TO api_keys")
                    break
        except Exception:
            pass

        conn.commit()

def init_db():
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    db = SessionLocal()
    try:
        setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
        if not setting:
            setting = SystemSetting(key="active_model", value=settings.DEFAULT_MODEL, description="Global active Ollama model")
            db.add(setting)
            db.commit()
    finally:
        db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

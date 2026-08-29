import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "Ollama AI Assistant and Admin Hub"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./chatbot.db")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "super-secret-jwt-key-change-in-production-2026")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "qwen:0.5b")
    DEFAULT_ADMIN_USERNAME: str = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
    DEFAULT_ADMIN_PASSWORD: str = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
    RETENTION_DAYS: int = int(os.getenv("RETENTION_DAYS", "10")) # Purge messages and logs older than 10 days
    MAX_MEMORY_MESSAGES: int = int(os.getenv("MAX_MEMORY_MESSAGES", "12")) # Number of past messages in memory
    UPLOAD_MAX_BYTES: int = 15 * 1024 * 1024 # 15 MB max file size

settings = Settings()

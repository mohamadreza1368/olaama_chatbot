import os
from pathlib import Path
from pydantic import BaseModel

# Locate project root directory
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    if ENV_PATH.exists():
        load_dotenv(dotenv_path=ENV_PATH, override=True)
    else:
        load_dotenv(override=True)
except ImportError:
    if ENV_PATH.exists():
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"\'')
                    os.environ[key] = val

class Settings(BaseModel):
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Ollama AI Assistant and Admin Hub")
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./chatbot.db")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "super-secret-jwt-key-change-in-production-2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))

    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "vllm").lower()

    _raw_vllm = os.getenv("VLLM_BASE_URL", os.getenv("LLM_BASE_URL", "http://127.0.0.1:8005"))
    VLLM_BASE_URL: str = _raw_vllm if _raw_vllm.startswith(("http://", "https://")) else f"http://{_raw_vllm}"
    VLLM_API_KEY: str = os.getenv("VLLM_API_KEY", "")

    _raw_ollama = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    OLLAMA_BASE_URL: str = _raw_ollama if _raw_ollama.startswith(("http://", "https://")) else f"http://{_raw_ollama}"
    DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "default")
    MAX_OUTPUT_TOKENS: int = int(os.getenv("MAX_OUTPUT_TOKENS", "8192"))

    # Admin credentials - supports both ADMIN_USERNAME and DEFAULT_ADMIN_USERNAME
    DEFAULT_ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", os.getenv("DEFAULT_ADMIN_USERNAME", "admin"))
    DEFAULT_ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123"))

    RETENTION_DAYS: int = int(os.getenv("RETENTION_DAYS", "10"))  # Purge messages and logs older than 10 days
    MAX_MEMORY_MESSAGES: int = int(os.getenv("MAX_MEMORY_MESSAGES", "12"))  # Number of past messages in memory
    UPLOAD_MAX_BYTES: int = int(os.getenv("UPLOAD_MAX_BYTES", str(15 * 1024 * 1024)))  # 15 MB max file size

    @property
    def ADMIN_USERNAME(self) -> str:
        return self.DEFAULT_ADMIN_USERNAME

    @property
    def ADMIN_PASSWORD(self) -> str:
        return self.DEFAULT_ADMIN_PASSWORD

settings = Settings()

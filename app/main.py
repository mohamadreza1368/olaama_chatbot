import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db, SessionLocal, User
from app.auth import hash_password
from app.cleanup_service import cleanup_old_records
from app.ollama_service import ollama_service
from app.routers import auth_router, chat_router, api_router, admin_router

async def background_cleanup_loop():
    """Background worker that performs 10-day retention cleanup once every 24 hours."""
    while True:
        try:
            await asyncio.sleep(60 * 60 * 24)  # 24 hours
            db = SessionLocal()
            try:
                res = cleanup_old_records(db, retention_days=settings.RETENTION_DAYS)
                print(f"[Auto-Retention] Cleanup completed: {res}")
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Auto-Retention Error] {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Initialize DB tables
    init_db()
    print("[DB] SQLite database initialized.")

    # 2. Seed Default Admin User if not exists
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == settings.DEFAULT_ADMIN_USERNAME).first()
        if not admin_user:
            admin_user = User(
                username=settings.DEFAULT_ADMIN_USERNAME,
                password_hash=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
                role="admin",
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            print(f"[Security] Default Admin created: username='{settings.DEFAULT_ADMIN_USERNAME}', password='{settings.DEFAULT_ADMIN_PASSWORD}'")
        else:
            if admin_user.role != "admin":
                admin_user.role = "admin"
                db.commit()

        # 3. Initial retention cleanup on startup
        cleanup_stats = cleanup_old_records(db, retention_days=settings.RETENTION_DAYS)
        print(f"[Startup] Retention check: {cleanup_stats}")
    finally:
        db.close()

    # 4. Check Ollama status
    is_ollama_alive = await ollama_service.check_health()
    if is_ollama_alive:
        models = await ollama_service.list_models()
        print(f"[Ollama] Connected successfully! Available models: {models}")
    else:
        print(f"[Ollama Warning] Could not connect to Ollama at {settings.OLLAMA_BASE_URL}. Ensure Ollama is running.")

    # 5. Start background retention task
    cleanup_task = asyncio.create_task(background_cleanup_loop())
    
    yield
    
    cleanup_task.cancel()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Ollama Local Chatbot with Memory, Sessions, Auto RTL/LTR, Document Support, API Keys, and Admin Auditing",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

current_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(current_dir, "static")
templates_dir = os.path.join(current_dir, "templates")

app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

# Register Routers
app.include_router(auth_router.router)
app.include_router(chat_router.router)
app.include_router(api_router.router)
app.include_router(admin_router.router)

@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": getattr(settings, "PROJECT_NAME", "Ollama AI Assistant and Admin Hub"),
        "environment": getattr(settings, "ENVIRONMENT", os.getenv("ENVIRONMENT", "production"))
    }

@app.get("/")
def serve_home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"app_title": settings.PROJECT_NAME}
    )

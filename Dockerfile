# ==============================================================================
# Dockerfile for Ollama AI Assistant & Admin Hub (FastAPI + SQLite)
# Optimized for lightweight deployment, high security, and offline usage
# ==============================================================================

FROM python:3.10-slim

# Python & Environment Configuration
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    DATABASE_URL=sqlite:///./chatbot.db \
    OLLAMA_BASE_URL=http://host.docker.internal:11434

WORKDIR /app

# Install minimal OS dependencies for container health checks
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies (cached layer)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy Application Code & Assets
COPY app /app/app
COPY skills /app/skills
COPY README.md /app/README.md

# Pre-create database placeholder if volume is not initially mounted
RUN touch /app/chatbot.db

# Expose FastAPI Web Port
EXPOSE 8000

# Health check to ensure service readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start the application with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


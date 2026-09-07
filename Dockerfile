# ==============================================================================
# Dockerfile for Ollama AI Assistant & Admin Hub (FastAPI + SQLite)
# Optimized for lightweight deployment, high security, and offline usage
# ==============================================================================

ARG DOCKER_MIRROR=dockehub.ime.co.ir/
FROM ${DOCKER_MIRROR}python:3.10-slim

# Python & Environment Configuration
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    DATABASE_URL=sqlite:///./chatbot.db \
    OLLAMA_BASE_URL=http://host.docker.internal:11434

WORKDIR /app

# Configure internal Debian repository mirror (IME repository)
ARG DEBIAN_MIRROR=https://linux.repo.ime.co.ir/repository/debian

RUN if [ -n "$DEBIAN_MIRROR" ]; then \
        echo 'Acquire::https::Verify-Peer "false";' > /etc/apt/apt.conf.d/99insecure-https && \
        echo 'Acquire::https::Verify-Host "false";' >> /etc/apt/apt.conf.d/99insecure-https && \
        echo 'Acquire::Check-Valid-Until "false";' >> /etc/apt/apt.conf.d/99insecure-https && \
        find /etc/apt/ -type f \( -name "*.list" -o -name "*.sources" \) -exec sed -i \
            -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
            -e "s|https://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
            -e "s|http://security.debian.org/debian-security|${DEBIAN_MIRROR}|g" \
            -e "s|https://security.debian.org/debian-security|${DEBIAN_MIRROR}|g" \
            -e "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" \
            -e "s|https://deb.debian.org|${DEBIAN_MIRROR}|g" \
            {} + ; \
    fi && \
    apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies (cached layer)
ARG PIP_INDEX_URL=""
COPY requirements.txt /app/requirements.txt
RUN if [ -n "$PIP_INDEX_URL" ]; then \
        pip config set global.index-url "$PIP_INDEX_URL" && \
        pip config set global.trusted-host "$(echo "$PIP_INDEX_URL" | awk -F/ '{print $3}' | cut -d: -f1)"; \
    fi && \
    pip install --no-cache-dir -r requirements.txt

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


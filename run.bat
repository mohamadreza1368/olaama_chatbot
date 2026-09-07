@echo off
title Ollama AI Assistant & Admin Hub
echo ========================================================
echo   Starting Ollama AI Assistant Server...
echo ========================================================
echo.

REM Check if python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH.
    pause
    exit /b 1
)

echo Loading configuration from .env...
echo Starting FastAPI server at http://127.0.0.1:8000 (configurable via HOST/PORT in .env)
echo Admin credentials configured in .env (Default: admin / admin123)
echo.
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause

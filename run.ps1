# Ollama AI Assistant Server Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting Ollama AI Assistant Server..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Web Interface: http://127.0.0.1:8000 (configurable via HOST/PORT in .env)" -ForegroundColor Green
Write-Host "Admin Credentials configured in .env (Default: admin / admin123)" -ForegroundColor Yellow
Write-Host ""

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

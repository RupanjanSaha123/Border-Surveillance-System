# BSC-DOP Backend Startup Script for Windows

Write-Host "🛡  Starting BSC-DOP Backend..." -ForegroundColor Cyan

# 1. Check if python is installed
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "✗ Python not found. Please install Python 3.10+." -ForegroundColor Red
    exit 1
}

# 2. Create virtual environment if it doesn't exist
if (!(Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# 3. Install dependencies
Write-Host "Installing/Updating dependencies..." -ForegroundColor Yellow
.\venv\Scripts\pip install -r requirements.txt

# 4. Run the server
Write-Host "🚀 Server starting on http://localhost:8000" -ForegroundColor Green
Write-Host "API Documentation: http://localhost:8000/api/docs" -ForegroundColor Green
.\venv\Scripts\uvicorn main:app --reload --port 8000

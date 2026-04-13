@echo off
REM Korean Trading Agents - Windows Quick Start
REM Usage: start.bat

echo.
echo ============================================
echo   Korean Trading Agents - 시작
echo ============================================
echo.

REM 가상환경 확인
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] .venv가 없습니다. 먼저 setup.py를 실행하세요:
    echo         python setup.py
    pause
    exit /b 1
)

REM .env 확인
if not exist ".env" (
    echo [ERROR] .env 파일이 없습니다. .env.example을 복사하고 API 키를 입력하세요.
    pause
    exit /b 1
)

echo [1/2] 백엔드 서버 시작 중... (http://localhost:8000)
start "Backend" cmd /k ".venv\Scripts\python.exe run_server.py"

timeout /t 2 >nul

echo [2/2] 프론트엔드 서버 시작 중... (http://localhost:3000)
if exist "frontend\package.json" (
    start "Frontend" cmd /k "cd frontend && npm run dev"
) else (
    echo [WARN] frontend 디렉토리가 없습니다.
)

echo.
echo 서버 시작 완료!
echo   백엔드: http://localhost:8000
echo   프론트: http://localhost:3000
echo   API Doc: http://localhost:8000/docs
echo.

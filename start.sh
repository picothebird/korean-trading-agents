#!/bin/bash
# Korean Trading Agents - macOS/Linux Quick Start
# Usage: ./start.sh

set -e
echo ""
echo "============================================"
echo "  Korean Trading Agents - 시작"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 가상환경 확인
if [ ! -f ".venv/bin/python" ]; then
    echo "[ERROR] .venv가 없습니다. 먼저 setup.py를 실행하세요:"
    echo "        python setup.py"
    exit 1
fi

# .env 확인
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[WARN] .env를 .env.example에서 생성했습니다. API 키를 입력해주세요."
fi

echo "[1/2] 백엔드 서버 시작... (http://localhost:8000)"
.venv/bin/python run_server.py &
BACKEND_PID=$!

sleep 2

echo "[2/2] 프론트엔드 서버 시작... (http://localhost:3000)"
if [ -f "frontend/package.json" ]; then
    cd frontend && npm run dev &
    FRONTEND_PID=$!
    cd ..
fi

echo ""
echo "서버 시작 완료!"
echo "  백엔드: http://localhost:8000"
echo "  프론트: http://localhost:3000"
echo "  API Doc: http://localhost:8000/docs"
echo ""
echo "종료: Ctrl+C"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait

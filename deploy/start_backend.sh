#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Korean Trading Agents — 프로덕션 백엔드 런처 (macOS)
# launchd / 수동 실행 모두에서 동일하게 동작.
# ─────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
  echo "[FATAL] .venv 없음. python3.12 -m venv .venv 후 requirements 설치하세요." >&2
  exit 1
fi
if [[ ! -f "$ROOT/.env" ]]; then
  echo "[FATAL] .env 없음. .env.example 참고해 생성하세요." >&2
  exit 1
fi

# 운영 모드: reload 끄고, gunicorn 대신 uvicorn 단일 워커 (SSE 세션 상태가 in-memory 라 멀티워커 금지).
exec "$ROOT/.venv/bin/python" -m uvicorn backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  --proxy-headers \
  --forwarded-allow-ips '127.0.0.1' \
  --log-level info \
  >> "$LOG_DIR/backend.out.log" 2>> "$LOG_DIR/backend.err.log"

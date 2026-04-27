#!/usr/bin/env bash
# 헬스체크 (cron / 수동용). 실패 시 종료코드 != 0.
set -e
URL="${1:-http://127.0.0.1:8000/health}"
RESP=$(curl -fsS --max-time 5 "$URL")
echo "$RESP" | grep -q '"status":"ok"' || { echo "[ERR] unhealthy: $RESP" >&2; exit 1; }
echo "OK $URL — $RESP"

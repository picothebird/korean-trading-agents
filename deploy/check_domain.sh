#!/usr/bin/env bash
# 도메인 ktagent.me 가 Cloudflare 네임서버로 위임됐고 'Active' 상태인지 폴링.
# - 네임서버 2개가 *.ns.cloudflare.com 으로 잡혔는지 확인
# - 잡혔으면 종료코드 0
set -e
DOMAIN="ktagent.me"
echo "[CHECK] $DOMAIN 의 현재 네임서버:"
NS_OUT=$(dig +short NS "$DOMAIN" @1.1.1.1 | sort)
echo "$NS_OUT" | sed 's/^/  /'
if echo "$NS_OUT" | grep -q 'ns.cloudflare.com'; then
  echo "[OK] Cloudflare 네임서버로 위임됨. 다음: ./deploy/setup_tunnel.sh"
  exit 0
fi
echo "[WAIT] 아직 Cloudflare 네임서버가 아님. Namecheap → Cloudflare NS 변경 필요."
exit 1

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Cloudflare Tunnel 자동 설치 스크립트 (api.ktagent.me)
# 사전조건: Cloudflare 대시보드에서 ktagent.me 가 'Active' 상태.
# 실행: ./deploy/setup_tunnel.sh
# ─────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="ktagent.me"
SUBDOMAIN="api.${DOMAIN}"
TUNNEL_NAME="kta"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CF_DIR="$HOME/.cloudflared"
CONFIG_PATH="$CF_DIR/config.yml"
PLIST_SRC="$PROJECT_ROOT/deploy/com.cloudflare.kta-tunnel.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.cloudflare.kta-tunnel.plist"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

mkdir -p "$CF_DIR"

# ── 1) cert.pem 확인 (없으면 로그인 안내) ────────────────
if [[ ! -f "$CF_DIR/cert.pem" ]]; then
  yellow "[1/6] Cloudflare 로그인 필요. 브라우저가 열리면 ktagent.me 를 선택하세요."
  cloudflared tunnel login
fi
green "[1/6] cert.pem 확인됨."

# ── 2) 터널 생성 (이미 있으면 재사용) ────────────────────
if cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$TUNNEL_NAME"; then
  yellow "[2/6] 터널 '$TUNNEL_NAME' 이미 존재. 재사용."
else
  yellow "[2/6] 터널 '$TUNNEL_NAME' 생성 중..."
  cloudflared tunnel create "$TUNNEL_NAME"
fi

# UUID 추출
TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n{print $1; exit}')
if [[ -z "${TUNNEL_UUID:-}" ]]; then
  red "[FATAL] 터널 UUID 를 가져오지 못했습니다."
  exit 1
fi
green "[2/6] UUID = $TUNNEL_UUID"

# ── 3) DNS 라우팅 ───────────────────────────────────────
yellow "[3/6] DNS 라우팅: $SUBDOMAIN"
if ! cloudflared tunnel route dns "$TUNNEL_NAME" "$SUBDOMAIN" 2>&1 | tee /tmp/cf_route.log; then
  if grep -qi "already exists" /tmp/cf_route.log; then
    yellow "    이미 등록되어 있어 건너뜁니다."
  else
    red "    DNS 라우팅 실패. 위 메시지 확인."
    exit 1
  fi
fi

# ── 4) config.yml 작성 ──────────────────────────────────
yellow "[4/6] $CONFIG_PATH 생성"
cat > "$CONFIG_PATH" <<YAML
tunnel: $TUNNEL_UUID
credentials-file: $CF_DIR/$TUNNEL_UUID.json

originRequest:
  connectTimeout: 10s
  noTLSVerify: false
  keepAliveTimeout: 600s
  http2Origin: false
  disableChunkedEncoding: false

ingress:
  - hostname: $SUBDOMAIN
    service: http://127.0.0.1:8000
    originRequest:
      noHappyEyeballs: true
      connectTimeout: 10s
      tlsTimeout: 10s
      tcpKeepAlive: 30s
      keepAliveConnections: 100
      keepAliveTimeout: 600s
  - service: http_status:404
YAML
green "[4/6] config.yml 작성 완료"

# ── 5) LaunchAgent 등록 ─────────────────────────────────
yellow "[5/6] LaunchAgent 설치"
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"
launchctl bootout "gui/$(id -u)/com.cloudflare.kta-tunnel" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
green "[5/6] launchd 부트스트랩 완료"

# ── 6) 헬스 검증 ────────────────────────────────────────
yellow "[6/6] $SUBDOMAIN/health 응답 대기 (최대 60초)"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$SUBDOMAIN/health" >/tmp/cf_health.json 2>/dev/null; then
    green "[OK] $(cat /tmp/cf_health.json)"
    echo
    green "✅ 완료. 다음 단계: Vercel 에 NEXT_PUBLIC_API_URL=https://$SUBDOMAIN 등록."
    exit 0
  fi
  sleep 2
done
red "[FAIL] 60초 내 응답 없음. 로그: tail -f $PROJECT_ROOT/logs/cloudflared.err.log"
exit 1

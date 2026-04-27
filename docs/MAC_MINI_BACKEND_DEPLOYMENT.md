# Mac mini 백엔드 + Vercel 프론트 배포 가이드

> 대상 환경 — macOS 26.3.1 (arm64, Apple Silicon), Mac mini 상시가동.
> 프론트는 Vercel(Next.js 16 / React 19), 백엔드는 Mac mini의 FastAPI/uvicorn.
> 외부 노출은 **Cloudflare Tunnel(`cloudflared`)** 사용 — 공유기 포트포워딩·고정 IP 불필요.

이 문서대로 따라가면 다음이 완성됩니다.

1. Mac mini 부팅 시 백엔드 자동 시작 (launchd)
2. Cloudflare Tunnel 로 `https://api.<your-domain>` 공개 (TLS 자동)
3. Vercel 의 Next.js 가 `NEXT_PUBLIC_API_URL` 로 그 도메인을 호출
4. 모든 비밀키는 `.env`(서버) · Vercel Env(프론트)에만 존재

---

## 0. 디렉터리 구조 (이번 세팅으로 생성된 자산)

```
korean-trading-agents/
├─ .env                        # 로컬/맥미니 비밀키 (커밋 금지)
├─ .venv/                      # Python 3.12 가상환경 (커밋 금지)
├─ deploy/
│  ├─ start_backend.sh                     # 운영 런처 (uvicorn 단일 워커)
│  ├─ healthcheck.sh                       # /health 폴링 스크립트
│  ├─ com.picothebird.kta-backend.plist    # 백엔드 LaunchAgent
│  ├─ com.cloudflare.kta-tunnel.plist      # 터널 LaunchAgent
│  ├─ cloudflared-config.example.yml       # ~/.cloudflared/config.yml 예시
│  └─ vercel.env.example                   # Vercel 에 등록할 ENV 키 목록
└─ frontend/
   └─ vercel.json              # 프레임워크/리전/보안 헤더
```

---

## 1. 사전 준비 (Mac mini, 1회)

### 1.1 Homebrew + 런타임

```bash
# Homebrew 가 없으면
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install python@3.12 cloudflared
# Node 는 본 머신에 v25.3.0 설치돼 있음 (Vercel 에서 빌드되므로 로컬은 선택)
```

### 1.2 가상환경 + 의존성

```bash
cd ~/korean-trading-agents
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -U pip wheel setuptools
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install 'git+https://github.com/FinanceData/FinanceDataReader.git'
```

> ⚠️ Python **3.13** 은 `numpy==1.26.4` 휠 부재로 설치 실패. 반드시 **3.12** 사용.

### 1.3 `.env` 작성

루트의 `.env.example` 복사 후 키 채우기. 본 세팅에서는 `.env` 가 이미 생성돼 있으며 다음 두 키는 자동 생성된 안전 값입니다.

| 키 | 출처 | 비고 |
|---|---|---|
| `OPENAI_API_KEY` | https://platform.openai.com | 필수 |
| `DART_API_KEY`   | https://opendart.fss.or.kr | 무료, 1일 10,000건 |
| `BOK_API_KEY`    | https://ecos.bok.or.kr/api/ | 무료 |
| `KIS_APP_KEY/SECRET/ACCOUNT_NO` | 한국투자증권 OpenAPI | `KIS_MOCK=true` 권장 시작 |
| `MONGODB_URI`    | Atlas 또는 로컬 | §4 참조 |
| `APP_SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` | 자동생성됨 |
| `DATA_ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | 자동생성됨 |
| `ALLOWED_ORIGINS` | 운영 시 Vercel 도메인 추가 | 콤마 구분 |
| `DEBUG` | 운영은 `false` | false 면 빈 보안키 부팅 거부 |

---

## 2. 로컬(맥미니) 스모크 테스트

```bash
.venv/bin/python run_server.py
# 다른 터미널
curl -s http://127.0.0.1:8000/health
# → {"status":"ok","version":"0.1.0"}
```

본 세팅에서 검증 완료. `Ctrl+C` 로 종료.

> **알려진 이슈**: `/openapi.json` 와 `/docs` 는 `AuthRegisterRequest` Pydantic 정의의
> forward-ref 로 인해 500 을 반환합니다(레포 자체 버그). `/health` · 실제 API 호출에는 영향 없음.
> 별도 패치 전까지 `/docs` 의존 모니터링은 사용 금지.

---

## 3. 백엔드 자동 시작 (launchd)

본 머신에는 이미 등록 완료. 설치 명령:

```bash
cp deploy/com.picothebird.kta-backend.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.picothebird.kta-backend.plist
launchctl kickstart -k gui/$(id -u)/com.picothebird.kta-backend
launchctl print gui/$(id -u)/com.picothebird.kta-backend | grep -E 'state|pid'
# → state = running / pid = ...
```

운영 정책:

- `deploy/start_backend.sh` 가 `--workers 1` 로 실행 — **반드시 1 워커 유지**
  (SSE 큐가 in-memory 이라 멀티워커 시 세션이 깨짐).
- 로그: `logs/backend.{out,err}.log`, `logs/launchd.{out,err}.log`.
- `KeepAlive { Crashed=true }` 라 크래시 시 10초 후 자동 재시작.

업데이트 절차:

```bash
git pull
.venv/bin/pip install -r requirements.txt    # 변경 시
launchctl kickstart -k gui/$(id -u)/com.picothebird.kta-backend
deploy/healthcheck.sh
```

---

## 4. MongoDB 옵션

### 4.1 Atlas (권장, 운영)

1. https://cloud.mongodb.com 무료 M0 클러스터 생성
2. Network Access — Mac mini 의 공인 IP 또는 `0.0.0.0/0` (Vercel은 백엔드만 거치므로 후자 가능, 단 DB 인증으로 제한)
3. Database User 생성 후 `MONGODB_URI=mongodb+srv://user:pw@cluster.../?retryWrites=true&w=majority` 형식으로 `.env` 에 기입.

### 4.2 로컬 MongoDB

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
# .env: MONGODB_URI=mongodb://127.0.0.1:27017
```

> MongoDB 미설정이어도 부팅은 됨(`/api/health/mongo` 는 `connected:false`). 사용자 시스템 / 트레이드 이력은 비활성.

---

## 5. Cloudflare Tunnel — 외부 공개

Mac mini 에 공인 IP·포트포워딩 없이 HTTPS 도메인을 부여합니다.

### 5.1 도메인 준비

이미 보유한 도메인을 Cloudflare 네임서버로 이전(무료 플랜 가능). 본 가이드에선 `api.example.com` 을 백엔드 전용 서브도메인으로 사용한다고 가정.

### 5.2 터널 생성 (1회)

```bash
cloudflared tunnel login                 # 브라우저에서 도메인 인증
cloudflared tunnel create kta            # → ~/.cloudflared/<UUID>.json 생성, UUID 출력
cloudflared tunnel route dns kta api.example.com
```

### 5.3 config 작성

`~/.cloudflared/config.yml` 을 `deploy/cloudflared-config.example.yml` 기반으로 생성하고 UUID/도메인을 치환.

### 5.4 LaunchAgent 등록

```bash
cp deploy/com.cloudflare.kta-tunnel.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cloudflare.kta-tunnel.plist
curl -s https://api.example.com/health
# → {"status":"ok","version":"0.1.0"}
```

### 5.5 SSE 운영 주의

- 분석 스트리밍(`/api/analyze/stream/*`)은 SSE — Cloudflare 무료 플랜의 100초 idle 타임아웃에 영향 없음(서버가 keepalive ping 송신).
- 본 config 의 `keepAliveTimeout: 600s` 는 분석 1회 평균 60~180초를 충분히 커버.

---

## 6. CORS / 보안 마무리

`.env` 에서:

```
DEBUG=false
ALLOWED_ORIGINS=https://your-app.vercel.app,https://www.your-domain.com
```

→ 백엔드 재시작:

```bash
launchctl kickstart -k gui/$(id -u)/com.picothebird.kta-backend
```

Cloudflare 대시보드 권장 설정:

- **SSL/TLS Mode**: Full (strict)
- **WAF → Rate limiting**: `/api/analyze/start`, `/api/kis/order` 분당 10회 (백엔드 slowapi 와 이중화)
- **Access (선택)**: `/api/kis/*` 는 본인 이메일 OTP 게이트로 한 번 더 보호

---

## 7. 프론트엔드 (Vercel)

### 7.1 프로젝트 임포트

1. Vercel 대시보드 → New Project → GitHub 의 `picothebird/korean-trading-agents` 선택
2. **Root Directory**: `frontend`
3. Framework: Next.js (자동 감지)
4. Region: `icn1` (서울, `vercel.json` 에 명시)

### 7.2 Environment Variables

`deploy/vercel.env.example` 의 키를 Production / Preview / Development 모두에 등록.

```
NEXT_PUBLIC_API_URL = https://api.example.com
```

> 추가 키가 늘어나면 반드시 **Sensitive** 토글을 켜서 빌드 로그 노출을 막을 것.

### 7.3 배포 트리거

- `main` 브랜치 push → Production 배포
- PR 생성 → Preview 배포 (Preview 도 같은 백엔드 호출. 격리하려면 별도 `NEXT_PUBLIC_API_URL` Preview 값 지정)

### 7.4 배포 후 검증 체크리스트

- [ ] `https://your-app.vercel.app` 진입 → 로그인 화면 정상 렌더
- [ ] 브라우저 DevTools Network 탭에서 `https://api.example.com/api/...` 요청이 200/201
- [ ] `/api/analyze/stream/*` SSE 연결이 60초 이상 유지
- [ ] CORS 에러 없음 (없다면 `.env` 의 `ALLOWED_ORIGINS` 확인)

---

## 8. 운영 모니터링

| 항목 | 명령 |
|---|---|
| 백엔드 상태 | `launchctl print gui/$(id -u)/com.picothebird.kta-backend \| grep state` |
| 헬스 폴링 | `deploy/healthcheck.sh https://api.example.com/health` |
| 백엔드 로그 | `tail -f logs/backend.err.log` |
| 터널 로그 | `tail -f logs/cloudflared.err.log` |
| Mongo 헬스 | `curl -s http://127.0.0.1:8000/api/health/mongo` |
| 포트 점유 | `lsof -nP -iTCP:8000 -sTCP:LISTEN` |

cron 예시 (`crontab -e`):

```
*/5 * * * * /Users/leesewang/korean-trading-agents/deploy/healthcheck.sh https://api.example.com/health || osascript -e 'display notification "KTA backend down" with title "KTA"'
```

---

## 9. 백업 / 시크릿 회전

- `.env` 는 1Password 또는 macOS Keychain 에 텍스트 항목으로 백업.
- `APP_SECRET_KEY` / `DATA_ENCRYPTION_KEY` 회전 시:
  1. 새 키 생성 → `.env` 교체
  2. 기존 `DATA_ENCRYPTION_KEY` 로 암호화된 KIS 토큰/사용자 데이터는 무효화 → 사용자 재로그인 필요
- Cloudflare Tunnel credentials JSON 은 `~/.cloudflared/<UUID>.json` — Time Machine 백업 폴더에서 제외하지 않도록 주의.

---

## 10. 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| `Address already in use` (포트 8000) | `lsof -nP -iTCP:8000 -sTCP:LISTEN` 후 `kill <PID>`. 보통 이전 dev 서버 잔존. |
| `numpy` 설치 실패 | Python 3.13 사용 중. **3.12** 로 venv 재생성. |
| `/openapi.json` 500 | 레포 자체의 Pydantic forward-ref 버그. `/docs` 사용 보류, 실서비스 영향 없음. |
| Vercel CORS 차단 | `.env` 의 `ALLOWED_ORIGINS` 에 정확한 https URL(슬래시 없이) 추가 후 백엔드 재시작. |
| SSE 가 30초에 끊김 | Cloudflare 프록시 옵션(주황 구름) 켜져 있는데 `keepAliveTimeout` 미설정. 본 config 적용 필요. |
| Mac mini 잠자기로 백엔드 죽음 | 시스템 설정 → 에너지 절약 → "절대 잠자기 안 함" 또는 `sudo pmset -c sleep 0`. |
| `KIS_MOCK=false` 로 바꾼 뒤 인증 실패 | 한투 OpenAPI 모의/실전 키가 분리됨. 실전 키 재발급 후 .env 갱신. |

---

## 11. 향후 개선 후보

- 멀티 워커 운영을 위해 SSE 세션 큐를 Redis(`brew install redis`) 로 외부화.
- `cloudflared` Access 정책으로 `/api/kis/*` 에 OTP 게이트.
- GitHub Actions 에서 `main` push 시 Mac mini 로 SSH 후 `git pull && launchctl kickstart` 자동화.
- 백엔드 메트릭 → Prometheus + Grafana(또는 Cloudflare Analytics) 연계.

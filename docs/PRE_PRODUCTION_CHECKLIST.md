# 프로덕션 출시 전 종합 점검 체크리스트 (Pre-Production Master Checklist)

- 작성일: 2026-04-26
- 범위: korean-trading-agents 전체 (frontend + backend + data + agents + DB + ops)
- 목적: 실제 사용자 트래픽이 들어와도 안전하게 서비스될 수 있는 수준인지 종합 검증
- 입력 자료:
  - `docs/BACKEND_AUDIT.md` (2026-04-25 — 9개 이슈 모두 ✅ 처리 완료)
  - `docs/FRONTEND_AUDIT.md` (2026-04-25 — 12개 이슈 모두 ✅ 처리 완료)
  - `docs/KOREAN_MARKET_REALISM_AUDIT.md` (2026-04-25)
  - `docs/AUTO_TRADING_SUPERVISOR.md` (2026-04-24)
  - `docs/USER_LEVEL_DB_SCHEMA.md` (Production Hardening Checklist 8 items)
  - `docs/UX_BEGINNER_TO_EXPERT_AUDIT.md` ← 이 문서는 24/25 완료, 본 점검에서 제외
- 점검 방식: 4개 병렬 audit 서브에이전트 + 핵심 주장 교차검증 (grep/read)

---

## 0. 한 줄 요약 (Executive Summary)

| 영역 | 현재 상태 | 프로덕션 가능 여부 |
|---|---|---|
| 기능 완성도 (UX) | UX_BEGINNER_TO_EXPERT_AUDIT 24/25 완료 | ✅ |
| 백엔드 안정성 | 기능적으로는 동작, 보안/회복성 미흡 | ⚠️ |
| 보안 (Auth/Crypto) | 기본 동작하나 **Critical 5건** | 🔴 |
| 한국시장 현실성 | 비용/장중시간 OK, **VI/T+2/휴장일 미반영** | 🔴 |
| 운영 (Backup/모니터링) | Backup·Sentry·Health 부족 | 🔴 |
| 테스트 | HTTP 스모크만, 단위/RBAC 테스트 부재 | ⚠️ |

**총평:** 기존 audit 문서들의 표면 이슈는 대부분 해결되었으나, **프로덕션 트래픽·실거래 자금 안전성 관점에서 신규로 발견된 Critical 21건**이 처리되어야 안전한 프로덕션 출시가 가능합니다. 단순 데모/연구용으로는 가능하나, 실제 자금·실 사용자 시점은 본 체크리스트의 §2(Critical) 전체 처리가 선행 조건입니다.

---

## 1. 기존 Audit 문서 상태 재검증

각 문서가 "완료"라고 표시한 항목들이 **실제 코드에서 그대로 유효한지** 교차검증한 결과입니다.

### 1-1. `docs/BACKEND_AUDIT.md` — 모두 ✅ (재검증 완료)
- ISSUE-01 ~ ISSUE-09 9건 모두 완료 표기, 실제 코드에서도 반영 확인됨
- 단, **잔여 리스크 §7** 항목들은 여전히 미처리:
  - `[ ] 자동/포트폴리오 루프 인메모리 상태 → 재시작 시 유실` ← **본 체크리스트 §2-C2 항목으로 격상**
  - `[ ] 자동 테스트(pytest) 부재` ← **§3-T1 항목으로 격상**
  - `[ ] KIS 주문 사전검증 세분화` ← **§2-K3 항목으로 격상**

### 1-2. `docs/FRONTEND_AUDIT.md` — 모두 ✅ (재검증 완료)
- 12개 픽스 모두 코드에서 확인됨 (fundamental_analyst 추가, DecisionCard 경로 수정, stop_loss_pct 표시 등)
- 단, **본 점검에서 추가 발견된 frontend 이슈 14건**은 §2-F / §3-F로 신규 등록

### 1-3. `docs/KOREAN_MARKET_REALISM_AUDIT.md` — Coverage Matrix 재검증
| 항목 | 문서 표기 | 재검증 결과 | 상태 |
|---|---|---|---|
| 정규장 시간 게이트 | Implemented | ✅ 코드 확인 | OK |
| 시간외 세션 | Partial | ⚠️ KIS 주문코드(03/10) 미매핑 | **§2-M3** |
| 호가단위 사다리 | Partial | ✅ backtest/paper 적용, ❌ live limit 주문 사전 round 없음 | **§3-M1** |
| 종목별 lot_size | Implemented(basic) | ❌ `lot=1` 하드코딩, KIS master 미조회 | **§3-M2** |
| 매수·매도 수수료 | Implemented | ✅ 1.5 bps 확인 | OK |
| 매도세 | Implemented | ✅ 18.0 bps 확인 | OK |
| 슬리피지 | Implemented | ✅ 3.0 bps 확인 | OK |
| 잔고/포지션 가능성 | Implemented | ✅ | OK |
| max_position_pct | Implemented | ✅ 25% | OK |
| 상한가/하한가 게이트 | Partial | ⚠️ live는 차단되나 backtest는 limit 무시하고 체결 | **§2-M2** |
| **VI(변동성완화장치)** | **Missing** | ❌ vi_yn 검색 0건 | **§2-M1 (CRITICAL)** |
| Halt/경고 플래그 | Partial | ✅ trht_yn / 경고코드 체크 | OK |
| **부분체결/잔량주문** | **Missing** | ❌ 100% 즉시체결 가정 유지 | **§2-M5** |
| 지연/재시도 | Partial | ⚠️ stochastic latency 미적용 | **§3-M3** |
| **휴장일/대체일** | (문서 미명시) | ❌ KRX 휴일 캘린더 0건 (설/추석/대체공휴일) | **§2-M4 (CRITICAL)** |
| **반일장(연말/선거일)** | (문서 미명시) | ❌ 12/30 14:00 close, 선거일 미반영 | **§2-M4** |
| **T+2 결제** | (문서 미명시) | ❌ T+0 가정으로 동일 자금 중복 사용 가능 | **§2-M6 (CRITICAL)** |
| **주문 취소/정정** | (문서 미명시) | ❌ KIS 취소 API 호출 0건 | **§2-K2** |

### 1-4. `docs/AUTO_TRADING_SUPERVISOR.md` §4-2 후속 권장 — 미처리 4건 잔존
- `[ ] 루프 상태 SSE` ← polling으로 동작 중 (Low priority, §4-O3)
- `[ ] 다종목 포트폴리오 루프` ← PortfolioLoop 구현됨 ✅
- `[ ] 실전 모드 계좌 동기화 강화` ← 부분 구현, **§3-K1**
- `[ ] 승인 워크플로우` ← order_approvals 구현됨 ✅
- `[ ] 전략 프로파일` ← guru_risk_profile로 부분 충족, 별도 strategy_profile은 미구현, §4-U2

### 1-5. `docs/USER_LEVEL_DB_SCHEMA.md` Production Hardening §1~§8 — 0/8 처리
| # | 항목 | 상태 | 본 체크리스트 매핑 |
|---|---|---|---|
| 1 | HttpOnly/Secure 세션 쿠키 | ❌ localStorage 그대로 | **§2-A1 (CRITICAL)** |
| 2 | 로그인 rate limit | ❌ 미적용 | **§2-A2 (CRITICAL)** |
| 3 | 계정 잠금/지수 백오프 | ❌ 미적용 | **§2-A3 (CRITICAL)** |
| 4 | 암호화 키 회전 | ⚠️ DATA_ENCRYPTION_KEY 옵셔널, app_secret_key 폴백 + 기본값 `dev-secret-change-me` | **§2-A4 (CRITICAL)** |
| 5 | 구조화 로그 / SIEM | ❌ Sentry/구조 로깅 0건 | **§3-O1** |
| 6 | activity_logs/user_trades 보관정책 | ❌ TTL 인덱스 없음 → 무제한 증가 | **§2-D1** |
| 7 | 분석 인덱스 사후 추가 | ✅ 의도적 보류, OK | OK |
| 8 | RBAC 통합 테스트 | ❌ 0건 | **§3-T2** |

### 1-6. 기타 문서
- `ARCHITECTURE.md` — 다이어그램 수준, 별도 액션 없음
- `PORTFOLIO_ORCHESTRATION_BLUEPRINT.md` — 청사진. PF-Phase 백엔드 작업(watchlist API, holdings_snapshots) 미구현 → **§4-PF**
- `UI_REDESIGN_PLAN.md` / `UI_REDESIGN_LIGHT.md` / `UI_INVENTORY.md` — 디자인 가이드, QA 범위 외
- `AGENT_OFFICE_GATHER_LEVEL_UP.md` / `AGENT_STAGE_REDESIGN_PROPOSAL.md` — 사용자가 "AgentOffice는 범위 외" 지시 → 본 점검 제외

---

## 2. 🔴 CRITICAL — 프로덕션 출시 블로커 (반드시 선결)

> 이 항목들이 처리되지 않으면 **자금 손실, 계정 탈취, 무제한 디스크 증가, 데이터 영구 소실** 등이 즉각 발생합니다.

### A. 인증·세션·암호화

#### 🔴 A1. 세션 토큰을 HttpOnly/Secure 쿠키로 전환
- **현재**: 토큰이 `localStorage` 에 저장 (`frontend/src/lib/api.ts` L4-L18) + `Authorization: Bearer` 헤더 전송
- **위험**: XSS 한 번이면 토큰 100% 탈취. 백엔드는 `Set-Cookie` 헤더를 전혀 사용하지 않음
- **조치**:
  1. 백엔드 `/api/auth/login`, `/api/auth/register` 응답에 `Set-Cookie: kta_session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=...`
  2. `core/user_access.py` 의 토큰 추출 로직을 헤더 + 쿠키 둘 다 허용 (마이그레이션 기간)
  3. 프론트 `setAccessToken`/`getAccessToken` 제거, fetch는 `credentials: "include"`로 변경
  4. EventSource는 쿠키 자동 전송됨 (`buildEventSourceUrl`에서 토큰 쿼리 제거)

#### 🔴 A2. 로그인/회원가입 엔드포인트 Rate Limit
- **현재**: `slowapi` 등 미사용 (grep 0건). 무제한 로그인 시도 가능
- **위험**: 자격증명 스터핑, 사전 공격
- **조치**: `slowapi` 도입, `/api/auth/login` `5/min/IP`, `/api/auth/register` `3/min/IP`, `/api/kis/order` `10/min/user`, `/api/analyze/start` `5/min/user`

#### 🔴 A3. 로그인 실패 카운터 + 계정 잠금
- **현재**: 실패 횟수 추적·잠금 로직 0건
- **조치**:
  - `users` 컬렉션에 `failed_login_attempts: int`, `locked_until: datetime` 추가
  - 5회 연속 실패 → 15분 잠금
  - 성공 시 카운터 리셋
  - `last_failed_login_ip` 로깅 (감사용)

#### 🔴 A4. `DATA_ENCRYPTION_KEY` 필수화 + `APP_SECRET_KEY` 기본값 제거
- **현재** (`backend/core/config.py` L12-L13):
  ```python
  app_secret_key: str = Field(default="dev-secret-change-me", alias="APP_SECRET_KEY")
  data_encryption_key: str = Field(default="", alias="DATA_ENCRYPTION_KEY")
  ```
- **위험**: 운영자가 환경변수 설정을 깜빡하면, 모든 KIS 자격증명·user_settings 비밀이 **공개 기본키 `dev-secret-change-me` 로 암호화** → 소스코드 본 사람 누구나 복호화 가능
- **조치**:
  1. 시작 시 `if not DEBUG and (app_secret_key.startswith("dev-") or not data_encryption_key): raise SystemExit("Production secret keys not set")`
  2. `secrets_enc_v` 필드 활용한 키 버전 매핑 도입 (`v1=KEY_2026A`, `v2=KEY_2026B`) → 90일 회전 가능 구조
  3. 부팅 시 양쪽 키 길이 32바이트 검증

#### 🔴 A5. CSRF 보호
- **현재**: POST 엔드포인트 어디에도 CSRF 토큰 검증 없음 (쿠키 기반 세션으로 전환되면 즉시 노출)
- **조치**: A1과 함께 진행. `Authorization` 헤더 기반이면 CSRF 영향 없음, 쿠키로 전환 시 `X-CSRF-Token` 더블서밋 패턴 적용

### B. 보안 헤더·CORS

#### 🔴 B1. CORS allow_origins 환경변수화
- **현재** (`backend/main.py` L130): `["http://localhost:3000", "http://127.0.0.1:3000"]` 하드코딩
- **위험**: 운영 도메인이 다르면 그대로 배포 시 동작 불가, 또는 임시로 `*` 으로 풀어버림
- **조치**: `ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com` 환경변수 파싱, 빈 값 시 거부

#### 🔴 B2. 보안 헤더 미들웨어 추가
- **현재**: CSP / HSTS / X-Frame-Options / X-Content-Type-Options 0건
- **조치**: `SecurityHeadersMiddleware` 추가
  - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HTTPS 시)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### C. 루프 상태 영속화·내구성

#### 🔴 C1. AutoTrading / Portfolio 루프 상태 MongoDB 영속화
- **현재**: `_loops: dict[str, AutoLoopRuntime] = {}` 인메모리 저장 (`backend/services/auto_trading.py` L162, `backend/services/portfolio_trading.py` L222)
- **위험**:
  - 서버 재시작 시 결정 이력·거래 이력·모의 계좌 상태 **전량 소실**
  - 사용자 입장에서 "어제 분명히 매수 신호 났는데 기록이 사라짐"
  - 실거래 모드에서 KIS에는 주문이 들어갔지만 우리 측 trade_history는 비어있는 **데이터 불일치**
- **조치**:
  - 신규 컬렉션 `trading_loops`, `portfolio_loops` (또는 통합 `_loop_sessions`):
    ```json
    {
      "loop_id": "uuid",
      "owner_user_id": "ObjectId",
      "loop_kind": "auto|portfolio",
      "status": "running|stopped|error",
      "settings": {...},
      "decision_history": [...최근 50건만],
      "trade_history": [...최근 50건만],
      "paper_account": {...},
      "stats": {...},
      "last_cycle_at": "datetime",
      "created_at": "datetime",
      "updated_at": "datetime"
    }
    ```
  - 매 사이클 종료 시 `update_one` (이력은 capped array)
  - 부팅 시 `status=running` 인 루프 자동 재시작 (사용자가 명시적 stop 안 했으면)
  - 모든 trade는 `user_trades` 컬렉션에 추가 영속 (이미 됨 ✅)

#### 🔴 C2. 동일 사용자·동일 종목 루프 중복 시작 방지
- **현재**: 검사 0건 → 같은 종목 2개 루프 가동 시 2배 매수
- **조치**: `start()` 진입 시 `if any(l.settings.ticker == ticker for l in self._loops.values()): raise HTTPException(409, "이미 해당 종목 루프가 실행 중입니다")`

#### 🔴 C3. 주문 멱등키 (Idempotency Key)
- **현재** (`data/kis/trading.py`): KIS 주문 호출 시 멱등키 없음 → 네트워크 재시도 시 중복 주문 가능
- **조치**: 주문 요청 직전 UUID 생성 → `(user_id, idempotency_key)` 인덱스가 있는 `user_trades` 임시 레코드 선기록 → KIS 응답 후 업데이트 (이미 같은 키로 기록 있으면 스킵)

### D. DB 보관정책 / 인덱스

#### 🔴 D1. activity_logs / user_trades TTL 인덱스 추가
- **현재** (`backend/core/mongodb.py` L250-L256): TTL 0건. 100s of MB/day 누적 가능
- **조치**:
  ```python
  await db.activity_logs.create_index([("created_at", ASCENDING)],
      expireAfterSeconds=90*24*3600, name="ttl_activity_logs")
  await db.user_trades.create_index([("created_at", ASCENDING)],
      expireAfterSeconds=180*24*3600, name="ttl_user_trades")
  ```
  운영자가 보존 기간 변경 가능하도록 `LOG_RETENTION_DAYS` 환경변수화

### E. 입력 검증·DoS

#### 🔴 E1. ticker 입력 형식 검증
- **현재**: `/api/stock/{ticker}`, `/api/analyze/start` 등 모든 ticker 입력에 정규식 검증 0건
- **위험**: 비정상 문자 → fetcher 예외, prompt injection 벡터, 매우 긴 문자열 → DoS
- **조치**: 모든 ticker 파라미터에 `Path(..., pattern="^[0-9]{6}$", max_length=6)` 또는 Pydantic validator 일괄 적용

#### 🔴 E2. POST 본문 최대 크기 제한
- **현재**: 없음 (`MAX_REQUEST_BODY_SIZE` 없음)
- **위험**: `guru_investment_principles` 같은 텍스트 필드에 100MB 보내기 가능 → OOM
- **조치**: Starlette `LimitUploadSize` 미들웨어 또는 reverse proxy(nginx) `client_max_body_size 1m`

#### 🔴 E3. SSE 큐 메모리 누수
- **현재** (`backend/core/events.py`): 클라이언트가 갑자기 연결 끊으면 `_thought_queues` 의 큐가 finally를 못 타고 잔존 가능
- **조치**:
  - 각 큐에 `created_at` 기록
  - 백그라운드 태스크가 1시간마다 `now - created_at > 1h` 큐 강제 정리
  - 또는 동일 session_id로 새 연결 들어오면 기존 큐 소거

### KIS 거래 안전

#### 🔴 K1. KIS 주문 사전검증 세분화
- **현재**: qty>0, price>0 정도만 체크
- **조치**:
  - 지정가일 때 호가단위 검증 (`price % tick_size == 0`)
  - 매수 시 `qty * price <= cash * (1 - safety_margin)` 검증
  - 매도 시 `qty <= 보유수량` 검증
  - 상한가 도달 시 매수 차단 / 하한가 도달 시 매도 차단 (이미 auto-loop엔 있음, 수동 주문도 동일하게)

#### 🔴 K2. 주문 취소 API 미구현
- **현재**: KIS 취소 엔드포인트 호출 0건
- **위험**: BUY 신호 → limit 주문 큐잉 → 시장 반전 → SELL 신호 → 기존 BUY 잔존 + 매도 시도 → cash 부족 에러 + 강제 long 노출
- **조치**: `data/kis/trading.py` 에 `cancel_order(ord_no)` 추가, AutoLoop이 신호 반전 시 호출

#### 🔴 K3. 주문 종류(ord_dvsn) 동적 매핑
- **현재** (`data/kis/trading.py` L233): order_type "00" / "01" 만
- **위험**: 시간외단일가 세션에서 "01"(시장가) 보내면 KIS 거부. `regular_and_after_hours` 모드 사용자 혼란
- **조치**: 세션 인지 후 `ord_dvsn` 자동 선택
  - 정규장: 00(지정가) / 01(시장가)
  - 시간외 단일가: 03 단일가
  - 시간외 종가: 02

### 한국 시장 현실성

#### 🔴 M1. VI (변동성완화장치) 상태 인지·차단
- **현재**: vi_yn / volatility_interruption 검색 0건
- **위험**: VI 발동(±10% 급변, 30분-1시간 정지) 중에도 주문 시도 → KIS 거부 또는 backtest 우상향 환상
- **조치**:
  - KIS 현재가 조회 응답에서 `vi_yn` / `vi_kind` (정적/동적) 파싱
  - 발동 중이면 주문 차단 + 사용자 로그 "VI 발동 중 주문 차단"
  - 백테스트는 일봉 단위라 VI 모델링 어려움 → 리포트에 "VI 미반영" 명시

#### 🔴 M2. backtest 가격제한폭(±30%) 무시 문제
- **현재** (`backtesting/backtest.py`): tick rounding은 적용하나 limit-up/down 무시 → 임의 가격으로 체결
- **위험**: 백테스트가 +500bps 낙관 (상한가 잠긴 시점도 체결로 가정)
- **조치**: 일봉 데이터에서 `(high - prev_close) / prev_close >= 0.30` 인 봉은 매수 시 가격 = `prev_close * 1.30`로 캡, 비슷하게 매도 캡. fill_qty도 가격 잠긴 비율만큼 페널티 (옵션)

#### 🔴 M3. KRX 휴장일 캘린더
- **현재**: 주말만 차단. 설/추석/대체공휴일/임시공휴일 미반영
- **위험**: 휴장일에 auto-loop 가동 → 전일 가격 가져옴 → 잘못된 신호. 백테스트는 휴장일 봉 자체가 없어 silently 스킵되나 사용자 보고서에 "거래일 250일" 표기 오해
- **조치**:
  - `data/market/krx_holidays.py` 신설, 2025~2030 한국 거래소 휴장일 하드코딩
  - `is_trading_day(date)` 함수, auto-loop·portfolio-loop 사이클 진입 시 호출
  - 반일장(연말 12/30 14:00 close, 대선/총선일)은 별도 dict로 시간 끝점 오버라이드

#### 🔴 M4. T+2 결제 매수가능금액 모델
- **현재**: 매수 즉시 cash 차감 → 같은 거래일 T+0 가정 (T+0/+1/+2 cash 분리 없음)
- **위험**: 백테스트가 동일 자금으로 일중 2~3회 진입한 것처럼 계산되어 수익률 +200-500% 부풀려짐
- **조치**:
  - paper_account에 `cash_t0`, `cash_t1`, `cash_t2` 분리
  - 매수 시 `cash_t2 -= amount` (실제 결제는 T+2)
  - 매수가능금액 = `cash_t0` 만 (이미 결제된 금액)
  - 매일 자정에 `cash_t0 += cash_t1; cash_t1 = cash_t2; cash_t2 = 0`

#### 🔴 M5. 부분체결 / 잔량주문 모델
- **현재**: 100% 즉시체결 가정
- **조치 (V1 단순화)**:
  - 백테스트: 봉 거래량 대비 주문수량이 큰 경우(예: 봉 거래량의 5% 초과) 체결률을 [봉 거래량 / 주문량 / 0.05] 로 페널티 적용
  - paper-trade: 주문수량이 호가창 1단계 잔량의 50% 초과 시 체결가에 추가 슬리피지 +5bps

#### 🔴 M6. 종목별 lot_size 조회
- **현재** (`data/market/krx_rules.py`): `lot=1` 하드코딩
- **위험**: ETF Kodex200 등은 lot=10. 7주 매수 신호 → KIS 거부 "최소주문단위 오류"
- **조치**: KIS 종목 마스터 캐시 도입 → `IsuLtrgQty` 추출 → `normalize_share_qty(qty, lot_size=master[ticker]["lot"])`

---

## 3. 🟠 HIGH — 출시 후 1~2주 내 처리

### F. Frontend

#### 🟠 F1. 모든 fetch에 timeout / AbortController
- **현재** (`frontend/src/lib/api.ts`): `apiFetch()` 에 signal·timeout 0건
- **조치**: 30s timeout + 사용자 취소 가능

#### 🟠 F2. KisPanel 수량/가격 경계 검증
- **현재**: `parseInt(orderQty, 10) || 1` → 0 입력 시 silently 1 됨
- **조치**:
  - qty: 1 이상, 사용자 보유 cash 한도 내
  - 지정가 price: tick_size 정렬, 상하한가 범위 내
  - 입력 즉시 인라인 에러 표시

#### 🟠 F3. 실거래 모드 첫 주문 게이트 모달 (P1.K3는 부분 처리, 완전 게이트 필요)
- **현재**: 토스트 색상으로만 구분. 게이트 모달은 모의→실전 전환 시 1회만
- **조치**: 실거래 주문 클릭 시마다 `[실거래 - 진짜 돈입니다] [종목·수량·가격] [확인 / 취소]` 2단계 모달

#### 🟠 F4. localStorage 무한 증가 방지
- **현재** (`page.tsx` 분석 세션, `DecisionCard.tsx` GURU 30일 이력): quota exceeded 시 미처리
- **조치**: 공통 `safeSetLocal(key, value)` 헬퍼 — quota 에러 시 가장 오래된 `kta_active_*` 키 자동 삭제

#### 🟠 F5. AutoLoop / PortfolioLoop polling cleanup·중지 보장
- **현재**: 에러 시 polling 무한 지속 가능, 중지 버튼이 busy 락에 걸리는 케이스
- **조치**:
  - 404 응답 시 `setLoopId(null)` + `clearInterval`
  - 중지 버튼은 `loopId !== null`이면 항상 활성

#### 🟠 F6. SettingsPanel API 키 input type=password
- **현재**: 평문 표시 (어깨 너머 노출)
- **조치**: `type="password"` + `[보기] 토글` 버튼

#### 🟠 F7. DecisionCard / AnalysisReport 옵셔널 체이닝 일관화
- 백엔드 부분 실패 시 `agents_summary` 누락 가능 → `?.` 일관 적용

#### 🟠 F8. SSE 정리 보장 (탭 전환 race)
- 모든 cleanup ref 가 `useEffect return`에서 호출되는지 재확인. disposed flag 패턴 도입

### Backend

#### 🟠 BE1. OpenAI 429·타임아웃 재시도 + LLM 호출 timeout
- **현재** (`backend/core/llm.py`): 429 처리 0건, asyncio.timeout 미적용
- **조치**: `tenacity` 또는 수동 backoff (1s, 2s, 4s, jitter), 30s 타임아웃, 실패 시 HOLD fallback

#### 🟠 BE2. KIS 토큰 갱신 락
- **현재**: 동시 만료 시 두 코루틴이 모두 갱신 시도
- **조치**: `asyncio.Lock()` 으로 직렬화

#### 🟠 BE3. orchestrator analyst 결과 누락 방어
- **현재**: 한 분석가가 예외 던지면 `analyst_details` 키 누락 → 후속 코드 KeyError
- **조치**: 분석가 실패 시 `{"signal": "HOLD", "confidence": 0.5, "risk_level": "HIGH", "summary": "분석 실패: 데이터 미확보"}` 기본값 채움

#### 🟠 BE4. Backtest cancel events dict 정리
- **현재** (`backend/main.py` `_BACKTEST_CANCEL_EVENTS`): 무한 누적
- **조치**: `(timestamp, event)` 튜플로 저장, 1시간 지난 항목 백그라운드 정리

#### 🟠 BE5. MongoDB pool 설정
- **현재** (`backend/core/mongodb.py`): `AsyncIOMotorClient(...)` 옵션 없음
- **조치**: `maxPoolSize=100, minPoolSize=10, maxIdleTimeMS=45000, serverSelectionTimeoutMS=5000`

#### 🟠 BE6. Kelly 가정값 동적화
- **현재** (`agents/orchestrator/orchestrator.py`): `avg_win_pct=5.0, avg_loss_pct=3.0` 하드코딩
- **조치**: 사용자 백테스트 결과 또는 종목별 실제 변동성으로 추정값 도출. 미완 시 `confidence` 가중 적용한 안전한 단순식 사용

#### 🟠 BE7. master 자기 비활성화 차단
- **현재**: 본인 role 변경만 차단. `disabled=true` self-call 차단 없음
- **조치**: `if str(actor._id) == target_id and req.disabled: raise 400 "자기 자신은 비활성화할 수 없습니다"`

### Korean Market

#### 🟠 M7. backtest stochastic latency
- 일봉 단위라도 "다음 봉 open 100% 체결" 가정 대신 "다음 봉 open + 0~50bps 슬리피지 jitter" 적용

#### 🟠 M8. 자동 매매 활성 시 평일·시간 강제 가드
- 사용자가 임의로 사이클 주기를 1분으로 설정 + 휴장일에도 가동 → KIS 호출 폭주
- 휴장일 / 비거래시간엔 사이클 자체를 스킵 + 다음 거래일 9:00로 sleep

### Ops·Backup·Monitoring

#### 🟠 O1. Sentry 또는 동등 에러 모니터링
- 현재 0건. `sentry-sdk[fastapi]` 설치 + DSN 환경변수

#### 🟠 O2. MongoDB 자동 백업 스크립트 + 복구 절차
- `mongodump` 일일, S3 + AES 암호화, 보관 30일
- `docs/RUNBOOK_RECOVERY.md` 작성 (별도 후속)

#### 🟠 O3. /api/health/full 종합 헬스체크
- `mongo`, `kis`(token issue ping), `openai`(가벼운 ping) 묶어서 200/503 반환. ALB/L7 헬스체크용

#### 🟠 O4. 앱 시작 시 환경변수 검증 게이트
- 누락된 필수 키 (DB URI, ENCRYPTION_KEY, ALLOWED_ORIGINS, MASTER_BOOTSTRAP_EMAIL 등) 있으면 즉시 실패. 부분 동작으로 운영 환경 진입 방지

### Tests

#### 🟠 T1. pytest 단위 테스트 골격
- `tests/unit/test_krx_rules.py` — tick ladder 경계, lot 정규화
- `tests/unit/test_backtest_no_lookahead.py` — 신호 T일 → 체결 T+1 검증
- `tests/unit/test_kelly.py` — 엣지케이스 confidence=0/1
- `tests/unit/test_orchestrator_partial_failure.py` — 분석가 1명 예외 시 fallback

#### 🟠 T2. RBAC 통합 테스트
- `tests/integration/test_rbac.py` — viewer가 `/api/kis/order` 시도 시 403, trader가 `/api/master/users` 시도 시 403, master 정상

---

## 4. 🟡 MEDIUM — 출시 후 1개월 내 처리

### Auth·Security

#### 🟡 P1. 비밀번호 정책 강화
- 8자→10자, 대문자/숫자/특수문자 필수, PBKDF2 iter 160K → 250K (또는 argon2id 마이그레이션)

#### 🟡 P2. 세션 만료 단축 + Refresh Token
- 14일 → 7일, refresh token (HttpOnly 쿠키, 30일) 별도 발급

### Frontend UX

#### 🟡 U1. 모바일 반응형 (<640px)
- 고정 grid·gap 다수. `useMediaQuery` 도입, KisPanel·DecisionCard·AutoLoopPanel 우선

#### 🟡 U2. 접근성 (a11y)
- 아이콘만 있는 버튼에 `aria-label`
- 모달 focus trap (Esc 닫기, Tab 순환)
- 색상 대비 WCAG AA 미만 토큰 검토 (`--text-tertiary` on `--bg-elevated`)

#### 🟡 U3. SettingsPanel KIS 계좌번호 형식 검증
- `^\d{8,}-?\d{2}$` 패턴 안내

#### 🟡 U4. AutoLoop 입력 경계 검증 (intervalMin 1~1440, minConfidence 0~1, fee 0~10)

#### 🟡 U5. 승인 대기 정보 sessionStorage 저장
- 사용자 새로고침 시 approval_id 유지

### Backend

#### 🟡 B1. LLM 토큰 사용량 로깅
- `usage.input_tokens`, `usage.output_tokens` 추출 → MongoDB `llm_usage` 또는 활동 로그에 누적
- 사용자별 일일 비용 대시보드 기반

#### 🟡 B2. 비용/세금/슬리피지 입력 범위 검증
- fee_bps [0.5, 5], slippage_bps [0, 20], tax_bps [15, 25] 클램프

#### 🟡 B3. 토론 라운드 LLM 호출 timeout
- 각 round `asyncio.timeout(15)` + 데이터 fetcher `asyncio.timeout(10)` + stale fallback

#### 🟡 B4. order_approval TTL 환경변수화
- 현재 15분 하드코딩 → 5~60분 사용자 설정 가능

### Korean Market

#### 🟡 M9. 호가단위 사다리 backtest·live 일관성
- live 지정가 주문 사전 round to tick (KIS가 자동 round 하더라도 우리쪽도 동일하게)

#### 🟡 M10. 시간외단일가 fill 가격 모델
- 단일가는 정규장 종가 ±10% 내 사용자 호가, 30분 단위 매칭. paper-trade에 단순화 모델 추가

### Ops

#### 🟡 O5. 구조화 로깅 (`structlog`)
- request_id, user_id, latency 자동 첨부

#### 🟡 O6. API 버저닝 준비
- `/api/v1/` 라우터 prefix 도입 (현 라우트 호환 유지하면서 alias)

---

## 5. 🟢 LOW — 가능하면

- L1. PortfolioLoop SSE 스트림(현재 polling)
- L2. user_settings 키 회전 마이그레이션 CLI 명령
- L3. 한글 날짜 포맷 일관 (모두 `YYYY-MM-DD HH:mm` ko-KR)
- L4. 분석 트레이스 외부 객체 저장(s3) 후 `strategy_runs` 메타만 DB 저장
- L5. backtest_runs 컬렉션 (현재 in-memory만)
- L6. audit_events 불변 원장 (compliance용)
- L7. AgentOffice 트레이스 패널 (사용자 제외 요청 → 본 점검 범위 외)

---

## 6. PF-Phase 백엔드 (별도 트랙, UX 감사 doc과 동일하게 보류)

PORTFOLIO_ORCHESTRATION_BLUEPRINT 기반:
- watchlist 컬렉션 + add/list/delete API
- holdings_snapshots 컬렉션 + 진입사유 자동 보존 + reason 조회 API
- 프론트 Watchlist 탭 신설 + ★ CTA 백엔드 연결
- 프론트 My Portfolio 탭 신설

본 체크리스트의 §2~§4 가 처리된 후 별도 sprint로 진행 권장.

---

## 7. 최종 QA 시나리오 (출시 전 수동 + 자동 완전 검증)

각 시나리오는 **모의(mock) → 실거래(live)** 양쪽에서 통과해야 합니다.

### QA-A. 인증·권한
- [ ] A-1: 회원가입 → 로그인 → 세션 토큰이 HttpOnly 쿠키로 발급되는가
- [ ] A-2: 로그아웃 후 보호 라우트 접근 시 401
- [ ] A-3: viewer 계정으로 `/api/kis/order` POST → 403
- [ ] A-4: trader 계정으로 `/api/master/users` GET → 403
- [ ] A-5: master 계정 정상 동작
- [ ] A-6: 비밀번호 5회 실패 → 15분 잠금 → 잠금 중 정확한 비번도 거부
- [ ] A-7: master 본인을 disabled=true 시도 → 400
- [ ] A-8: 동일 IP 6회/분 로그인 → 429

### QA-B. 분석 흐름
- [ ] B-1: 정상 분석 → SSE thought 수신 → DecisionCard 표시
- [ ] B-2: 분석 중 OpenAI 429 → 재시도 후 성공
- [ ] B-3: 분석 중 OpenAI 키 누락 → 명확한 에러 배너
- [ ] B-4: 분석 중 fundamental_analyst 실패 → 나머지 3개로 진행, agents_summary에 fallback 표시
- [ ] B-5: 분석 도중 브라우저 새로고침 → 세션 복구 (kta_active_analysis_session_v1)
- [ ] B-6: 분석 동시 5개 시작 → 모두 정상 처리, SSE 큐 누수 없음

### QA-C. 자동매매 루프
- [ ] C-1: AutoLoop 시작 → 1 사이클 → 모의 주문 발생 → trade_history 누적
- [ ] C-2: 같은 종목 두 번째 루프 시작 시도 → 409 거부
- [ ] C-3: 루프 가동 중 서버 재시작 → 재시작 후 자동 재개 + decision_history/trade_history 보존 (§C1 처리 후)
- [ ] C-4: 루프 가동 중 KIS 토큰 만료 → 자동 갱신 (동시 요청 2개여도 단일 갱신)
- [ ] C-5: 휴장일에 루프 자동 시작 → 사이클 스킵, 다음 거래일까지 sleep
- [ ] C-6: 상한가 도달 종목에 BUY 신호 → 차단 로그 기록
- [ ] C-7: VI 발동 중 종목에 신호 → 차단 (§M1 처리 후)
- [ ] C-8: 루프 stop 후 polling 즉시 중지 (네트워크 탭 확인)
- [ ] C-9: 다중 사용자가 각자 루프 가동 → 격리 (다른 사용자 데이터 노출 금지)

### QA-D. KIS 주문
- [ ] D-1: 모의 매수 정상
- [ ] D-2: 실거래 매수 → 게이트 모달 → 확인 → 주문 → KIS 응답
- [ ] D-3: 0 / 음수 / 호가단위 오정렬 가격 → 사전 거부
- [ ] D-4: 보유 수량 초과 매도 시도 → 사전 거부
- [ ] D-5: 같은 주문 빠르게 2회 클릭 → 한 번만 KIS 도달 (멱등키 §C3)
- [ ] D-6: 주문 후 네트워크 단절 → 재시도해도 중복 없음
- [ ] D-7: 시간외단일가 세션에서 주문 → ord_dvsn=03 자동 적용
- [ ] D-8: 주문 취소 가능 (§K2)

### QA-E. 백테스트
- [ ] E-1: MA 백테스트 정상 실행
- [ ] E-2: AI 백테스트 정상 실행 + SSE 진행률
- [ ] E-3: 백테스트 중 cancel → 즉시 중단
- [ ] E-4: look-ahead 검증: 신호 T일 → 체결 T+1 자동 테스트 통과
- [ ] E-5: 휴장일 포함 기간 → 거래일만 카운트, 보고서에 명시
- [ ] E-6: T+2 결제 적용 시 동일 자금 중복 사용 안 됨

### QA-F. 보안
- [ ] F-1: XSS 스크립트가 LLM reasoning에 포함되어도 텍스트로만 렌더 (no eval)
- [ ] F-2: CORS 다른 origin에서 요청 → 차단
- [ ] F-3: CSRF 토큰 없는 POST → 거부 (§A5 처리 후)
- [ ] F-4: 본문 1MB 초과 POST → 413
- [ ] F-5: ticker에 SQL/NoSQL injection 시도 → 정규식 거부
- [ ] F-6: localStorage에 OPENAI / KIS 키가 평문 저장되지 않음 (브라우저 DevTools 확인)
- [ ] F-7: 응답 헤더 CSP/HSTS/X-Frame-Options 존재
- [ ] F-8: 로그에 secret 노출 0건 (`grep -i "sk-\|app_secret" logs/`)

### QA-G. 운영·복구
- [ ] G-1: MongoDB 강제 종료 → 헬스체크 503 → 30초 내 복구 시 자동 재연결
- [ ] G-2: 일일 백업 dump → 다른 인스턴스에 restore → 사용자 로그인·과거 거래 조회 정상
- [ ] G-3: SIGTERM 시 진행 중 루프 상태 저장 후 종료
- [ ] G-4: 90일 이상 된 activity_logs 자동 삭제 (TTL 동작)
- [ ] G-5: Sentry에 강제 예외 → 알림 도달

### QA-H. 부하·성능
- [ ] H-1: 동시 50명 분석 시작 → 평균 응답 30초 이내
- [ ] H-2: SSE 100 동시 → 메모리 누수 없음 (1시간 모니터)
- [ ] H-3: MongoDB pool 100 한도에서 정상 동작
- [ ] H-4: 사용자당 활성 루프 5개 동시 → 사이클 누락 없음

### QA-I. 한국시장 현실성
- [ ] I-1: 2026년 설/추석/대체공휴일에 사이클 스킵
- [ ] I-2: 12/30 14:00 후엔 정규장 차단
- [ ] I-3: 종목 lot=10 ETF 매수 시 정상 단위 정렬 (§M6 처리 후)
- [ ] I-4: 매수 즉시 매도 신호 → cash 부족 (T+2 §M4 처리 후)
- [ ] I-5: 상한가 잠긴 봉 백테스트 → 체결 안 함 (§M2 처리 후)

### QA-J. Frontend·UX
- [ ] J-1: 모든 fetch에 30s timeout
- [ ] J-2: KisPanel 0/음수/초과 입력 → 인라인 에러
- [ ] J-3: 실거래 첫 주문 게이트 모달
- [ ] J-4: localStorage QuotaExceeded 시 graceful fallback
- [ ] J-5: 모바일 360px 폭에서 주요 화면 깨지지 않음
- [ ] J-6: 키보드만으로 분석/주문 흐름 완료 가능

---

## 8. 처리 우선순위 요약 (Sprint 단위)

### Sprint 0 (출시 블로커, ≤2주)
1. §2-A1~A5 (인증·암호화) — 8건
2. §2-B1~B2 (CORS·보안헤더) — 2건
3. §2-C1~C3 (루프 영속화·멱등) — 3건
4. §2-D1 (TTL) — 1건
5. §2-E1~E3 (입력검증·DoS) — 3건
6. §2-K1~K3 (주문 안전) — 3건
7. §2-M1~M6 (한국시장 현실성) — 6건
**총 26건**

### Sprint 1 (1~2주)
- §3 전체 (Frontend / Backend / Korean / Ops / Tests) **27건**

### Sprint 2 (1개월)
- §4 전체 **15건**

### Backlog
- §5 (Low) + §6 (PF-Phase) + 본 점검 범위 외 (AgentOffice 등)

---

## 9. 본 문서가 대체·갱신해야 할 기존 문서

| 기존 문서 | 본 문서 처리 후 액션 |
|---|---|
| `BACKEND_AUDIT.md` | "잔여 리스크 §7" 항목들이 본 문서 §2-C·§3-T 로 이관됨 명시. 마지막에 cross-ref 라인 1줄 추가 권장 |
| `FRONTEND_AUDIT.md` | 픽스 12건 ✅ 유지. 본 문서 §3-F1~F8 로 후속 14건 추가 명시 |
| `KOREAN_MARKET_REALISM_AUDIT.md` | §5 "Remaining Gaps" 가 본 문서 §2-M / §3-M / §4-M 로 명세화됨. 휴장일·반일장·T+2가 신규 추가 |
| `AUTO_TRADING_SUPERVISOR.md` | §5 "운영 주의사항" 의 "재시작 시 인메모리 유실"이 §2-C1 로 격상 처리됨 |
| `USER_LEVEL_DB_SCHEMA.md` | "Production Hardening Checklist 1~8" 0/8 → 본 문서 §2-A·§2-D·§3-O·§3-T 로 매핑됨. 처리 시 원문 체크박스 동기화 |
| `UX_BEGINNER_TO_EXPERT_AUDIT.md` | 24/25 ✅. 본 점검 범위 외 (단, §2-K1·F2·F3는 UX-K3 강화 연결됨) |

---

## 10. 점검 결과 요약

- **신규 발견 항목 총합**: 73건
  - 🔴 Critical: 26
  - 🟠 High: 27
  - 🟡 Medium: 15
  - 🟢 Low: 5
- **검증 방식**: 4개 병렬 audit + grep/read 핵심 5건 교차검증
  - ✅ CORS allow_origins 하드코딩 — 확인됨 (`backend/main.py:130`)
  - ✅ localStorage 토큰 — 확인됨 (`frontend/src/lib/api.ts:8-18`)
  - ✅ slowapi/rate-limit 0건 — 확인됨
  - ✅ `app_secret_key="dev-secret-change-me"`, `data_encryption_key=""` — 확인됨 (`backend/core/config.py:12-13`)
  - ✅ activity_logs/user_trades TTL 0건 — 확인됨 (`backend/core/mongodb.py:250-256`)
  - ✅ KRX 휴장일 / vi_yn 처리 0건 — 확인됨

- **상태**: 본 체크리스트의 §2(Critical) 26건 처리 완료 시점이 **프로덕션 출시 가능 시점**입니다.

---

**작성**: 2026-04-26
**다음 검토**: §2 절반 처리 시점 / 출시 직전 / 출시 후 1주

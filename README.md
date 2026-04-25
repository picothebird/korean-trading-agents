<div align="center">

# Korean Trading Agents (KTA)

**한국 주식 시장(KOSPI · KOSDAQ)을 위한 다중 AI 에이전트 자동매매 플랫폼**

> 8명의 LLM 에이전트가 토론·검증·승인을 거쳐 매매 결정을 내리고,
> 사용자 정책(GURU) · 리스크 게이트 · 인간 승인 절차를 통과한 주문만 KIS OpenAPI로 실행합니다.

[![Python](https://img.shields.io/badge/python-3.12%2B-3776AB?logo=python&logoColor=white)](#)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.119-009688?logo=fastapi&logoColor=white)](#)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](#)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.x-1C3C3C)](#)
[![KIS OpenAPI](https://img.shields.io/badge/KIS-OpenAPI-1E40AF)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](#-라이선스)

</div>

---

## 🎯 한 줄 요약 (BLUF)

> **"신뢰할 수 있는 한국 주식 자동매매를 만들기 위해, GPT-5 기반 멀티에이전트가 협업하고, Kelly Criterion으로 사이즈를 잡고, 사용자 정의 GURU 정책을 강제하며, 인간 승인 게이트를 거친 뒤에만 한국투자증권 OpenAPI로 주문을 보냅니다."**

### 이게 무엇인가
- **로컬에서 실행되는 풀스택 트레이딩 시스템**입니다 — 백엔드(FastAPI), 프론트엔드(Next.js 16), MongoDB, 8명의 LLM 에이전트, KIS API 연동, 백테스터, 다크모드 UI까지 모두 포함합니다.
- **단순 신호 봇이 아닙니다** — 4명의 분석가 → 강세/약세 토론 → 리스크 매니저(Kelly) → 포트폴리오 매니저 → GURU 정책 레이어로 이어지는 **5단계 의사결정 파이프라인**입니다.
- **종이매매(Paper)와 실전매매(Live)** 둘 다 1-클릭 전환으로 지원합니다. 모의투자 KIS 환경(`openapivts`)과 실전(`openapi`) 자동 라우팅.

### 누구를 위한 것인가
- **AI/퀀트에 관심 있는 한국 개인 투자자** — 자기 철학(`GURU 원칙`)을 LLM에 주입해 자동매매에 반영하고 싶은 사람.
- **트레이딩 시스템 개발자** — 멀티에이전트 의사결정, KIS 주문 승인 플로우, 한국 시장 특수 규칙(서킷브레이커, 호가단위, 정규/시간외 세션) 구현체를 학습하려는 사람.
- **연구·교육 목적** — TradingAgents 논문 아키텍처를 한국 시장 데이터(`pykrx`, `FinanceDataReader`)와 결합한 실전 코드.

### 무엇이 다른가
| 일반적인 트레이딩 봇 | Korean Trading Agents |
|---|---|
| 단일 신호 → 주문 | **5단계 합의** (분석 → 토론 → 리스크 → PM → GURU) |
| 고정 사이즈 | **Kelly Criterion (Half-Kelly)** 기반 동적 사이징 |
| 매수만 보수적 차단 | **상한가/하한가/거래정지/시장경고/서킷브레이커** 다중 게이트 |
| LLM = 블랙박스 | **에이전트별 사고 전 과정 SSE 실시간 스트리밍** |
| 사용자 무관 | **GURU 정책** — 투자 철학 자유서술 + 신뢰도/리스크/포지션 상한 룰 강제 |
| KIS = 단순 호출 | **2단계 인앱 확인 → MongoDB 승인 레코드 → 만료 → 실주문** |
| 모의/실전 혼재 | 환경변수 1개(`KIS_MOCK`)로 URL/TR_ID 자동 분기 |

---

## 📑 목차

1. [30초 데모](#-30초-데모)
2. [핵심 기능](#-핵심-기능)
3. [시스템 아키텍처](#-시스템-아키텍처)
4. [투자 로직 상세 (가장 중요)](#-투자-로직-상세-가장-중요)
   - [4.1 멀티에이전트 5단계 파이프라인](#41-멀티에이전트-5단계-파이프라인)
   - [4.2 Kelly Criterion 포지션 사이징](#42-kelly-criterion-포지션-사이징)
   - [4.3 GURU 정책 레이어](#43-guru-정책-레이어)
   - [4.4 단일 종목 AutoLoop](#44-단일-종목-autoloop)
   - [4.5 포트폴리오 PortfolioLoop](#45-포트폴리오-portfolioloop)
   - [4.6 KIS 주문 + 인간 승인 플로우](#46-kis-주문--인간-승인-플로우)
   - [4.7 한국 시장 안전장치](#47-한국-시장-안전장치)
   - [4.8 백테스트](#48-백테스트)
5. [설치 및 실행](#-설치-및-실행)
6. [환경 변수](#-환경-변수)
7. [API 레퍼런스](#-api-레퍼런스)
8. [프론트엔드 가이드](#-프론트엔드-가이드)
9. [디자인 시스템](#-디자인-시스템)
10. [개발 가이드](#-개발-가이드)
11. [트러블슈팅](#-트러블슈팅)
12. [보안 · 면책](#-보안--면책)
13. [로드맵 · 기여 · 라이선스](#-로드맵)

---

## ⚡ 30초 데모

```powershell
# 1. 클론 + 가상환경
git clone https://github.com/picothebird/korean-trading-agents.git
cd korean-trading-agents
python setup.py                           # .venv 생성 + requirements 설치

# 2. .env 작성 (.env.example 참고)
copy .env.example .env
notepad .env                              # OPENAI_API_KEY, KIS_*, MONGODB_URI 입력

# 3. 백엔드 + 프론트 한 번에 실행
.\start.bat                               # Windows
# ./start.sh                              # macOS / Linux
```

브라우저: **http://localhost:3000** → 로그인 → 종목 검색(예: `005930`) → `분석 시작` 클릭 → 8명의 에이전트 사고 과정이 실시간으로 흐릅니다.

> 처음에는 반드시 **모의투자(`KIS_MOCK=true`) + paperTrade 모드**로 시작하세요. 실전 전환은 [4.6](#46-kis-주문--인간-승인-플로우) 참고.

---

## 🌟 핵심 기능

### 분석
- **8명의 LLM 에이전트** — `technical_analyst`, `fundamental_analyst`, `sentiment_analyst`, `macro_analyst`, `bull_researcher`, `bear_researcher`, `risk_manager`, `portfolio_manager` + 메타 레이어 `guru_agent`
- **실시간 SSE 스트리밍** — 각 에이전트의 상태(`THINKING`/`ANALYZING`/`DEBATING`/`DONE`)와 사고 텍스트가 토큰처럼 흘러가는 "에이전트 오피스" 뷰
- **JSON 강제 출력 + 안전 파서** — 코드블록 제거, 첫 `{` ~ 마지막 `}` 추출, 실패 시 안전한 fallback

### 의사결정
- **Kelly Criterion (Half-Kelly)** 포지션 사이징 + 0.05 ~ 0.25 클리핑
- **인간 승인 게이트** — 신뢰도 ≥ 85% 또는 포지션 ≥ 20% 또는 리스크 = CRITICAL
- **GURU 사용자 정책** — 자유서술 투자 철학 + 5가지 정량 룰을 LLM과 결정론적 게이트로 동시 적용

### 실행
- **단일 종목 AutoLoop** — 1~∞ 분 주기 자동 사이클, 신뢰도/감독레벨/시장 상태 5중 게이트
- **포트폴리오 PortfolioLoop** — 시장 스캔 → 후보 랭킹 → 병렬 분석 → 목표 비중 → 리밸런싱
- **KIS 주문 승인 사이클** — 인앱 2단계 확인 → MongoDB pending 레코드(만료) → 사용자 승인 → 실주문 → 결과 반환
- **모의 ↔ 실전 자동 라우팅** — 환경 변수 1개로 URL · TR_ID(`T`→`V`) 자동 변환

### 부가
- **백테스트** — `FinanceDataReader` + 한국 거래세 0.18%/수수료 0.015% 반영, 일별 의사결정/AI 에이전트 백테스트 모두 지원
- **다크/라이트/시스템 테마** — FOUC 방지 inline 스크립트 + Linear/Vercel/Toss 영감 팔레트
- **한국 시장 색 컨벤션** — 빨강=상승, 파랑=하락 (테마 무관 유지)
- **per-user 런타임 설정** — 사용자별 독립 LLM 모델/GURU 정책/KIS 자격증명(`Fernet` 암호화 저장)

---

## 🏛️ 시스템 아키텍처

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                Frontend (Next.js 16)                            │
│   AgentOffice · KisPanel · AutoLoopPanel · PortfolioLoopPanel · BacktestPanel  │
│                       SettingsPanel · ThemeProvider · ToastProvider             │
└──────────────┬───────────────────────────────────────────────┬─────────────────┘
               │ REST + SSE (EventSource)                       │ WebSocket(선택)
               ▼                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                          FastAPI Backend (uvicorn :8000)                        │
│                                                                                 │
│  ┌──────────────┐   ┌─────────────────┐   ┌──────────────────────────────────┐ │
│  │ user_system  │   │ AutoTradingSup  │   │  Order Approvals (Mongo+Fernet)  │ │
│  │ /auth /me    │   │ PortfolioSup    │   │  pending → approved/rejected     │ │
│  └──────┬───────┘   └────────┬────────┘   └─────────────┬────────────────────┘ │
│         │                    │                          │                       │
│         ▼                    ▼                          ▼                       │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │           agents.orchestrator.run_analysis()  ←  핵심 파이프라인           │  │
│  │   ┌────────────────────────────────────────────────────────────────────┐ │  │
│  │   │ 1. DATA   : 4 analysts (parallel asyncio.gather)                  │ │  │
│  │   │ 2. DEBATE : bull ↔ bear (N rounds, 라운드별 시세/뉴스 재조회)      │ │  │
│  │   │ 3. RISK   : risk_manager + Kelly Criterion                        │ │  │
│  │   │ 4. PM     : portfolio_manager 최종 액션 결정                       │ │  │
│  │   │ 5. GURU   : 사용자 정책 LLM 검토 + 결정론적 룰 게이트                │ │  │
│  │   └────────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└──────┬─────────────────────────┬──────────────────────────┬────────────────────┘
       │                         │                          │
       ▼                         ▼                          ▼
┌─────────────┐      ┌─────────────────────┐      ┌────────────────────────┐
│  MongoDB    │      │  Market Data        │      │  KIS OpenAPI           │
│  Atlas      │      │  pykrx · FDR · RSS  │      │  실전 / 모의 자동 분기   │
│  - users    │      │  yfinance · ta      │      │  토큰 캐시 + tr_id 변환 │
│  - settings │      │  technical_indicat. │      │  잔고/시세/주문         │
│  - approvals│      │  news_async         │      │  매수/매도 · 시장/지정가│
│  - sessions │      └─────────────────────┘      └────────────────────────┘
└─────────────┘
```

### 디렉토리 구조

```
korean-trading-agents/
├── agents/
│   ├── analyst/analysts.py           # 4명의 분석 에이전트 (Layer 1)
│   ├── researcher/                   # bull/bear (orchestrator 안에 구현)
│   └── orchestrator/orchestrator.py  # 5단계 파이프라인 + GURU
├── backend/
│   ├── main.py                       # FastAPI 엔트리, 32개 엔드포인트
│   ├── api/user_system.py            # 회원/세션/권한
│   ├── core/
│   │   ├── config.py                 # pydantic-settings
│   │   ├── events.py                 # SSE pub/sub, AgentThought
│   │   ├── llm.py                    # OpenAI/Anthropic 추상화 (gpt-5 reasoning)
│   │   ├── mongodb.py                # Motor async 클라이언트
│   │   ├── order_approvals.py        # 주문 승인 레코드 + Fernet 암호화
│   │   ├── runtime_sessions.py       # 분석/백테스트 세션 추적
│   │   ├── user_access.py            # 권한, 활동 미들웨어
│   │   └── user_runtime_settings.py  # per-user 설정 + 컨텍스트 스왑
│   └── services/
│       ├── auto_trading.py           # 단일 종목 AutoTradingSupervisor
│       └── portfolio_trading.py      # 포트폴리오 PortfolioSupervisor
├── backtesting/backtest.py           # 단순/AI 에이전트 백테스트
├── data/
│   ├── kis/
│   │   ├── client.py                 # 토큰 캐시 + 모의/실전 URL
│   │   └── trading.py                # 시세/잔고/주문
│   └── market/
│       ├── fetcher.py                # 종목 정보, 지표, 뉴스
│       └── krx_rules.py              # 호가단위, 세션, 슬리피지 멀티플라이어
├── frontend/                         # Next.js 16 (Turbopack) + React 19
│   └── src/
│       ├── app/                      # /, /login, /master, /activity
│       └── components/
│           ├── AgentOffice.tsx       # 실시간 에이전트 사고 뷰
│           ├── AutoLoopPanel.tsx     # 단일 종목 자동 루프 컨트롤
│           ├── PortfolioLoopPanel.tsx
│           ├── KisPanel.tsx          # 주문 입력 + 2단계 확인
│           ├── BacktestPanel.tsx
│           ├── SettingsPanel.tsx     # 6개 탭 (overview/appearance/llm/analysis/guru/kis)
│           └── ui/ThemeProvider.tsx  # 라이트/다크/시스템 + FOUC 방지
├── docs/                             # 11개 설계/감사 문서
├── requirements.txt                  # Python 3.12+
├── run_server.py                     # uvicorn 래퍼
├── start.bat / start.sh
└── setup.py                          # .venv 생성 + 의존성 설치
```

### 기술 스택

| 레이어 | 기술 |
|---|---|
| Backend | **FastAPI 0.119**, uvicorn 0.37, httpx 0.28, pydantic 2.12 |
| Agent | **LangGraph 1.x**, LangChain 1.2, **OpenAI gpt-5 / gpt-5-mini** (reasoning_effort=high) |
| DB | **MongoDB Atlas** + motor 3.7 (async) |
| Encryption | **cryptography (Fernet)** — 주문 페이로드 + 사용자 시크릿 |
| Market Data | **pykrx 1.2**, **FinanceDataReader**, yfinance, feedparser, ta 0.11 |
| Broker | **한국투자증권 KIS OpenAPI** (실전 + 모의투자) |
| Frontend | **Next.js 16.2.3 (Turbopack)**, React 19, Tailwind 4, Pretendard, Recharts, Framer Motion |
| Auth | 자체 사용자 시스템 (Mongo) + 미들웨어 |

---

## 💎 투자 로직 상세 (가장 중요)

### 4.1 멀티에이전트 5단계 파이프라인

`agents/orchestrator/orchestrator.py::run_analysis(ticker, session_id)` 가 **모든 분석의 시작점**입니다. 한 번의 호출이 5단계를 순차/병렬 실행하고 최종 `TradeDecision` 객체를 반환합니다.

```
                           run_analysis(ticker)
                                   │
       ┌───────────────────────────┴──────────────────────────────┐
       ▼ 1단계: DATA (asyncio.gather, 병렬)                        │
   ┌───────────────┬────────────────┬────────────────┬───────────┐│
   │ Technical     │ Fundamental    │ Sentiment      │ Macro     ││
   │ RSI/MACD/BB   │ 재무·섹터       │ 뉴스 감성       │ 환율/금리  ││
   │ MA5/MA20/52w  │ (LLM 추론)     │ feedparser+LLM │ 지수 흐름  ││
   └───────┬───────┴────────┬───────┴────────┬───────┴─────┬─────┘│
           └────────────────┴────────────────┴─────────────┘      │
                              │ {signal, confidence, risk_level}   │
                              ▼ 2단계: DEBATE (rounds=2, 기본)      │
                    ┌──────────────────────────┐                    │
                    │ bull_researcher  ⇄  bear │   ← 매 라운드마다  │
                    │ (강세 ⇄ 약세 토론)         │   시세 + 뉴스 재조회│
                    └────────────┬─────────────┘                    │
                                 ▼ 3단계: RISK                       │
                    ┌──────────────────────────┐                    │
                    │ risk_manager + Kelly     │                    │
                    │ {risk_level, kelly_pct,  │                    │
                    │  stop_loss, requires_    │                    │
                    │  human_approval}         │                    │
                    └────────────┬─────────────┘                    │
                                 ▼ 4단계: PORTFOLIO MANAGER          │
                    ┌──────────────────────────┐                    │
                    │ {action, confidence,     │                    │
                    │  position_size_pct,      │                    │
                    │  entry/exit strategy}    │                    │
                    └────────────┬─────────────┘                    │
                                 ▼ 5단계: GURU (선택, 사용자 정책)    │
                    ┌──────────────────────────┐                    │
                    │ LLM 정책 검토            │                    │
                    │ + 결정론적 룰 게이트      │                    │
                    │ (신뢰도/리스크/포지션 상한)│                    │
                    └────────────┬─────────────┘                    │
                                 ▼                                   │
                          TradeDecision ───────────────────────────►│
```

#### 1단계 — DATA: 4명의 분석가

`agents/analyst/analysts.py`. 모두 `asyncio.gather`로 병렬 실행되며 예외도 안전하게 격리됩니다.

| 에이전트 | 입력 | 출력 (JSON) |
|---|---|---|
| `technical_analyst` | RSI(14), MACD/Signal/Hist, 볼린저(20,2), MA5/MA20, 52주 H/L | `{signal, confidence, key_signals, risk_level, summary}` |
| `fundamental_analyst` | 섹터/시총/PER/PBR (가능 시) + 가격 구조 | 동일 스키마 |
| `sentiment_analyst` | 최근 뉴스 헤드라인 + 본문 (feedparser) | 동일 스키마 |
| `macro_analyst` | KOSPI/KOSDAQ 지수, 환율, 금리 환경 | 동일 스키마 |

> 모든 분석가는 **JSON-only 응답을 강제**하고, 실패 시 `{signal: "HOLD", confidence: 0.3}` fallback으로 안전하게 회복합니다.

#### 2단계 — DEBATE: 강세 ⇄ 약세 연구원 토론

`researcher_debate(ticker, analyst_results, session_id, rounds)`. 기본 2라운드, 사용자 설정으로 1~8라운드까지 조정.

각 라운드는 **반드시 시세와 뉴스를 재조회**합니다. 토론이 길어질수록 시장이 변하기 때문에:

```python
# orchestrator.py:108-150 발췌
for round_num in range(1, rounds + 1):
    indicators = get_technical_indicators(ticker, days=45)   # 라운드별 재조회
    latest_news = await get_news_async(ticker, company_name) # 라운드별 재조회
    
    # 직전 라운드 대비 가격 변화량까지 프롬프트에 주입
    intraround_change_pct = (latest_price - previous_round_price) / previous_round_price * 100
    
    # bull_researcher 가 먼저 주장 → bear가 그것을 반박
    # 다음 라운드는 직전 약세 주장을 강세 프롬프트에 포함 (양방향 반박)
```

#### 3단계 — RISK: Kelly 기반 리스크 매니저

신뢰도 평균 → Half-Kelly → 한국 시장 특수 조건 강제(서킷브레이커, 공매도 제한, 25% 포지션 상한):

```python
# orchestrator.py:71-90
def _kelly_position_size(confidences, avg_win_pct=5.0, avg_loss_pct=3.0, max_fraction=0.25):
    p = mean(confidences)              # 승률 추정
    b = avg_win_pct / avg_loss_pct     # 손익비
    kelly = (b * p - (1-p)) / b
    return clamp(kelly * 0.5, 0.05, 0.25)   # Half-Kelly + 클리핑
```

리스크 매니저는 다음을 출력하고 **`requires_human_approval`** 플래그까지 결정합니다:
```json
{ "risk_level": "LOW|MEDIUM|HIGH|CRITICAL", "max_position_pct": 0~25,
  "kelly_position_pct": 12.3, "stop_loss_pct": 3~15, "approval": true/false,
  "requires_human_approval": true/false, "summary": "..." }
```
조건: `confidence ≥ 0.80 AND position > 20%` 또는 `risk_level = CRITICAL`.

#### 4단계 — PORTFOLIO MANAGER: 최종 액션

```python
# orchestrator.py:357-372
position_pct = min(risk_result["max_position_pct"], kelly_pct)
# LLM에게 BUY/SELL/HOLD + entry/exit_strategy를 받음

requires_human = (
    risk_result["requires_human_approval"]
    or pm_result["confidence"] >= 0.85
    or pm_result["position_size_pct"] >= 20
)
```

#### 5단계 — GURU: 사용자 정책 레이어 (선택)

→ [4.3 GURU 정책 레이어](#43-guru-정책-레이어) 참고.

---

### 4.2 Kelly Criterion 포지션 사이징

**왜 Kelly인가?** 신뢰도가 높을수록 더 크게, 낮을수록 더 작게, 그러나 **파산 위험을 0으로 유지**합니다. KTA는 **Half-Kelly**(0.5 × 풀 켈리)를 채택해 변동성을 절반으로 낮춥니다.

| 파라미터 | 기본값 | 의미 |
|---|---|---|
| `agent_confidences` | 4명 평균 | 승률 추정 `p` |
| `avg_win_pct` | 5.0 | 평균 익절률 (5%) |
| `avg_loss_pct` | 3.0 | 평균 손절률 (3%) → 손익비 `b = 5/3 ≈ 1.67` |
| `max_fraction` | 0.25 | 단일 종목 최대 25% (한국 시장 보수치) |
| 하한 | 0.05 | 진입 시 최소 5% (작아도 의미 있는 포지션) |

> Kelly 결과는 **risk_manager의 `max_position_pct`와 `min`**을 취해 LLM 환각을 방어합니다. PM/GURU에서도 동일 원칙으로 추가 클리핑됩니다.

---

### 4.3 GURU 정책 레이어

`guru_manager()` (orchestrator.py:391~). **내가 설정한 투자 철학을 LLM에게 주입하고, 동시에 결정론적 룰로 강제하는** 메타 의사결정자.

#### 사용자가 설정하는 5가지 정량 룰 + 1자유서술

| 키 | 타입 | 설명 |
|---|---|---|
| `guru_enabled` | bool | GURU 자체 ON/OFF |
| `guru_debate_enabled` | bool | LLM 검토 단계 ON/OFF (룰 게이트는 항상 동작) |
| `guru_risk_profile` | `defensive`\|`balanced`\|`aggressive` | 프롬프트 톤 |
| `guru_investment_principles` | string | "10% 이상 손실 금지, 반도체 30% 이하" 등 자유서술 |
| `guru_min_confidence_to_act` | float (0~1) | 이 미만이면 BUY/SELL → HOLD 강제 |
| `guru_max_risk_level` | LOW\|MEDIUM\|HIGH\|CRITICAL | 이 초과면 BUY 차단 |
| `guru_max_position_pct` | float (1~100) | 포지션 최종 클리핑 |
| `guru_require_user_confirmation` | bool | true면 모든 BUY/SELL이 인간 승인 필요 |

#### 처리 순서

```
PM 초안 → GURU LLM 토론 (debate_enabled 시)
       ↓
       ├── 룰 1: confidence < min_confidence_to_act → HOLD
       ├── 룰 2: BUY + risk_level > max_risk_level → HOLD
       ├── 룰 3: position_pct > max_position_pct → 클리핑
       └── 룰 4: require_user_confirmation + BUY/SELL → requires_human_approval = true
       ↓
       최종 TradeDecision (어떤 룰이 적용됐는지 reasoning과 metadata에 기록)
```

> **결정론적 룰이 LLM 출력보다 항상 후순위로 강제**됩니다. LLM이 "BUY"라고 우겨도 신뢰도가 70%인데 룰이 75%면 무조건 HOLD가 됩니다.

---

### 4.4 단일 종목 AutoLoop

`backend/services/auto_trading.py::AutoTradingSupervisor`. 서버가 **브라우저 탭과 무관하게 상주**하면서 N분마다 한 종목을 자동 분석/주문합니다.

#### 사이클 흐름 (12개 단계)

```
       ┌─────────────────────────────────────────┐
   ┌──►│  1. asyncio.wait_for(stop_event, N분)   │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  2. run_analysis(ticker)  → decision     │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  3. 결정 기록 (decision_history, last 80) │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  GATE A: confidence < min_confidence?    │ → skip
   │   │  GATE B: action == HOLD?                 │ → skip
   │   │  GATE C: KRX 세션 비거래시간?            │ → skip
   │   │  GATE D: 감독 레벨이 차단?               │ → skip
   │   │     (STRICT: requires_human OR HIGH+)    │
   │   │     (BALANCED: requires_human AND HIGH+) │
   │   │     (AGGRESSIVE: 모두 통과)               │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  4. KIS get_current_price(ticker)        │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  GATE E: price <= 0 → skip               │
   │   │  GATE F: 미래 시각 시세(가짜 데이터)→skip │
   │   │  GATE G: halt_yn=Y (거래정지) → skip     │
   │   │  GATE H: 시장경고코드 → skip              │
   │   │  GATE I: 상한가 BUY / 하한가 SELL → skip │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  5. _plan_trade()                        │
   │   │   - confidence_weight × supervision_w    │
   │   │   - 목표 비중 - 현재 비중 = 델타          │
   │   │   - 수수료/슬리피지 반영 effective_price │
   │   │   - 정수 주식수 normalize                │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  6. paper_trade=true → _apply_paper_*    │
   │   │     paper_trade=false → _execute_live_*  │
   │   │       └─→ KIS place_order() (시장가)      │
   │   └────────────────────┬────────────────────┘
   │                        ▼
   │   ┌─────────────────────────────────────────┐
   │   │  7. trade_history 기록 + log emit        │
   └───┤  8. 다음 next_run_at 계산                │
       └─────────────────────────────────────────┘
```

#### AutoLoopSettings (사용자 조정 가능)

| 필드 | 기본값 | 설명 |
|---|---|---|
| `interval_min` | 15 | 사이클 주기(분) |
| `min_confidence` | 0.72 | 이 미만이면 주문 보류 |
| `paper_trade` | true | 모의 시뮬레이션 ↔ 실전 KIS |
| `fee_bps` / `slippage_bps` / `tax_bps` | 1.5 / 3.0 / 18.0 | 수수료·슬리피지·거래세 |
| `max_position_pct` | 25.0 | 단일 종목 최대 비중 |
| `supervision_level` | `balanced` | strict/balanced/aggressive |
| `execution_session_mode` | `regular_only` | 정규장 전용 vs 정규+시간외 |
| `initial_cash` | 10,000,000 | 페이퍼 초기 자본 |

#### 감독 레벨 (Supervision Level)

| 레벨 | 차단 조건 | 사이즈 멀티 |
|---|---|---|
| `strict` | `requires_human_approval` OR risk ∈ {HIGH, CRITICAL} | × 0.6 |
| `balanced` | `requires_human_approval` AND risk ∈ {HIGH, CRITICAL} | × 1.0 |
| `aggressive` | 차단 없음 | × 1.4 |

#### 모의 (paper) vs 실전 (live)

- **paper** — `PaperPortfolio(cash, shares, avg_buy_price, realized_pnl, total_fees, total_taxes)`. 매수 시 수수료+슬리피지를 effective_price에 반영, 매도 시 거래세 0.18% 적용. 부분 체결 없음.
- **live** — `data.kis.trading.place_order()` 호출. 잔고 조회로 실제 cash/shares를 받고, 보수적 fallback도 처리.

> 라이브 모드에서도 **시간외 주문 라우팅은 미지원**. 정규장 외에는 자동 보류 후 정규장 재시작.

---

### 4.5 포트폴리오 PortfolioLoop

`backend/services/portfolio_trading.py::PortfolioSupervisor`. 여러 종목을 포트폴리오 단위로 운용.

```
매 사이클:
  1. 시장 스캔 (universe_market: ALL/KOSPI/KOSDAQ, 상위 60개 기본)
  2. 후보 랭킹 (모니터링 프로파일: balanced / momentum / defensive)
  3. 키워드/관심종목/제외종목 필터
  4. 상위 candidate_count(기본 8) 종목 병렬 분석
     - max_parallel_analyses=3 으로 동시 LLM 호출 제한
  5. 포트폴리오 목표 비중 계산
     - max_positions=5 (포지션 수 한도)
     - max_single_position_pct=25%
  6. rebalance_threshold_pct=1.5% 이상 차이 나는 것만 주문
  7. 모의/실전 분기 + KIS 주문 (AutoLoop와 동일 게이트 통과)
```

핵심 차이는 **공유 cash/risk budget**입니다. 한 종목이 cash를 다 쓰면 다른 종목 주문이 자동 축소됩니다.

#### PortfolioLoopSettings (주요)

| 필드 | 기본값 | 설명 |
|---|---|---|
| `monitoring_profile` | balanced | 종목 랭킹 가중치 (모멘텀/방어 등) |
| `universe_market` | ALL | KOSPI/KOSDAQ/ALL |
| `universe_limit` | 60 | 시장 스캔 상한 |
| `candidate_count` | 8 | 매 사이클 분석 후보 수 |
| `max_positions` | 5 | 동시 보유 종목 수 |
| `cycle_interval_min` | 20 | 사이클 주기 |
| `rebalance_threshold_pct` | 1.5 | 이 이하 차이는 무시 |
| `seed_tickers` | [] | 항상 분석 대상 |
| `preferred_tickers` | [] | 랭킹 가산점 |
| `excluded_tickers` | [] | 절대 제외 |
| `interest_keywords` | [] | 섹터/테마 가중 |

---

### 4.6 KIS 주문 + 인간 승인 플로우

> **이 시스템에서 가장 신중하게 설계된 부분입니다.** 잘못된 주문은 즉시 손실입니다.

#### 모의 ↔ 실전 자동 라우팅

`data/kis/client.py`:
- `KIS_MOCK=true` → `https://openapivts.koreainvestment.com:29443` + tr_id `T*` → `V*` 자동 변환
- `KIS_MOCK=false` → `https://openapi.koreainvestment.com:9443`

토큰은 메모리 캐시(`_token_cache`), **만료 10분 전 자동 재발급**.

#### 주문 4단계 승인 플로우 (실전 모드)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1 — UI 입력 (frontend/KisPanel.tsx)                        │
│   - ticker, 매수/매도, 수량, 시장가/지정가 입력                   │
│   - "주문 검토" 버튼                                              │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2 — 인앱 2단계 확인 다이얼로그                              │
│   - 종목/가격/예상 금액 명시                                      │
│   - 사용자가 "확인" 클릭해야 다음 단계                             │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3 — 백엔드 승인 레코드 생성                                 │
│   POST /api/kis/order/approval/request                           │
│   → MongoDB order_approvals 컬렉션                               │
│     { _id, status: "pending", payload: <Fernet 암호화>,          │
│       expires_at: now + 60s, user_id }                           │
│   → Frontend 카드: 승인/거절 버튼 표시                            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4 — 사용자 최종 승인                                        │
│   POST /api/kis/order/approval/{id}/approve                      │
│   - status check (만료 여부, 본인 여부)                           │
│   - payload 복호화                                                │
│   - kis.place_order() 호출                                        │
│   - 결과를 status="approved" + execution_result 와 함께 저장       │
│                                                                  │
│   POST /api/kis/order/approval/{id}/reject  → 즉시 폐기            │
└─────────────────────────────────────────────────────────────────┘
```

#### 핵심 안전장치

| 장치 | 위치 | 설명 |
|---|---|---|
| **Fernet 암호화** | `order_approvals.py` | payload 자체를 `DATA_ENCRYPTION_KEY`로 암호화 (DB 유출 시에도 평문 노출 방지) |
| **만료** | `expires_at` | 기본 60초, 만료 시 자동 거절 |
| **본인 검증** | `require_user` 미들웨어 | 다른 사용자의 승인 ID 접근 차단 |
| **상태 머신** | `pending → approved/rejected/expired` | 한 번만 전이 가능 (멱등성) |
| **2단계 인앱 확인** | KisPanel.tsx | 백엔드 호출 전에 UI에서 한 번 더 확인 |

#### AutoLoop의 인간 승인 (별도)

AutoLoop은 위 4단계를 거치지 않습니다 (서버 자동 실행). 대신 **GURU/리스크 매니저의 `requires_human_approval=true`가 나오면 주문 자체가 보류**되고, UI에 알림으로 노출됩니다. `guru_require_user_confirmation=true`로 설정하면 모든 BUY/SELL이 자동으로 보류됩니다.

---

### 4.7 한국 시장 안전장치

`data/market/krx_rules.py` + 위 게이트들이 **한국 거래소 특수 규칙**을 강제합니다:

| 규칙 | 구현 |
|---|---|
| **호가 단위(틱 사이즈)** | `round_to_tick(price)` — 가격대별 1/5/10/50/100/500/1000 |
| **정수 주식수** | `normalize_share_qty(qty, lot_size=1)` |
| **정규장 시간** | 09:00~15:30 KST (월~금), `is_tradable_session()` |
| **시간외 모드** | `regular_only` vs `regular_and_after_hours` (라이브는 정규장만) |
| **세션별 슬리피지** | `session_slippage_multiplier()` — 동시호가/시간외는 슬리피지 배수 |
| **거래정지** | `halt_yn=Y` 즉시 차단 |
| **시장경고** | warning_code 검사 (STRICT는 모든 경고, BALANCED는 02/03만) |
| **상한가/하한가** | 매수 상한가 차단 / 매도 하한가 차단 |
| **공매도 제한** | 롱 온리 (SELL은 보유분 한도 내) |
| **거래세 0.18%** | 매도 시에만 적용 |
| **수수료 0.015%** | 매수/매도 양쪽 |
| **미래 시각 시세** | `_looks_like_future_quote_time()` — KIS API 가짜 데이터 방어 |

---

### 4.8 백테스트

`backtesting/backtest.py`. 두 가지 모드:

#### A. 단순 백테스트 — `run_simple_backtest()`
- 전략: MA5 × MA20 골든/데드크로스 (롱 온리)
- 데이터: `FinanceDataReader`
- 비용: 수수료 0.015% + 거래세 0.18% = 0.28%
- 수량 단위: 1주, 호가단위 적용
- 출력: `total_return, annualized_return, sharpe, max_drawdown, win_rate, total_trades, profit_factor, calmar_ratio, benchmark_return(KOSPI), alpha`

#### B. AI 에이전트 백테스트 — `run_agent_backtest()`
- 전략: **`run_analysis()`를 일별로 호출**해 실제 에이전트 결정으로 시뮬레이션
- 사용 시 비용 ↑↑ (매일 LLM 호출), 짧은 기간 권장
- API: `POST /api/backtest/agent/start` + SSE 스트림

UI에서 `BacktestPanel.tsx` → 결과는 Recharts 그래프 + 거래 타임라인 + KPI 카드로 시각화.

---

## 🚀 설치 및 실행

### 사전 요구사항

| 항목 | 버전 |
|---|---|
| Python | 3.12+ (3.14 테스트 완료) |
| Node.js | 20 LTS+ |
| MongoDB Atlas | 무료 티어 가능 |
| KIS OpenAPI | [신청 링크](https://apiportal.koreainvestment.com/) (모의투자 가입 후 App Key 발급) |
| OpenAI API | [platform.openai.com](https://platform.openai.com) (gpt-5 권장) |

### 자동 설치 (Windows)

```powershell
git clone https://github.com/picothebird/korean-trading-agents.git
cd korean-trading-agents
python setup.py             # .venv + pip install
copy .env.example .env
notepad .env                # 키 입력
.\start.bat                 # 백엔드 + 프론트 동시 시작
```

### 자동 설치 (macOS / Linux)

```bash
git clone https://github.com/picothebird/korean-trading-agents.git
cd korean-trading-agents
python3 setup.py
cp .env.example .env
nano .env
chmod +x start.sh && ./start.sh
```

### 수동 설치

```bash
# 1. Python 가상환경
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install git+https://github.com/FinanceData/FinanceDataReader.git

# 2. 프론트엔드
cd frontend
npm install
cd ..

# 3. 백엔드 (포트 8000)
python run_server.py
# 또는: uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# 4. 프론트엔드 (포트 3000, 다른 터미널)
cd frontend
npm run dev
```

### 접속

| 주소 | 용도 |
|---|---|
| http://localhost:3000 | 프론트엔드 (메인 UI) |
| http://localhost:3000/login | 로그인 |
| http://localhost:3000/master | 관리자(마스터) 콘솔 |
| http://localhost:3000/activity | 활동 로그 |
| http://localhost:8000 | 백엔드 헬스체크 |
| http://localhost:8000/docs | FastAPI 자동 생성 Swagger |
| http://localhost:8000/redoc | ReDoc |

---

## 🔐 환경 변수

`.env.example`을 복사해 `.env`를 만드세요. **`.env`는 절대 커밋하지 마세요**(`.gitignore`에 포함).

```dotenv
# ── KIS 한국투자증권 ──────────────────────────────
KIS_APP_KEY=발급받은_app_key
KIS_APP_SECRET=발급받은_app_secret
KIS_ACCOUNT_NO=계좌번호-상품코드  # 예: 50012345-01
KIS_MOCK=true                      # true=모의, false=실전(주의!)

# ── LLM ──────────────────────────────────────────
OPENAI_API_KEY=sk-...              # 필수 (gpt-5 권장)
ANTHROPIC_API_KEY=                 # 선택

# ── 보안 ──────────────────────────────────────────
APP_SECRET_KEY=긴_랜덤_문자열_32자_이상
DATA_ENCRYPTION_KEY=               # 비우면 APP_SECRET_KEY에서 파생

# ── MongoDB Atlas ────────────────────────────────
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=korean_trading_agents
MONGODB_CONNECT_TIMEOUT_MS=5000

# ── 부가 ─────────────────────────────────────────
ALPHA_VANTAGE_API_KEY=             # 선택
```

### 주요 옵션 의미

| 키 | 영향 |
|---|---|
| `KIS_MOCK=true` | 가상 자금으로 모의투자 (강력 권장 시작점) |
| `KIS_MOCK=false` | **실제 돈**으로 주문 — 본인 책임 |
| `APP_SECRET_KEY` | 세션 + Fernet 키 파생용. 변경 시 기존 암호화 데이터 복호화 불가 |
| `DATA_ENCRYPTION_KEY` | 직접 지정 시 Fernet 32-byte urlsafe-base64 키 |
| `MONGODB_URI` | 비우면 일부 기능(승인 영속화, per-user 설정) 비활성 |

---

## 📡 API 레퍼런스

`backend/main.py` 기준 **32개 엔드포인트**. 자동 문서: `http://localhost:8000/docs`.

### 헬스 / 종목

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버 헬스체크 |
| GET | `/api/health/mongo` | MongoDB 연결 상태 |
| GET | `/api/stock/search?q=` | 종목명/티커 검색 |
| GET | `/api/stock/{ticker}` | 종목 기본 정보 |
| GET | `/api/stock/{ticker}/chart` | 가격 히스토리 |
| GET | `/api/market/indices` | KOSPI/KOSDAQ 지수 |

### 분석 (멀티에이전트)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/analyze/start` | 분석 시작 → `session_id` 반환 |
| GET | `/api/analyze/stream/{session_id}` | **SSE 스트림** (에이전트 사고 실시간) |
| GET | `/api/analyze/result/{session_id}` | 최종 `TradeDecision` |

### 백테스트

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/backtest` | 단순 백테스트 (MA 교차) |
| POST | `/api/backtest/agent/start` | AI 에이전트 백테스트 시작 |
| GET | `/api/backtest/agent/stream/{id}` | SSE 진행 상황 |
| GET | `/api/backtest/agent/result/{id}` | 최종 결과 |

### 자동 루프 (단일 종목)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auto-loop/start` | AutoLoop 시작 |
| POST | `/api/auto-loop/stop/{loop_id}` | 정지 |
| GET | `/api/auto-loop/status/{loop_id}` | 상태/로그/거래 |
| GET | `/api/auto-loop/list` | 내 모든 루프 |

### 자동 루프 (포트폴리오)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/portfolio-loop/start` | PortfolioLoop 시작 |
| POST | `/api/portfolio-loop/stop/{loop_id}` | 정지 |
| GET | `/api/portfolio-loop/status/{loop_id}` | 상태/포지션/리밸런스 로그 |
| GET | `/api/portfolio-loop/list` | 내 모든 루프 |
| POST | `/api/portfolio-loop/scan/{loop_id}` | 즉시 시장 스캔 |

### KIS

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/kis/status` | 자격증명/토큰 상태 |
| GET | `/api/kis/balance` | 계좌 잔고 + 보유 종목 |
| GET | `/api/kis/price/{ticker}` | 실시간 시세 |
| POST | `/api/kis/order` | 주문 (자동 루프 내부에서만 사용) |

### KIS 주문 승인 사이클

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/kis/order/approval/request` | 승인 레코드 생성 (pending) |
| GET | `/api/kis/order/approval/{id}` | 상세 조회 |
| POST | `/api/kis/order/approval/{id}/approve` | 승인 → 실주문 |
| POST | `/api/kis/order/approval/{id}/reject` | 거절 |

### 설정 / 인증

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/settings` | per-user 런타임 설정 조회 |
| POST | `/api/settings` | 설정 저장 (KIS 키는 자동 암호화) |
| `/api/auth/*`, `/api/users/*` | (in `backend/api/user_system.py`) |

---

## 🖼️ 프론트엔드 가이드

### 라우트

| 경로 | 컴포넌트 | 용도 |
|---|---|---|
| `/` | `page.tsx` | 메인 — 종목 검색, 분석, 모든 패널 |
| `/login` | `app/login/` | 로그인 |
| `/master` | `app/master/` | 관리자 콘솔 (사용자 관리) |
| `/activity` | `app/activity/` | 거래 활동 로그 |

### 주요 컴포넌트

| 컴포넌트 | 역할 |
|---|---|
| `AgentOffice.tsx` | 에이전트별 사고 실시간 뷰 (터미널 미학) |
| `KisPanel.tsx` | 주문 입력 + 2단계 확인 + 승인 카드 |
| `AutoLoopPanel.tsx` | 단일 종목 루프 (settings/activity/trades 탭) |
| `PortfolioLoopPanel.tsx` | 포트폴리오 루프 + 리밸런스 시각화 |
| `BacktestPanel.tsx` | 백테스트 입력 + Recharts 결과 차트 |
| `StockChartPanel.tsx` | 실시간 시세 차트 |
| `DecisionCard.tsx` | 최종 의사결정 카드 (Action/신뢰도/사유) |
| `SettingsPanel.tsx` | 6탭: overview · appearance · llm · analysis · guru · kis |
| `PixelOffice.tsx` | (선택) 픽셀아트 HUD 모드 |

### 사용 흐름 (권장)

1. `/login` 가입 → 메인 진입
2. `SettingsPanel` → `kis` 탭에서 KIS 자격증명 저장 (Fernet 암호화로 DB)
3. `SettingsPanel` → `guru` 탭에서 본인 투자 철학/룰 설정 후 `guru_enabled` ON
4. 메인 검색창에서 종목 검색 → 분석 시작 → `AgentOffice`에서 실시간 토론 관전
5. 결과가 만족스러우면 `KisPanel`에서 직접 주문 (2단계 확인 + 승인 카드)
6. 자동화하려면 `AutoLoopPanel`에서 `paper_trade=true`로 시작 → 충분히 검증 후 실전 전환

---

## 🎨 디자인 시스템

### 테마

| 모드 | 키 | 동작 |
|---|---|---|
| Light | `data-theme="light"` | 흰 캔버스, 진한 텍스트 |
| Dark | `data-theme="dark"` | Linear/Vercel/Toss 영감 — `#0B0D11` 캔버스, 4단계 elevation |
| System | `data-theme="system"` | `prefers-color-scheme` 미디어 쿼리 추종 |

저장: `localStorage["kta:theme"]`. FOUC 방지: `<head>` 내 inline 스크립트로 첫 렌더 전 적용.

### 한국 시장 색 컨벤션

| 토큰 | 의미 | 라이트 | 다크 |
|---|---|---|---|
| `--bull` | 상승 | 빨강 | `#FF5A6B` (덜 채도) |
| `--bear` | 하락 | 파랑 | `#4D8DEF` |
| `--brand` | 브랜드 | 파랑 | `#4D8DEF` |
| `--warning` | 경고 | 호박 | 호박 |

### 폰트

- 본문: **Pretendard Variable** (한국어 최적)
- 모노: **JetBrains Mono** (가격, 티커)

---

## 🛠️ 개발 가이드

### Python

```bash
.venv\Scripts\activate
python run_server.py                 # 개발 서버
python test_comprehensive.py         # 통합 테스트
python test_backtest.py              # 백테스트 단위 테스트
python test_final.py                 # 최종 시나리오 테스트
```

### Frontend

```bash
cd frontend
npm run dev                          # Turbopack 개발 (http://localhost:3000)
npm run lint                         # ESLint
npm run build                        # 프로덕션 빌드
npm start                            # 프로덕션 서버
```

### 주요 코드 컨벤션

- 백엔드: 비동기 우선 (`async/await`), pydantic 모델로 모든 요청/응답 타입화
- LLM: `backend/core/llm.py::create_response(system, user, fast=False)` 한 함수로 추상화 (`fast=True`는 `gpt-5-mini`)
- LLM 출력은 **항상 JSON 강제 + `_safe_parse_json` fallback**
- 프론트: 클라이언트 컴포넌트는 `"use client"`, 토큰만 색 사용 (`var(--bull)`, `var(--bear)` 등 — 하드코딩 금지)

### 추가 문서

`docs/` 폴더:
- `ARCHITECTURE.md` — 전체 시스템 설계
- `AUTO_TRADING_SUPERVISOR.md` — AutoLoop 상세
- `PORTFOLIO_ORCHESTRATION_BLUEPRINT.md` — 포트폴리오 로직
- `KOREAN_MARKET_REALISM_AUDIT.md` — 한국 시장 현실성 감사
- `USER_LEVEL_DB_SCHEMA.md` — Mongo 스키마
- `BACKEND_AUDIT.md` / `FRONTEND_AUDIT.md` — 코드 감사
- `UI_REDESIGN_LIGHT.md` / `UI_REDESIGN_PLAN.md` — 디자인 결정

---

## 🩺 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `MongoDB 미설정` 로그 | `.env`에 `MONGODB_URI` 입력. 무료 Atlas로 충분. |
| 분석은 되는데 SSE가 끊김 | 브라우저 Dev Tools → Network → EventStream 확인. CORS 설정 또는 프록시(특히 회사 망) 의심. |
| `KIS 토큰 발급 실패` | App Key/Secret 오타, 또는 모의/실전 환경 mismatch. `KIS_MOCK` 값 재확인. |
| `상한가 근처/도달` 로그 후 주문 안됨 | 정상. 안전장치 작동 중. |
| LLM 응답이 너무 느림 | `default_llm_model`을 `gpt-5-mini`로, `reasoning_effort=low`로 낮추기 (`config.py`) |
| `FinanceDataReader` 설치 실패 | PyPI 휠 미존재 시 `pip install git+https://github.com/FinanceData/FinanceDataReader.git` |
| Windows에서 `pykrx` 깨짐 | Python 3.12+로 업그레이드, VS Build Tools 설치 |
| 다크모드가 깜빡임 | `<head>`에 `THEME_INIT_SCRIPT`가 있는지 확인 (`layout.tsx`) |

---

## 🛡️ 보안 · 면책

### 보안

- **자격증명 암호화** — KIS App Key/Secret, 주문 페이로드는 모두 `cryptography.Fernet`로 암호화하여 MongoDB 저장.
- **승인 사이클** — 모든 실전 주문은 인앱 2단계 확인 + 승인 레코드 + 만료 시간을 거칩니다.
- **권한 미들웨어** — `require_user`로 다른 사용자의 리소스 접근 차단.
- **`.env`는 git에 절대 커밋 금지** — `.gitignore` 포함.
- **`APP_SECRET_KEY`는 충분히 길고 무작위로** — 최소 32자 권장.

### 면책

> ⚠️ **이 프로젝트는 연구 · 학습 · 개인 사용 목적입니다.**
> 
> 본 시스템을 사용한 모든 매매에 대한 손실은 사용자 본인의 책임입니다. 저자/기여자는 어떤 종류의 손실에 대해서도 책임지지 않습니다.
> 
> - 실전 사용 전 **반드시 모의투자(`KIS_MOCK=true`)로 충분히 검증**하세요.
> - LLM은 환각을 일으킬 수 있으며, 모든 안전장치에도 불구하고 **잘못된 주문 가능성**이 있습니다.
> - 한국 시장의 모든 규칙(서킷브레이커, 변동성 완화장치 등)을 100% 모사하지는 못합니다.
> - 본 코드를 상업적/투자자문 용도로 배포할 때는 **자본시장법** 등 관련 법규를 직접 확인해야 합니다.

---

## 🗺️ 로드맵

- [ ] WebSocket 기반 실시간 호가 (`KIS H0STCNT0`)
- [ ] 시간외 주문 라우팅 (live)
- [ ] 부분 체결 처리
- [ ] 다중 LLM ensemble (Claude + GPT 동시 토론)
- [ ] 모바일 PWA 모드
- [ ] 백테스트 워크포워드 분석 (overfitting 방지)
- [ ] 알림 (텔레그램/Discord 웹훅)
- [ ] 옵션·ETF 지원

## 🤝 기여

PR 환영합니다. 큰 변경은 먼저 Issue로 논의해 주세요.

```bash
git checkout -b feat/내기능
# ... 작업 ...
git commit -m "feat: ..."
git push origin feat/내기능
```

코드 스타일: **Black** (Python), **ESLint** (TypeScript), 테스트 통과 필수.

## 📚 참고 자료

- [TradingAgents](https://github.com/TauricResearch/TradingAgents) — 멀티에이전트 LLM 트레이딩 논문
- [KIS OpenAPI 공식](https://github.com/koreainvestment/open-trading-api)
- [pykrx](https://github.com/sharebook-kr/pykrx) — 한국거래소 데이터
- [FinanceDataReader](https://github.com/FinanceData/FinanceDataReader)
- Kelly, J. L. (1956). *A New Interpretation of Information Rate*

## 📄 라이선스

MIT License. 자세한 내용은 [LICENSE](LICENSE) 참고.

---

<div align="center">

**Made with care for Korean retail traders.**

문제 · 제안 · 토론은 [Issues](https://github.com/picothebird/korean-trading-agents/issues)에 남겨 주세요.

</div>

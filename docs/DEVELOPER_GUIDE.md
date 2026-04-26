# Korean Trading Agents — Developer Guide

> Detailed engineering reference. For end-user setup and product overview, see the
> [main README](../README.md). This document focuses on architecture, data flow,
> API surface, conventions, and operational concerns for contributors.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Layout](#2-repository-layout)
3. [Runtime Architecture](#3-runtime-architecture)
4. [Agent Pipeline](#4-agent-pipeline)
5. [Data Layer](#5-data-layer)
6. [Backend (FastAPI)](#6-backend-fastapi)
7. [Frontend (Next.js)](#7-frontend-nextjs)
8. [Persistence (MongoDB)](#8-persistence-mongodb)
9. [External Integrations](#9-external-integrations)
10. [Development Workflow](#10-development-workflow)
11. [Testing](#11-testing)
12. [Security & Operational Hardening](#12-security--operational-hardening)
13. [Contribution Guide](#13-contribution-guide)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. System Overview

Korean Trading Agents (KTA) is a **multi-agent LLM trading research platform**
specialized for KOSPI/KOSDAQ. It combines:

- **5 specialist analysts** (technical, fundamental, sentiment, macro, backtest)
- **Bull/Bear researcher debate**
- **Risk + Portfolio + Guru managers** for the final call

…all wrapped behind a FastAPI backend with **Server-Sent Events (SSE)** for
live agent thoughts, and a Next.js frontend that visualizes the deliberation
as a "trading floor" stage.

Distinguishing engineering choices:

- The **data layer enforces Korean market reality** (tick size, price limits,
  Volatility Interruption, T+2 settlement, holidays, partial fills) so agents
  cannot produce orders that the Korea Exchange (KRX) would reject.
- The **OpenDART insider-signal classifier** (`data/market/dart.py`) tags every
  disclosure into one of 10 polarity classes and surfaces the strongest signals
  into the sentiment analyst's prompt as a dedicated block, giving insider
  actions higher weight than ordinary news headlines.
- A **judge score** (`bull_score + bear_score = 100`, neutral axis at 50) is
  derived from researcher confidence so the UI never shows counter-intuitive
  splits like 72 / 0.

---

## 2. Repository Layout

```
korean-trading-agents/
├── agents/                       # LLM agent implementations
│   ├── analyst/analysts.py        # 5 specialist analysts
│   ├── researcher/                # Bull/Bear debate (in __init__.py)
│   ├── orchestrator/orchestrator.py  # Pipeline + risk/PM/guru + judge_score
│   └── schemas.py                 # Pydantic output schemas for agents
├── backend/
│   ├── main.py                    # FastAPI app + all REST/SSE routes
│   ├── api/                       # Sub-routers (user_system, office_layouts)
│   ├── core/                      # llm.py, mongodb.py, config.py, events.py,
│   │                              #   rate_limit.py, security.py
│   ├── services/                  # auto_trading, portfolio_trading,
│   │                              #   memory_service
│   └── scripts/                   # Maintenance & migration scripts
├── data/
│   ├── market/                    # fetcher, dart, news, krx_holidays,
│   │                              #   krx_rules, market_meta
│   └── kis/                       # KIS Open API client (auth, balance, order)
├── backtesting/backtest.py        # Vectorized + agent-driven backtests
├── frontend/                      # Next.js 14 (App Router) + Tailwind + Phaser
├── docs/                          # Audits, plans, blueprints
├── run_server.py                  # Uvicorn entrypoint with .env loader
├── requirements.txt
├── start.bat / start.sh           # Convenience launchers
└── test_*.py                      # End-to-end smoke tests
```

The repository is monorepo-style: backend (Python) and frontend (TypeScript)
share the same root and are deployed together.

---

## 3. Runtime Architecture

```
┌────────────────────┐    HTTPS / SSE     ┌──────────────────────────────────┐
│   Next.js (3000)   │◄──────────────────►│       FastAPI (8000)             │
│   App Router        │                    │  ┌──────────┐  ┌──────────────┐ │
│   Phaser stage      │                    │  │ REST     │  │ SSE streams  │ │
│   Zustand stores    │                    │  │ routes   │  │ /analyze/... │ │
└────────────────────┘                    │  └──────────┘  └──────────────┘ │
                                           │         │              │         │
                                           │  ┌──────▼──────────────▼──────┐ │
                                           │  │   Orchestrator             │ │
                                           │  │  (run_analysis)            │ │
                                           │  └──────┬──────────────┬──────┘ │
                                           │         │              │         │
                                           │  ┌──────▼─────┐  ┌─────▼─────┐  │
                                           │  │ Analysts   │  │ Research. │  │
                                           │  │ (5 LLM)    │  │ debate    │  │
                                           │  └──────┬─────┘  └─────┬─────┘  │
                                           │         │              │         │
                                           │  ┌──────▼──────────────▼─────┐  │
                                           │  │ Risk / PM / Guru          │  │
                                           │  └──────┬────────────────────┘  │
                                           └─────────┼─────────────────────────
                                                     │
       ┌────────────────┬─────────────────┬──────────┼──────────┬──────────────┐
       ▼                ▼                 ▼          ▼          ▼              ▼
   OpenAI         OpenDART          KRX feeds    News RSS   MongoDB    KIS Open API
   (LLM calls)    (filings, fund.)  (FDR/pykrx) (4 outlets) (sessions, (orders, balance)
                                                             memory)
```

### SSE channels

`backend/core/events.py` provides an in-memory queue per session
(`stream_thoughts(session_id)`). Each agent emits `AgentThought` records with
`role`, `status`, `content`, and structured `metadata`. The frontend subscribes
to `/api/analyze/stream/{session_id}` and routes events to the appropriate UI
component (timeline, stage, inspector).

A **queue reaper** (`queue_reaper_loop`) drains stale sessions to avoid memory
growth.

---

## 4. Agent Pipeline

### 4.1 Stage 1 — Analyst panel (parallel)

`agents/analyst/analysts.py` defines five `async` functions returning Pydantic
models (`AnalystOutput`):

| Function | Inputs | Outputs |
|---|---|---|
| `technical_analyst(ticker, session_id)` | OHLCV + indicators | signal, confidence, key levels |
| `fundamental_analyst(ticker, session_id)` | DART financials, valuation | signal, ROE/PER/PBR commentary |
| `sentiment_analyst(ticker, company_name, session_id)` | News (4 outlets) + DART disclosures + insider polarity | signal, sentiment_score, event_flags |
| `macro_analyst(session_id)` | KOSPI/KOSDAQ, FX, rates, foreign flows | regime label, signal |
| `get_signal_for_backtest(ticker, indicators)` | Pre-computed indicators | Lightweight signal for replay |

The orchestrator runs the first four with `asyncio.gather`. The backtest
analyst runs separately with windowed data.

### 4.2 Sentiment block — insider signals

Inside `sentiment_analyst`, after fetching news + disclosures, we build:

```python
insider_counts = {}        # polarity -> count
insider_details = []       # [{date, polarity, label, report_nm, flr_nm}, ...]
```

These feed a dedicated prompt section:

```
[🚨 내부자/주요주주 시그널 — 최근 30일 N건 감지]
  · 강한매수신호(자사주매입/소각): 1건
  · 내부자거래발생(방향미상): 8건
  ...

상세:
- [2026-04-24|강한매수신호(자사주매입/소각)] 자기주식취득결과보고서 (제출: 삼성전자)
...
```

The "판단 가이드" instructs the LLM to weight insider activity above ordinary
news headlines, and to treat capital-raising filings (rights offerings, CBs)
as short-term dilution risk.

### 4.3 Stage 2 — Researcher debate

`agents/researcher/__init__.py` exposes `researcher_debate(...)` which:

1. Receives the 5 analyst outputs.
2. Runs a Bull researcher and a Bear researcher in parallel (separate prompts).
3. Returns each side's argument list, supporting evidence, and a confidence in
   `[0, 1]`.

### 4.4 Stage 3 — Risk / PM / Guru

`agents/orchestrator/orchestrator.py`:

- `risk_manager(...)` — outputs `risk_level ∈ {LOW, MEDIUM, HIGH}` plus stop
  loss / take profit suggestions.
- `portfolio_manager(...)` — final `BUY | SELL | HOLD` action with Kelly-based
  position sizing (`_kelly_position_size`). Rejects actions whose risk level
  exceeds the user's allowed level (`_risk_exceeds`).
- `guru_manager(...)` — meta-level coaching from configurable personas
  (Buffett, Lynch, Dalio).

### 4.5 Judge score

`_compute_judge_score(analyst_details, pm_action)` maps each analyst's
`{signal, confidence}` into a 0–100 axis:

```
BUY  @c -> 50 + 50·c
SELL @c -> 50 - 50·c
HOLD    -> 50
```

Then:

```
bull_score = mean(per_analyst_scores)
bear_score = 100 - bull_score
```

A 10-point threshold around 50 yields `BULL | BEAR | DRAW`. This is what the
DecisionCard renders.

---

## 5. Data Layer

### 5.1 `data/market/fetcher.py`

Top-level facade. Gives agents a single function for "get me everything I need
for ticker X": price history, indicators, financials, disclosures, news,
foreign/institutional flows. Internally caches and respects KRX trading hours.

### 5.2 `data/market/dart.py`

OpenDART client. Responsibilities:

- `get_corp_code(ticker)` — caches the `CORPCODE.xml` map.
- `get_financials(corp_code)` — quarterly + annual statements.
- `get_recent_disclosures(corp_code, days, limit)` — returns dicts with
  `category` (regular/material/issuance/...) **and** `insider_polarity` (one
  of 10 classes — see [main README](../README.md#dart-내부자-시그널-10단계-폴라리티)).

Polarity rules live in `_INSIDER_POLARITY_RULES` (a tuple of `(keyword,
polarity)` pairs). `_classify_insider_polarity(report_nm)` does a longest-prefix
match by tuple order. The exported map `INSIDER_POLARITY_LABELS` is used by
the analyst layer to render Korean labels in prompts and UI.

### 5.3 `data/market/news.py`

Aggregates 8 RSS feeds in parallel:

- 4 Google News searches (per ticker / per company name in Korean & Romanized)
- 4 Korean financial outlets:
  - 이데일리 stock RSS (`http://rss.edaily.co.kr/stock_news.xml`)
  - 매일경제 securities RSS (`https://www.mk.co.kr/rss/50200011/`)
  - 파이낸셜뉴스 stock RSS (`https://www.fnnews.com/rss/r20/fn_realnews_stock.xml`)
  - 한국경제 RSS (legacy)

The market-feed batch is filtered by ticker / company_name match because these
feeds are global; Google searches are already scoped.

> **Why not Naver / Paxnet?** Naver's robots.txt allows only their `yeti`
> crawler, and ToS forbids scraping. Paxnet is technically open but >80% of
> the front-page board content is political spam. Both are intentionally out
> of scope; insider signals from DART replace them as a higher-quality input.

### 5.4 `data/market/krx_holidays.py` & `krx_rules.py`

- Holiday list (manual KRX calendar) + helpers `is_trading_day(d)`,
  `next_trading_day(d)`.
- Tick size table per price band, daily price limit (±30%), VI thresholds
  (static ±10% / dynamic ±2~3%), T+2 settlement helpers.

### 5.5 `data/market/market_meta.py`

Lightweight metadata cache: market (KOSPI/KOSDAQ), sector, lot size, listing
state. Used by both backtest and order validation.

### 5.6 `data/kis/`

Korea Investment & Securities Open API client. Implements OAuth token caching,
balance, real-time price, order placement, order cancellation, and the
**approval-queue order flow** (orders are created in `pending` state and only
sent to KIS after a separate approve call).

---

## 6. Backend (FastAPI)

### 6.1 Entry points

- `run_server.py` — production-style entrypoint. Loads `.env` first, then
  starts uvicorn with `--reload` (dev) or `--workers` (prod).
- `backend/main.py` — actual FastAPI app. Re-loads `.env` defensively to handle
  uvicorn's reload-spawned children which inherit a different environment.

### 6.2 Route map

| Group | Method · Path | Purpose |
|---|---|---|
| Health | `GET /health`, `GET /api/health/mongo` | Liveness + DB check |
| Stock | `GET /api/stock/search`, `GET /api/stock/{ticker}`, `GET /api/stock/{ticker}/chart` | Search and quote/chart |
| Analyze | `POST /api/analyze/start` | Kick off pipeline, returns `session_id` |
| Analyze | `GET /api/analyze/stream/{session_id}` | **SSE** of agent thoughts |
| Analyze | `GET /api/analyze/result/{session_id}` | Final structured result |
| Analyze | `POST /api/analysis/{session_id}/ask` | Follow-up Q&A |
| Backtest | `POST /api/backtest` | One-shot vector backtest |
| Backtest (agent) | `POST /api/backtest/agent/start`, `GET .../stream`, `GET .../result`, `POST .../cancel`, `GET .../history` | Agent-driven historical replay |
| Memory | `GET /api/memory/{ticker}`, `POST /api/memory/outcome` | Per-ticker outcome memory |
| Settings | `GET/POST /api/settings` | Per-user prefs |
| Auto-loop | `POST /api/auto-loop/start`, `POST .../stop/{loop_id}`, `GET .../status/{loop_id}`, `GET .../list` | Single-ticker scheduler |
| Portfolio-loop | `POST /api/portfolio-loop/start|stop|scan/{loop_id}`, `GET .../status|list` | Multi-ticker scanner |
| KIS | `GET /api/kis/status|balance|price/{ticker}`, `POST /api/kis/order|order/cancel`, approval flow under `/api/kis/order/approval/{approval_id}` | Brokerage |
| Market | `GET /api/market/indices` | KOSPI/KOSDAQ snapshots |

Sub-routers:

- `backend/api/user_system.py` — auth (cookie + CSRF), registration, login,
  rate-limited.
- `backend/api/office_layouts.py` — Phaser stage layouts persistence.

### 6.3 Rate limiting & CSRF

`slowapi` provides per-route limits (`login_rate`, `register_rate`,
`order_rate`, `analysis_rate`). Cookie-based session tokens are paired with a
double-submit CSRF token; CORS is locked to the `CORS_ORIGINS` env var.

### 6.4 Background services

- `backend/services/auto_trading.py` — single-ticker loop with holiday guard,
  duplicate-start prevention (HTTP 409), persisted state.
- `backend/services/portfolio_trading.py` — scans a watchlist, ranks, and
  triggers analysis for top-N.
- `backend/services/memory_service.py` — stores per-user / per-session
  long-running memory (preferences, past outcomes).

---

## 7. Frontend (Next.js)

### 7.1 Stack

- Next.js 14 (App Router), React 19, TypeScript, Tailwind CSS
- Zustand for state
- Phaser 3 for the office-stage canvas
- Lightweight chart components in `components/StockChartPro.tsx` plus
  `lib/indicators.ts`

### 7.2 Notable components

| Component | Purpose |
|---|---|
| `components/StockChartPro.tsx` | TradingView-style chart |
| `components/IndicatorGuide.tsx` | Learn-mode modal explaining each indicator |
| `components/AnalysisReport.tsx` / `AnalysisResult.tsx` | Final report layout |
| `components/DecisionCard.tsx` | BUY/SELL/HOLD card with judge score |
| `components/stage/AgentStage.tsx` | Phaser scene + meeting metaphor |
| `components/stage/MeetingMinutes.tsx` | Per-agent transcript (raw + structured) |
| `components/agent-timeline/*` | Chronological event feed |
| `components/AutoLoopPanel.tsx`, `PortfolioLoopPanel.tsx` | Loop controls |
| `components/KisPanel.tsx` | Balance / orders / approvals |
| `components/SettingsPanel.tsx` | LLM model, theme, thresholds |

### 7.3 Data hooks (`lib/api.ts`)

Wraps fetch calls with cookie credentials and CSRF header injection. SSE is
consumed via `EventSource` on the analyze stream endpoint.

### 7.4 Time

All KST formatting goes through `lib/kstTime.ts` to avoid client-side timezone
drift.

---

## 8. Persistence (MongoDB)

Collections (typical):

| Collection | Owner | Purpose |
|---|---|---|
| `users` | `user_system` | Auth, hashed credentials, prefs |
| `sessions` | `user_system` | Cookie sessions |
| `analysis_history` | `main.py` | Persisted final analysis outputs |
| `backtest_history` | `backtest.py` | Backtest results |
| `auto_loops` / `portfolio_loops` | `services/*_trading` | Loop state for restart safety |
| `memory_*` | `memory_service` | Per-ticker outcomes, follow-ups |
| `kis_orders`, `kis_approvals` | `data/kis` | Order audit trail |

All access goes through `backend/core/mongodb.py` (`motor` async driver). The
DB name comes from `MONGODB_DB`.

---

## 9. External Integrations

| Service | Purpose | Env keys |
|---|---|---|
| OpenAI | LLM calls (Chat Completions) | `OPENAI_API_KEY`, `LLM_MODEL_*` |
| OpenDART | Filings, financials, multi-quarter history | `DART_API_KEY` |
| BOK ECOS | KR rates, foreign/institution flows, 100 macro indicators | `BOK_API_KEY` |
| FinanceDataReader / pykrx / yfinance | OHLCV, indices | none (rate-limited) |
| Korean Investment Securities | Brokerage | `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_ACCOUNT_NUMBER`, `KIS_ENV` |
| MongoDB | Storage | `MONGODB_URI`, `MONGODB_DB` |

### 9.1 BOK ECOS (한국은행 경제통계)

Issued at <https://ecos.bok.or.kr/api/> (free, instant after signup). Wraps:

| Function (`data/market/bok.py`) | Endpoint | Window |
|---|---|---|
| `get_foreign_net_buy_daily(days=30)` | `802Y001` (KOSPI/KOSDAQ 외국인 일별 순매수) | 30D rolling |
| `get_investor_net_buy_monthly(months=6)` | `901Y055` (KOSPI 월별 기관/개인/외국인) | 6 months |
| `get_kr_rates_daily(days=60)` | `817Y002` (국고 3Y/10Y, 회사채 AA-, 콜, KORIBOR3M) | 60 days |
| `get_key_indicators(top=100)` | `KeyStatisticList` (100대 거시지표) | latest |
| `get_macro_snapshot()` | aggregate | yield curve, credit spread, KR3Y 20D Δ |

Auto-derived: `yield_curve_10y_minus_3y_bp`, `credit_spread_bp`, `kr3yt_20d_change_bp`. Falls back to pykrx if `BOK_API_KEY` missing (note: pykrx 1.2.4 KRX investor parser is broken — set BOK key).

### 9.2 데이터 윈도우·시점 라벨링 (학술 가이드라인)

각 분석가는 데이터의 **시점(as_of)** 과 **윈도우(N거래일/N일/N분기)** 를 프롬프트에 명시. 학술 표준 윈도우:

| 분석가 | 윈도우 | 근거 |
|---|---|---|
| Technical | 252 거래일 (1Y) | Jegadeesh & Titman (1993) — 3-12M 모멘텀; 52주 high/low, MA200 |
| Fundamental | 직전 6개 보고서 (≈1.5Y) | Piotroski (2000) F-Score — 최소 4분기 |
| Sentiment | 30일 뉴스+공시 | Tetlock (2007) / Loughran-McDonald (2011) — 7-30D 톤 영향 |
| Macro flow | 5D/20D + 6M 월별 | Choe-Kho-Stulz (1999) — 외국인 5-60D 지속성 |
| Macro rates | 60D + KeyStat 최신 | Estrella-Mishkin (1996) — 수익률곡선 12M 선행 |
| Macro vol | 20D MA + level | Whaley (2009) — VIX |

`get_technical_indicators` returns explicit `as_of`, `last_bar_date`, `bars_used`, `has_full_year_history`. `dart.get_financials_history` returns periods labeled by `year` + `period_label` (연간/3분기누적/반기/1분기). All analyst prompts open with `[분석 기준 시각]` block citing the timestamp.

---

## 10. Development Workflow

### 10.1 Daily commands

```powershell
# Backend (auto-reload)
.\.venv\Scripts\python.exe run_server.py

# Frontend (hot reload)
cd frontend; npm run dev

# Lint frontend
cd frontend; npm run lint

# Production build
cd frontend; npm run build
```

### 10.2 Code style

- **Python**: 4-space indent, type hints on public APIs, `async def` for IO.
- **TypeScript**: ESLint config in `frontend/eslint.config.mjs`. Avoid `any`
  unless interfacing with raw SSE payloads.
- **Korean strings**: keep prompts/UI labels in Korean. Source files must be
  UTF-8 (no BOM). Never use PowerShell's `Add-Content` on Korean files
  (encodes as ANSI by default — corrupts Hangul).

### 10.3 Git conventions

```
feat(scope): 한국어 한 줄 요약

- 항목 1
- 항목 2
```

`scope` examples: `analyst`, `backend`, `frontend`, `data`, `security`,
`docs`. Reference issue numbers when applicable.

### 10.4 Adding a new analyst

1. Add an `async def my_analyst(...)` in `agents/analyst/analysts.py` returning
   an `AnalystOutput` (or a new schema in `agents/schemas.py`).
2. Register it in `orchestrator.run_analysis` inside the `asyncio.gather`.
3. Pass its output into `_compute_judge_score` and `researcher_debate` so it
   participates in deliberation.
4. Surface it in the UI via `MeetingMinutes` and the timeline.

### 10.5 Adding a new disclosure polarity

1. Add a `(keyword, polarity)` row to `_INSIDER_POLARITY_RULES` in
   `data/market/dart.py`.
2. Add a label to `INSIDER_POLARITY_LABELS`.
3. Update the "판단 가이드" in `sentiment_analyst` if the new class needs
   different weighting.
4. Add the class to the README polarity table and to this guide.

---

## 11. Testing

### 11.1 Component-level checks

There is no formal pytest suite yet. When adding new agents or data sources,
write a temporary verifier under the repo root (e.g.
`_verify_<feature>.py`), run it against 3+ real tickers, and **delete it
before committing** unless it's promoted into a permanent test.

### 11.2 Real-data discipline

The project's working principle is **garbage-in / garbage-out**: any new
signal must be validated against at least 3 live tickers before being merged
into the agent prompt. The DART insider classifier was validated on
`005930 / 000660 / 035720 / 373220 / 196170` and showed distinct polarity
distributions per company, confirming non-trivial signal.

---

## 12. Security & Operational Hardening

Implemented (see `docs/PRE_PRODUCTION_CHECKLIST.md` for the audit log):

- Cookie-based sessions + double-submit CSRF token.
- `slowapi` rate limits on auth/order/analysis endpoints.
- CORS whitelist via `CORS_ORIGINS`.
- KIS order approval queue (orders are not sent to the broker without an
  explicit approve call).
- KRX rule enforcement on every order: tick size, ±30% price limit, VI
  pause, holiday calendar, T+2 settlement, partial fills, lot size.
- `.env` is loaded twice (entrypoint + app) so reload children inherit it.
- MongoDB indexes are created idempotently in `backend/core/mongodb.py`.

Not yet implemented / known limitations:

- No per-user secret encryption at rest beyond MongoDB transport TLS.
- No formal SBOM / dependency scanning.
- LLM responses are not yet sandboxed for prompt-injection attacks beyond
  schema validation.

---

## 13. Contribution Guide

This project is **proprietary, all rights reserved** (see [`LICENSE`](../LICENSE)).
Unsolicited pull requests, forks, and re-implementations are not accepted by
default. If you have a collaboration, research, or licensing proposal, contact
**summust135@gmail.com** in advance and wait for written confirmation before
submitting any code or documentation.

If a contribution has been pre-authorized in writing:

1. Branch from `main` in a fork created with explicit permission.
2. For agent/data changes, include a `_verify_*.py` script result in the PR
   description that proves the new signal is non-trivial on real tickers.
3. For UI changes, attach screenshots (light + dark theme).
4. Keep commits scoped — see [§10.3](#103-git-conventions).
5. Avoid introducing new top-level scripts at the repo root; prefer a
   subdirectory.
6. Korean-language strings: preserve existing tone (analyst-grade, formal but
   not stiff). When in doubt, mirror nearby phrases.
7. Do **not** add scrapers for sites whose robots.txt or ToS prohibit it
   (Naver in particular).
8. By submitting a contribution you assign all rights in it to the copyright
   holder, as set out in §4 of [`LICENSE`](../LICENSE).

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Fundamentals show "정보 부족" | `DART_API_KEY` not loaded | Ensure `.env` is at repo root; run `run_server.py` (not bare uvicorn). |
| Sentiment shows no insider block | Disclosure category missing keyword match | Add a rule to `_INSIDER_POLARITY_RULES`. |
| Bull / bear extreme split (e.g. 100/0) | Pre-fix orchestrator | Already redesigned to neutral axis (50). Confirm `_compute_judge_score` is current. |
| Korean text shows as `?쒓뎅` mojibake | File saved as ANSI/CP949 | Re-save as UTF-8 without BOM. Never use `Add-Content` for Hangul. |
| `EventSource` keeps reconnecting | Reverse proxy buffering SSE | Disable proxy buffering for `/api/analyze/stream/*`. |
| KIS order rejected with "호가 단위" | Tick size violation | Round through `data/market/krx_rules.round_to_tick(price)`. |
| Auto-loop refuses to start with 409 | Duplicate-start guard | Stop the existing loop or wait for it to finish. |
| pip can't install FinanceDataReader | PyPI wheel missing for Python 3.14 | `pip install git+https://github.com/FinanceData/FinanceDataReader.git` |

---

For higher-level design decisions and historical context, browse:

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`KOREAN_MARKET_REALISM_AUDIT.md`](KOREAN_MARKET_REALISM_AUDIT.md)
- [`AUTO_TRADING_SUPERVISOR.md`](AUTO_TRADING_SUPERVISOR.md)
- [`PORTFOLIO_ORCHESTRATION_BLUEPRINT.md`](PORTFOLIO_ORCHESTRATION_BLUEPRINT.md)
- [`PRE_PRODUCTION_CHECKLIST.md`](PRE_PRODUCTION_CHECKLIST.md)

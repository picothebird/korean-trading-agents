# System Architecture

Last updated: 2026-04-26

This document describes the high-level architecture of the Korean Trading Agents
(KTA) system. For developer-level setup and module references, see
[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

## 1. Goal

Build an explainable multi-agent trading research and (paper/live) execution
system tailored to **KRX cash equities**. The system must:

- Treat Korean market microstructure (tick ladder, price-limit band, halt/VI flags,
  T+2 settlement, holiday calendar) as a hard constraint enforced in the data layer.
- Surface every decision step (analyst notes, researcher debate, risk decision,
  portfolio allocation) as inspectable artifacts for the user.
- Support three modes from a single codebase: **single-shot analysis**,
  **continuous auto-trading loop**, and **historical backtest**.

## 2. Component Map

```
+--------------------------------------------------------------+
|                       Frontend (Next.js)                     |
|  pages -> AnalysisReport | AutoLoopPanel | BacktestPanel ... |
|  Phaser pixel office <-> websocket-less polling /events      |
+----------------------------+---------------------------------+
                             | HTTP (FastAPI)
+----------------------------v---------------------------------+
|                     Backend (FastAPI app)                    |
|                                                              |
|  api/         routes  (analysis, auto, portfolio, backtest,  |
|                       account, approvals, settings, auth)    |
|  services/    AutoTradingSupervisor, PortfolioSupervisor,    |
|               OrderApprovalService, MemoryService            |
|  core/        config, db (motor), security                   |
+--------+--------------------+----------------+---------------+
         |                    |                |
         v                    v                v
   +-----------+        +-----------+    +-----------+
   |  agents/  |        |   data/   |    |  Mongo    |
   | analyst   |<-------|  market/  |    |  motor    |
   | research  |        |  kis/     |    |           |
   | orchestr. |        +-----------+    +-----------+
   +-----------+              |
         |                    v
         |              External APIs
         |              - KIS (quote/order/balance)
         |              - OpenDART (filings, financials)
         |              - News RSS x4 outlets
         |              - yfinance fallback
         v
     LLM (OpenAI gpt-5)
```

## 3. Layers

### 3.1 Data Layer (`data/`)
Single source of truth for prices, indicators, fundamentals, filings and
KRX-specific rules. Higher layers must never call external APIs directly.

- `data/market/fetcher.py` - OHLCV + technical indicators
  (RSI, MACD, Bollinger, MA, ATR(14), 20-day sigma, 20-day swing-low),
  with explicit `as_of_date` slicing for no-lookahead in backtests.
- `data/market/dart.py` - OpenDART filings client + a 10-class insider polarity
  classifier (BULLISH_STRONG/WEAK, BEARISH_WEAK/ISSUE_PAID/CB,
  BULLISH_ISSUE_FREE, EVENT_INSIDER/5PCT/OWNERSHIP, NEUTRAL).
- `data/market/krx_rules.py` - tick-size ladder, price-limit band, lot
  normalization, regular/after-hours session model.
- `data/market/market_meta.py` - holiday calendar, half-days, T+2 settlement
  helpers, per-symbol lot lookup.
- `data/kis/` - KIS REST client with retry, halt/warning extraction, paper
  vs. live routing, order cancel/amend wrappers.

### 3.2 Agent Layer (`agents/`)
Orchestrates LLM calls. Strict separation of analyst, researcher, and
manager roles to keep prompt context narrow and reasoning auditable.

- `agents/analyst/analysts.py` - 4 specialist analysts (technical, fundamental,
  sentiment, macro) executed in parallel via `asyncio.gather`.
- `agents/researcher/researchers.py` - bull and bear researchers consume
  analyst summaries and produce a structured debate.
- `agents/orchestrator/orchestrator.py` - drives the full pipeline:
  `analysts -> researchers -> risk_manager -> portfolio_manager -> judge_score`.
  `risk_manager` consumes `atr_pct` / `sigma_20d_pct` / `swing_low_drop_pct`
  from the technical analyst's `raw_data` to compute a volatility-grounded
  recommended stop-loss (`max(1.5 x ATR, sigma * sqrt(5))`, clamped to 3-15%).
- `agents/schemas.py` - pydantic v2 schemas for every typed agent output.

### 3.3 Backend Layer (`backend/`)
FastAPI app exposing the system to the frontend and to operators.

- `backend/main.py` - app factory, route mounting, dotenv autoload, CORS,
  CSRF protection, cookie session middleware.
- `backend/api/` - 38 routes grouped by feature (analysis, auto loop,
  portfolio loop, backtest, account, settings, approvals, auth).
- `backend/services/auto_trading.py` - per-user, per-symbol auto loop with
  KRX session/limit/halt guards and paper/live execution split.
- `backend/services/portfolio_supervisor.py` - cross-symbol orchestration,
  bounded analysis concurrency, shared cash and position-count budget.
- `backend/services/order_approvals.py` - human-in-the-loop approval queue
  for live orders above configured thresholds.
- `backend/services/memory_service.py` - per-user persistent notes used to
  stabilize agent context across sessions.

### 3.4 Frontend Layer (`frontend/`)
Next.js 14 App Router. State held in Zustand stores; the pixel "office"
view is a Phaser 3 scene driven by the same store data.

- `AnalysisReport`, `DecisionCard`, `AnalysisResult` - render the analyst
  panel, researcher debate, and final risk/portfolio decision.
- `AutoLoopPanel`, `PortfolioLoopPanel` - operator controls for continuous
  loops, including session-aware status and order approval prompts.
- `BacktestPanel` - simple-bar backtest and agent backtest with anti-lookahead
  guarantees from the data layer.

## 4. Decision Flow (Single Ticker)

1. Client calls `POST /analysis` with ticker.
2. Orchestrator launches the 4 analysts in parallel; each pulls only data the
   data layer is willing to surface for the requested as-of date.
3. Bull and bear researchers consume the four analyst summaries.
4. `risk_manager` receives the technical analyst's `raw_data`, computes the
   volatility-based stop-loss candidates, and asks the LLM to choose within
   the allowed band. Outputs include `volatility_inputs` for inspector display.
5. `portfolio_manager` produces the final action, sizing, and rationale.
6. `judge_score` aggregates a neutral-axis bull/bear score (50 = neutral).
7. The full artifact (analyst notes, debate, risk JSON, portfolio JSON, score)
   is returned and persisted under the user's session.

## 5. Loop Modes

**Auto loop** (single ticker per session) - `AutoTradingSupervisor` runs the
above pipeline on a configurable cadence, applies KRX session/halt/limit
guards, and either submits to KIS or appends to the paper book.

**Portfolio loop** (multi-ticker) - `PortfolioSupervisor` scans a universe,
ranks candidates, and runs per-symbol analysis with bounded concurrency,
sharing a global cash and risk budget across positions.

**Backtest** - `backtesting/backtest.py` replays the same pipeline at past
as-of dates with delayed (t+1 close) fill, KRX tick rounding, fee/tax/slippage
modeling, and explicit no-lookahead checks.

## 6. Cross-Cutting Concerns

- **Time integrity** - quote timestamps are validated against the current KST
  second; future-dated quotes are dropped. Backtests never read beyond
  `as_of_date`.
- **Auditability** - every analyst, researcher, risk, and portfolio output is
  stored as JSON and surfaced through the inspector view.
- **KRX realism** - tick rounding, lot normalization, price-limit band,
  T+2 settlement, holiday calendar, and VI/halt awareness are enforced in the
  data layer rather than per-call. See
  [KOREAN_MARKET_REALISM_AUDIT.md](KOREAN_MARKET_REALISM_AUDIT.md).
- **Security** - HttpOnly+Secure session cookies, CSRF token on state-changing
  routes, login rate limit, encrypted KIS credentials at rest.

## 7. Reference Documents

- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - module-level developer reference
- [AUTO_TRADING_SUPERVISOR.md](AUTO_TRADING_SUPERVISOR.md) - per-symbol loop
- [PORTFOLIO_ORCHESTRATION_BLUEPRINT.md](PORTFOLIO_ORCHESTRATION_BLUEPRINT.md) -
  multi-symbol orchestration
- [KOREAN_MARKET_REALISM_AUDIT.md](KOREAN_MARKET_REALISM_AUDIT.md) -
  KRX-specific constraints
- [PRE_PRODUCTION_CHECKLIST.md](PRE_PRODUCTION_CHECKLIST.md) - launch readiness

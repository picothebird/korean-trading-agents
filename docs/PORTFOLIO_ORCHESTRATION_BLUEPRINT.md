# Portfolio Orchestration Blueprint

Last updated: 2026-04-26
Status: Phase A delivered; Phase B partially delivered (state persistence done,
SSE stream still pending). Phase C remains future work.
Scope: multi-asset monitoring -> candidate discovery -> portfolio construction -> parallel analysis/execution.

## 1. Background

Current repository already supports:
- Single ticker analysis (`run_analysis`)
- Single ticker server loop (`AutoTradingSupervisor`)
- KIS quote/order/balance wrappers
- Backtest with anti-lookahead and KRX micro rules

Gap:
- No server-managed portfolio-level orchestration for multiple symbols
- No continuous market scan + candidate ranking
- No global resource allocation (cash and risk budgets) across symbols
- No portfolio-level UI/API for monitoring and control

## 2. Goal

Build a portfolio supervisor that continuously:
1. Monitors market universe
2. Discovers promising candidates
3. Builds target portfolio weights
4. Runs per-symbol analysis in parallel (bounded concurrency)
5. Rebalances positions and executes trades under shared risk/cash constraints
6. Streams status/logs to frontend for control and observability

## 3. Constraints and Safety

- No future data reference:
  - live quote HHMMSS must not exceed current KST second
  - invalid/future quote timestamps are skipped
- Session guard:
  - paper: configurable regular-only or regular+after-hours
  - live: regular session only for now
- KRX realism:
  - tick size rounding
  - integer share lot normalization
  - fee/slippage/tax accounting
- Risk limits:
  - max position count
  - max single-position weight
  - confidence threshold gate
  - warning/halt/limit edge blocks from quote state

## 4. Target Architecture

### 4.1 Backend Modules

1. `PortfolioSupervisor`
- Server resident manager (start/stop/status/list)
- Owns runtime states for multiple portfolio loops

2. `UniverseScanner`
- Uses listing + technical snapshots to score symbols
- Produces ranked candidates every cycle

3. `AllocationEngine`
- Combines candidate score and AI confidence
- Produces normalized target weights with caps

4. `ParallelAnalysisEngine`
- Executes `run_analysis` per ticker concurrently
- Uses semaphore (`max_parallel_analyses`) for resource control

5. `RebalanceExecutor`
- Converts target/current weights into trade plans
- Executes paper/live orders with global shared cash

### 4.2 Frontend Modules

1. Portfolio tab and control panel
- Start/stop portfolio loop
- Configure scan/parallel/risk settings

2. Runtime observability
- candidate ranking table
- target weights table
- shared account/equity summary
- latest decisions/trades/logs

3. Existing integration
- Keep single ticker loop and KIS panel unchanged
- Add portfolio-level panel as additional flow

## 5. Data Model

### 5.1 Settings

`PortfolioLoopStartRequest` (core fields)
- `name`
- `seed_tickers[]`
- `preferred_tickers[]`
- `excluded_tickers[]`
- `interest_keywords[]`
- `monitoring_profile` (`balanced` | `momentum` | `defensive`)
- `market_scan_enabled`
- `universe_limit`
- `candidate_count`
- `max_positions`
- `max_parallel_analyses`
- `cycle_interval_min`
- `min_confidence`
- `max_single_position_pct`
- `paper_trade`
- `initial_cash`
- `fee_bps`, `slippage_bps`, `tax_bps`
- `execution_session_mode`

### 5.2 Monitoring Criteria (What to Monitor)

Common baseline factors (always monitored):
- trend: MA5/MA20 gap (`ma_gap_pct`)
- momentum: daily return (`change_pct`)
- oscillator: RSI regime
- momentum confirmation: MACD histogram sign
- liquidity: log-scaled volume score

Preference overlays (user-specific):
- `preferred_tickers`: explicit boost in candidate score
- `excluded_tickers`: hard exclusion from scan universe
- `interest_keywords`: company name/sector/industry keyword boost
- `monitoring_profile`:
  - `balanced`: equal-ish weighting
  - `momentum`: stronger trend/momentum emphasis
  - `defensive`: stronger liquidity/quality emphasis

### 5.3 Runtime Status

`PortfolioLoopStatus` (core fields)
- loop identity/lifecycle fields
- market scan output (`latest_candidates`)
- allocation output (`target_allocations`)
- per-symbol latest decisions
- shared account state (cash, equity, positions)
- trades/logs/stats

## 6. Runtime Cycle

1. Session gating check
2. Build universe:
- seed tickers + scanned listing subset
3. Score and rank candidates
4. Select top N candidates, then top max_positions
5. Run analyses in parallel (bounded)
6. Convert actions/confidence to desired weights
7. Normalize and cap weights
8. Fetch current quotes
9. Build rebalance trade plans
10. Execute (paper/live) and update shared state
11. Persist status snapshots for API/UI

## 7. API Contract

- `POST /api/portfolio-loop/start`
- `POST /api/portfolio-loop/stop/{loop_id}`
- `GET /api/portfolio-loop/status/{loop_id}`
- `GET /api/portfolio-loop/list`
- `POST /api/portfolio-loop/scan/{loop_id}` (on-demand manual scan)

Dual scan modes:
- periodic scan: every `cycle_interval_min` via supervisor scheduler
- on-demand scan: user-triggered immediate scan via API/UI button

Response shape is designed to be poll-friendly for frontend every few seconds.

## 8. Implementation Phases

Phase A - delivered
- Backend `PortfolioSupervisor` + REST API
- Frontend types, client, panel, and tab integration
- Paper/live execution path with shared account bookkeeping
- Static diagnostics and smoke validation

Phase B - partially delivered
- [x] State persistence (Mongo) with duplicate-start protection (409)
- [x] Holiday and half-day session guards via `data/market/market_meta.py`
- [ ] SSE stream for portfolio loop (polling is sufficient today)
- [ ] Sector and correlation-aware allocation

Phase C - future
- Stochastic latency / queue model in paper and backtest fills
- After-hours live routing with explicit order-code policy

## 9. Debug and Validation Plan

- Static checks:
  - Python/TS editor diagnostics on touched files
- Runtime smoke:
  - Start loop with paper mode and small seed set
  - Verify candidates -> allocations -> decisions -> trades
  - Confirm cycle skips for session/future timestamp guards
- Regression checks:
  - existing single ticker auto loop endpoints unchanged
  - existing trading/backtest tabs unaffected

## 10. Delivery Criteria

Done when:
- Portfolio loop can be started/stopped from UI
- Portfolio runtime status updates in UI
- Multiple symbols are analyzed in parallel with bounded concurrency
- Shared cash/position allocation and rebalance trades are executed
- Static diagnostics show no new critical errors on changed files

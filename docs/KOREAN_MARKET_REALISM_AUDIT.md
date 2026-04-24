# Korean Market Realism and Time-Leakage Audit

Last updated: 2026-04-25
Scope: Korean cash equities (KRX) mock/live loop and backtesting paths in this repository.

## 1) Executive Summary

This audit checks two things requested by the user:

1. Are Korean market execution factors represented with explicit numeric assumptions?
2. Is mock/backtest logic controlled to avoid future-data leakage?

Current status after this update:

- Time-leakage control improved:
  - Simple backtest now uses delayed execution (signal on day t, fill on day t+1).
  - Agent backtest prediction monitoring no longer reads future prices at signal time.
- Execution realism improved:
  - KRX tick-size rounding and integer lot normalization are applied in backtest fills and paper/live planning.
  - Market-state blocks added for halt flag, warning codes, and limit-up/limit-down edge cases.
  - Session model split added (`regular_only` vs `regular_and_after_hours`) with session-aware paper slippage.
- Korean numeric assumptions are now documented with implemented vs missing coverage.
- Default cost assumptions were normalized to avoid double-counting tax:
  - fee_bps default changed from 28.0 to 1.5 (one-way fee baseline).
  - tax_bps remains 18.0 (sell-side tax).
  - slippage_bps remains 3.0.

## 2) Coverage Matrix (Numeric Rules and Constraints)

Legend:
- Implemented: directly modeled in code path
- Partial: partly modeled, simplified
- Missing: not modeled yet

| Factor | Baseline Numeric Rule | Status | Where | Source Confidence | Notes |
|---|---:|---|---|---|---|
| Regular session time gate | Weekday 09:00-15:30 KST | Implemented | `backend/services/auto_trading.py`, `data/market/krx_rules.py` | High | Live mode executes only regular session. |
| Extended-hours sessions | Pre-open, post-close, single-price after-hours sessions exist | Partial | `backend/services/auto_trading.py`, `data/market/krx_rules.py` | Medium | `regular_and_after_hours` modeled for paper flow; live time-after-hours routing is intentionally blocked for now. |
| Tick size ladder (KRW) | `<2,000:1`, `<5,000:5`, `<20,000:10`, `<50,000:50`, `<200,000:100`, `<500,000:500`, `>=500,000:1,000` | Partial | `data/market/krx_rules.py`, `backtesting/backtest.py`, `backend/services/auto_trading.py` | Medium | Applied to simulated/backtest fill-price modeling; live market order fill price itself is broker-side outcome. |
| Order lot granularity | Default 1 share; instrument-specific units possible | Implemented (basic) | `data/market/krx_rules.py`, `backtesting/backtest.py`, `backend/services/auto_trading.py` | Medium | Integer lot normalization applied with lot=1 baseline. |
| Buy-side fee | Default 1.5 bps | Implemented | `backend/main.py`, `backend/services/auto_trading.py`, `frontend/src/components/AutoLoopPanel.tsx` | Medium | User configurable. Represents one-way broker fee baseline. |
| Sell-side fee | Default 1.5 bps | Implemented | same as above | Medium | Applied via same `fee_bps` on sell notional. |
| Sell-side tax | Default 18.0 bps | Implemented | `backend/services/auto_trading.py` | Medium | Applied only on sell in paper-trade execution. |
| Slippage | Default 3.0 bps (per side) | Implemented | `backend/services/auto_trading.py` | Medium | Symmetric buy/sell slippage model. |
| Cash/shares feasibility | Buy limited by cash, sell limited by holdings | Implemented | `backend/services/auto_trading.py` (`_plan_trade`, `_apply_paper_trade`) | High | Prevents impossible paper fills by balance. |
| Position cap | `max_position_pct` default 25% | Implemented | `backend/services/auto_trading.py` | High | Guards concentration risk in auto-loop. |
| Price-limit (daily limit-up/down) | Typical KRX cash equity limit band exists | Partial | `backend/services/auto_trading.py`, `data/kis/trading.py` | Medium | Buy-at-upper and sell-at-lower edge conditions are blocked in auto-loop. |
| Volatility interruption (VI) behavior | Intraday auction interruptions exist | Missing | N/A | Low | No VI state feed integration in execution model. |
| Halt/warning flags | Trading halt/investor warning fields exist in APIs/master | Partial | `data/kis/trading.py`, `backend/services/auto_trading.py` | Medium | `trht_yn` and warning code are checked; strict/balanced modes apply additional blocks. |
| Partial fills and queue dynamics | Real market can partial fill and leave residuals | Missing | N/A | High | Current paper model assumes immediate full fill at adjusted price. |
| Latency/requote/retry | Network and gateway delay/retry | Partial | `data/kis/client.py` + callers | Medium | API failure handling exists, but no stochastic latency model in backtest/paper fills. |

## 3) Time-Leakage Audit (No Future Data)

### 3.1 Data as-of control
- Technical indicators support explicit as-of date:
  - `data/market/fetcher.py` -> `get_technical_indicators(..., as_of_date=...)`
- Agent backtest uses this as-of date on each rebalance day.

### 3.2 Simple backtest
Before:
- Signal and trade executed on the same bar close.
- This is a classic look-ahead issue when using close-based signal.

Now:
- Signal is computed on day t.
- Order is executed at day t+1 close (delayed fill) using a pending signal queue.
- This removes same-bar future leakage.

Updated file:
- `backtesting/backtest.py` (`run_simple_backtest`)

### 3.3 Agent backtest monitoring trace
Before:
- Prediction monitoring code read future evaluation price immediately when signal was generated.
- Trading path itself was delayed and safe, but monitoring metrics had future peek.

Now:
- Prediction points are created at signal time with predicted fields only.
- Actual return/hit are evaluated only when evaluation date is reached in loop.
- If eval date is beyond processed loop end, final date fallback is applied explicitly.

Updated file:
- `backtesting/backtest.py` (`run_agent_backtest`)

## 4) Cost Assumption Clarification

To avoid implicit double-counting confusion, defaults are now separated by component:

- `fee_bps = 1.5` (one-way fee)
- `slippage_bps = 3.0` (one-way slippage)
- `tax_bps = 18.0` (sell-side tax)

Approximate round-trip drag under defaults:
- Buy side: `1.5 + 3.0 = 4.5 bps`
- Sell side: `1.5 + 3.0 + 18.0 = 22.5 bps`
- Total: `27.0 bps`

This is close to prior simplified 28 bps total assumption, but now components are explicit.

## 5) Remaining Gaps and Priority Improvements

Priority 1 (high impact realism):
1. Partial fill model (probabilistic or orderbook-driven) and residual order carry-over.
2. Per-symbol lot size and instrument-type specific constraints from master files.
3. VI (volatility interruption) state-aware fill/skip logic.

Priority 2 (execution realism):
1. Live after-hours routing (order code and price policy per session) with explicit safeguards.
2. Queue/latency simulation in paper/backtest (arrival delay and price impact bands).

Priority 3 (operations):
1. Daily assumptions snapshot in logs (fees/tax/slippage/session) for reproducibility.
2. Config profiles (conservative/neutral/aggressive) with documented parameter sets.

## 6) Second-Level No-Lookahead Recheck

Question checked: "Are we really using only data available at that exact second, without future reference?"

Result by path:

1. Auto-loop live/paper path: PASS (current architecture)
- Each cycle fetches current quote once via KIS and makes decisions from that snapshot.
- Quote response now captures `stck_cntg_hour` (HHMMSS) as `price_time` for traceability.
- If quote time appears later than current KST second, the cycle is skipped by guard logic.
- There is no code path that reads a later timestamped quote inside the same decision before execution.

2. Backtest path: PASS for bar-level, NOT second-level by design
- Backtests in this repository use daily bars (`Close`) and as-of-date indicator slicing.
- Future bars are blocked, but second-level microstructure cannot be represented with daily data.
- Therefore this is no-lookahead at bar granularity, not a tick-level simulator.

## 7) Reference Notes Used for This Audit

Primary references used in this pass:
- KIS open-trading-api public examples and utilities:
  - domestic market-time output fields include `s_time` and `e_time`
  - examples for after-hours quote/trade endpoints
  - backtester utility tick-size ladder comments and helper functions
- Current repository code paths (listed above)

Because some official portal pages are dynamic and hard to scrape reliably in this environment, this audit labels confidence by each factor and keeps all numeric assumptions explicit/configurable.

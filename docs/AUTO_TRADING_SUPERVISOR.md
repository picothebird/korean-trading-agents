# Auto Trading Supervisor

Last updated: 2026-04-26

The auto trading supervisor is the per-user, per-symbol continuous loop that
turns the multi-agent analysis pipeline into a recurring decision and
(paper or live) execution cycle.

Source: [`backend/services/auto_trading.py`](../backend/services/auto_trading.py)

## 1. Responsibilities

1. Run the analysis pipeline (4 analysts -> 2 researchers -> risk manager ->
   portfolio manager) on a configurable cadence.
2. Enforce KRX session, holiday, halt, VI, and price-limit guards before any
   order is placed.
3. Translate the portfolio manager's decision into a concrete order ticket
   that respects tick size, lot size, position cap, and cash availability.
4. Route the ticket to either the paper book or KIS live endpoint, based on
   the user's runtime mode and approval status.
5. Stream status, logs, and decisions back to the frontend via polling
   endpoints, and persist runtime state for restart safety.

## 2. Lifecycle

```
        +------------------+
        |  start request   |
        +--------+---------+
                 |
                 v
       +---------+----------+        +-----------------+
       |  load runtime cfg  +------->|  resume state   |
       |  (per user/symbol) |        |  from Mongo     |
       +---------+----------+        +-----------------+
                 |
                 v
        +--------+---------+    no    +------------------+
        |  session guard?  +--------->|  sleep til open  |
        +--------+---------+          +------------------+
                 | yes
                 v
        +--------+---------+
        |  fetch snapshot  |
        |  (quote/halt/vi) |
        +--------+---------+
                 |
                 v
        +--------+---------+
        |  run pipeline    |
        |  (orchestrator)  |
        +--------+---------+
                 |
                 v
        +--------+---------+    block  +------------------+
        |  pre-trade gate  +---------->|  log & next tick |
        | (limit/halt/cash)|           +------------------+
        +--------+---------+
                 | pass
                 v
        +--------+---------+    live   +------------------+
        |  approval gate   +---------->|  approval queue  |
        +--------+---------+           +------------------+
                 | paper / approved
                 v
        +--------+---------+
        |  submit order    |
        |  (paper or KIS)  |
        +--------+---------+
                 |
                 v
        +--------+---------+
        |  persist + emit  |
        |  events for UI   |
        +------------------+
```

## 3. Inputs

- **Runtime config** (per user, per symbol):
  ticker, paper/live mode, cadence (seconds), max position pct, cash budget,
  confidence threshold, KRX session policy (regular only vs. include after-hours
  for paper), strict/balanced halt/warning policy, fee/tax/slippage assumptions.
- **Account snapshot** (live mode): cash balance, current holdings,
  today realised PnL.
- **Market snapshot**: KIS quote (price, time, halt, warning, price-band edge),
  market state (regular/half-day/holiday from `market_meta`).
- **Approval state**: pending approvals from `OrderApprovalService`.

## 4. Pre-Trade Gate

Order is rejected (loop continues, no exception) if any of the following hold:

- KRX is closed or holiday/half-day window passed.
- Quote timestamp is not strictly less than or equal to current KST second
  (no future quotes).
- Halt flag (`trht_yn`) or VI active flag (`vi_yn`) is set, or warning code
  is in the strict block list.
- Buy at upper limit or sell at lower limit (price-band edge).
- Buy notional exceeds available cash; sell quantity exceeds holdings.
- Resulting weight would exceed `max_position_pct`.
- Confidence score below `min_confidence`.
- T+2 settlement check: cash already committed by an unsettled buy is not
  reused for another buy on the same symbol within the settlement window.

## 5. Order Construction

Once the gate passes, the supervisor:

1. Rounds limit price to the KRX tick ladder appropriate for the price.
2. Normalizes share quantity to the symbol's lot size (default 1).
3. Re-checks notional against budget after rounding.
4. For live mode, signs and sends via the KIS REST client; the response is
   parsed for order id, fill status, partial-fill quantity, and any error
   code that should pause the loop.
5. For paper mode, applies the configured slippage and tax model and appends
   to the user's paper book.

## 6. Persistence and Restart

- Active loops are written to a Mongo collection on every state change
  (`status`, `last_decision`, `last_order_id`, `cumulative_paper_pnl`).
- On server restart the supervisor scans for `status in (running, paused)`
  loops and restores them in-memory; users see no observable change beyond
  a small gap in the cadence.
- Paper book entries and approval queue items are also Mongo-backed.

## 7. Events Surface

The frontend uses short-poll endpoints rather than SSE/WebSocket today:

- `GET /auto/status?user_id=...` - per-loop status, last decision, last order
- `GET /auto/log?user_id=...&symbol=...` - last N log lines
- `GET /approvals/pending?user_id=...` - pending live-order approvals

The chosen poll interval (default 3 s) is fast enough for the per-cadence
loop yet cheap on the FastAPI worker.

## 8. Failure Modes

| Failure                          | Behaviour                                       |
|----------------------------------|-------------------------------------------------|
| KIS HTTP error / token expired   | Auto-refresh token; back off; mark cycle failed |
| LLM timeout or schema violation  | Skip cycle, log, continue at next cadence       |
| Mongo unavailable                | Loop pauses; status surfaces error to UI        |
| Holiday / unexpected closed day  | Loop sleeps until next open; no orders sent     |
| Order rejected by exchange       | Log code, do not retry; surface in UI          |

## 9. Operator Controls

- Start, stop, and pause are idempotent and per-symbol.
- Mode change (paper <-> live) requires a fresh start (intentional, to avoid
  ambiguous mid-cycle state).
- The runtime config can be edited live; new settings apply on the next
  cadence boundary.
- All live orders above the configured notional threshold pass through the
  human approval queue.

## 10. Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) - system-level component map
- [PORTFOLIO_ORCHESTRATION_BLUEPRINT.md](PORTFOLIO_ORCHESTRATION_BLUEPRINT.md) -
  multi-symbol supervisor on top of this single-symbol loop
- [KOREAN_MARKET_REALISM_AUDIT.md](KOREAN_MARKET_REALISM_AUDIT.md) -
  rationale and coverage of the KRX guards used here
- [PRE_PRODUCTION_CHECKLIST.md](PRE_PRODUCTION_CHECKLIST.md) - go-live gate

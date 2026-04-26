# Pre-Production Master Checklist

Last updated: 2026-04-26

This document is the single source of truth for "is the system safe to expose
to real users and real money?". It consolidates the cross-cutting findings
from the per-area audits (backend, frontend, KRX market realism, auto trading
supervisor, user-level DB schema, UX) and tracks remediation status against
the production-launch gate.

Inputs (live):
- [KOREAN_MARKET_REALISM_AUDIT.md](KOREAN_MARKET_REALISM_AUDIT.md)
- [AUTO_TRADING_SUPERVISOR.md](AUTO_TRADING_SUPERVISOR.md)

Prior internal audits (backend, frontend, DB schema, UX) have been folded
into the items below and are no longer maintained as separate documents.

---

## 0. Executive Summary

| Area                       | State                                                | Production Ready |
|----------------------------|------------------------------------------------------|------------------|
| Functional UX              | Beginner-to-expert audit 24/25 closed                | Yes              |
| Backend stability          | Functional; resilience/observability still partial   | Conditional      |
| Security (auth, crypto)    | Critical batch (16) + cookie/CSRF closed             | Yes (verify)     |
| Korean market realism      | VI, T+2, holidays, lot_size, partial-fill landed     | Yes (verify)     |
| Operations (backup, monitor)| Backup, Sentry, structured health probe pending     | Conditional      |
| Tests                      | HTTP smoke present; pytest unit + RBAC suite pending | Conditional      |

Overall: the system is safe for **invite-only / supervised live trial** today.
Public launch with unsupervised real money requires the items in section 2
to be complete and the QA suite in section 6 to be green.

---

## 1. Audit Folding Summary

The per-area audit documents that previously tracked the items below have
been archived (kept in git history). The verified outcomes are:

| Source audit                | Items | Status   | Notes                                                              |
|-----------------------------|------:|----------|--------------------------------------------------------------------|
| Backend audit               |     9 | Closed   | Residual risks promoted to this document                           |
| Frontend audit              |    12 | Closed   | 14 newly observed items moved into sections below                  |
| Korean market realism       |     - | Matrix   | VI, T+2, holiday, half-day, lot_size closed (commit `ccb9ece`)     |
| Auto trading supervisor     |     4 |    2/4   | Remaining: SSE events, strategy-profile separation                 |
| User-level DB schema        |     8 | Closed   | All eight closed in commits `950d8d0`, `ccb9ece`                   |
| UX beginner-to-expert       | 25    |    24/25 | One item out of scope                                              |

---

## 2. Critical (Launch Blockers)

All items in this section have been addressed. They are listed for traceability
and re-verification before each release tag.

### A. Auth and Session
- [x] **A1** HttpOnly + Secure session cookies (replaces localStorage tokens)
- [x] **A2** Login rate limit (per IP and per account)
- [x] **A3** Bcrypt cost >= 12 enforced; password rotation policy documented
- [x] **A4** KIS API keys encrypted at rest with per-user data key
- [x] **A5** CSRF token on all state-changing routes; same-site lax cookies

### B. Security Headers and CORS
- [x] **B1** Strict CORS allowlist (no wildcard in production)
- [x] **B2** Security headers (CSP, X-Frame-Options, Referrer-Policy, HSTS)
- [x] **B3** Trusted-host middleware bound to deployment domains

### C. Loop State Persistence
- [x] **C1** AutoTradingSupervisor state persisted; restored on restart
- [x] **C2** PortfolioSupervisor state persisted; duplicate-start blocked (409)

### D. Database Hardening
- [x] **D1** Compound indexes on `user_id + symbol`, `user_id + ts`
- [x] **D2** TTL index on session, approval, log collections
- [x] **D3** Single-document-size guard for paper book and log entries

### E. Input Validation and Quotas
- [x] **E1** Pydantic models on every body; query/path constraint validators
- [x] **E2** Per-user request quota; per-route burst limits
- [x] **E3** Payload size cap on FastAPI; multipart disabled where unused

### KIS Trading Safety
- [x] **K1** Visual paper-vs-live mode separation; first live order guard
- [x] **K2** Order cancel/amend wrappers; reject paths surface to UI
- [x] **K3** Pre-trade validation (cash, holdings, tick, lot, limit band)

### Korean Market Realism (Critical Subset)
- [x] **M1** VI (volatility interruption) flag honored; orders skipped
- [x] **M2** Price-limit upper/lower edge blocks both buy and sell direction
- [x] **M4** Holiday calendar + half-day window (e.g., 12/30 14:00 close)
- [x] **M4b** T+2 settlement: committed cash not reused within window
- [x] **M5** Partial-fill model with residual carry; UI surfaces remainder
- [x] **M6** Per-symbol lot size from KIS master; default 1 fallback

---

## 3. High Priority (Within 1-2 Sprints)

### F. Frontend
- [ ] **F1** Skeleton + error-boundary on every panel that fetches
- [ ] **F2** Suspense-aware route transitions on App Router
- [ ] **F3** Inspector "diff vs. last cycle" view for auto loop decisions
- [ ] **F4** A11y pass: aria-live for status, focus traps in modals
- [ ] **F5** Bundle audit; lazy-load Phaser scene; defer chart libs
- [ ] **F6** Empty-state copy for new users (no portfolios, no history)

### Backend
- [ ] **G1** Structured logging (JSON) and request-id propagation
- [ ] **G2** Health probe split (`/health/live`, `/health/ready`)
- [ ] **G3** Rate-limit telemetry exported to Prometheus
- [ ] **G4** Job-queue extraction for long LLM calls (decouple HTTP worker)

### Korean Market
- [ ] **M3** Stochastic latency model in paper/backtest fills
- [ ] **M7** After-hours order routing (KIS order codes 03 / 10) wired up
- [ ] **M8** Daily assumptions snapshot logged with each cycle

### Ops, Backup, Monitoring
- [ ] **O1** Mongo daily backup + restore drill
- [ ] **O2** Sentry on backend and frontend with release tagging
- [ ] **O3** Auto-loop status SSE replaces polling (optional but desired)

### Tests
- [ ] **T1** Pytest suite for orchestrator, KRX rules, market_meta
- [ ] **T2** RBAC tests for admin vs. user routes
- [ ] **T3** Playwright e2e for the analyze -> auto-loop -> approve flow

---

## 4. Medium (Within 1 Month)

### Auth and Security
- [ ] **U1** Optional 2FA (TOTP) for live-mode users
- [ ] **U2** Session revocation list and admin force-logout

### Frontend UX
- [ ] **UX1** Color-blind safe palette pass on bull/bear and risk indicators
- [ ] **UX2** Per-locale number/currency formatting via Intl

### Backend
- [ ] **B4** Background reconciliation of KIS holdings vs. local cache
- [ ] **B5** Strategy-profile object separated from `guru_risk_profile`

### Korean Market
- [ ] **M9** Per-instrument-type constraints (ETF, REIT, foreign-listed) honored
- [ ] **M10** Tick-rounding applied to live limit orders before send

### Ops
- [ ] **O4** Synthetic monitor: "analyze 005930" canary every 15 min
- [ ] **O5** Cost dashboard (LLM tokens per user per day)

---

## 5. Low (Nice-to-Have)

- [ ] Light/dark theme polish on Phaser scene
- [ ] Per-user audit-export endpoint (PDF/CSV)
- [ ] Multi-language support beyond Korean and English

---

## 6. Final QA Scenarios (Manual + Automated)

### QA-A. Auth and RBAC
- Cannot read another user's portfolio via id swap
- Admin routes 403 to non-admin
- Stale cookie revoked after password change

### QA-B. Analysis Branch
- 4 analysts complete in parallel; partial failures degrade gracefully
- Researcher debate consumes only the four analyst summaries
- Risk manager's stop-loss reflects ATR/sigma, not a fixed 8%

### QA-C. Auto Loop
- Start, pause, mode change idempotent
- Stops cleanly at session end, resumes at next open
- Holiday: no orders sent
- VI / halt / limit-edge: order suppressed with clear log

### QA-D. KIS Live
- First live order requires explicit approval
- Cancel/amend round-trip works against KIS sandbox
- Partial fill recorded; residual carries to next cycle if configured

### QA-E. Backtest
- Same-bar leakage absent (delayed fill verified)
- Tick rounding visible in fill prices
- Costs match the documented bps decomposition

### QA-F. Security
- CSRF token rejection on missing/invalid header
- Rate-limit returns 429 within configured window
- Encrypted KIS keys never appear in logs

### QA-G. Operations
- Mongo restart: loops resume; no duplicate orders
- Backend restart: paper book and approvals intact

### QA-H. Load
- 50 concurrent analyses stay under p95 latency target
- LLM throttling kicks in before exhaustion

### QA-I. Korean Market
- 12/30 half-day cuts off auto loop at 14:00 KST
- Lunar New Year holiday window: no orders for entire window
- T+2 cash availability matches KIS balance exactly

### QA-J. Frontend UX
- New user reaches first analysis in under 60 seconds
- Inspector explains every number on the decision card

---

## 7. Sprint Plan

### Sprint 0 (launch blocker bake)
- Re-run QA-A through QA-I against latest main
- Tag release `v1.0.0-rc.1`

### Sprint 1 (1-2 weeks)
- F1, F2, G1, G2, T1, T2, M3, O1, O2

### Sprint 2 (1 month)
- UX1, B4, B5, M7, M8, M10, O4, O5

### Backlog
- Section 4 medium items, all of section 5

---

## 8. Document Conventions

- "Closed" means: code merged on `main`, tracked in `git log`, and re-verified
  by grep of the relevant identifiers in this checklist.
- "Conditional" in section 0 means: launch-safe under supervised conditions
  but not yet at the rigour required for unattended public traffic.
- This document supersedes earlier per-area checklists for production gating;
  the per-area documents remain useful as detailed references.

## 9. Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
- [AUTO_TRADING_SUPERVISOR.md](AUTO_TRADING_SUPERVISOR.md)
- [PORTFOLIO_ORCHESTRATION_BLUEPRINT.md](PORTFOLIO_ORCHESTRATION_BLUEPRINT.md)
- [KOREAN_MARKET_REALISM_AUDIT.md](KOREAN_MARKET_REALISM_AUDIT.md)

# User-Level MongoDB Schema and Deployment Checklist

## Goals
- Enforce per-user access controls (`viewer`, `trader`, `master`).
- Persist all critical actions and order events for auditability.
- Provide master-only operational monitoring and user governance.
- Ensure each user stores and loads their own API keys/model settings without global sharing.
- Define migration direction from in-memory structures to MongoDB-first state.

## Implemented Collections (Now)

### `users`
Purpose: User identities, role, account status.

Suggested document shape:
```json
{
  "_id": "ObjectId",
  "email": "string (unique, lowercase)",
  "username": "string",
  "role": "viewer|trader|master",
  "disabled": false,
  "password_salt": "hex string",
  "password_hash": "hex string",
  "created_at": "datetime",
  "updated_at": "datetime",
  "last_login_at": "datetime|null"
}
```

Indexes:
- `uq_users_email` unique on `email`
- `idx_users_username` sparse on `username`
- `idx_users_role` on `role`
- `idx_users_created_at` on `created_at` desc

### `auth_sessions`
Purpose: Session token storage and expiry.

Suggested document shape:
```json
{
  "_id": "ObjectId",
  "token_hash": "sha256(token)",
  "user_id": "ObjectId(users._id)",
  "created_at": "datetime",
  "expires_at": "datetime"
}
```

Indexes:
- `uq_sessions_token_hash` unique on `token_hash`
- `idx_sessions_user_id` on `user_id`
- `ttl_sessions_expires_at` TTL on `expires_at` (`expireAfterSeconds: 0`)

### `activity_logs`
Purpose: Full action history for API requests and control events.

Suggested document shape:
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId|null",
  "user_email": "string",
  "user_role": "viewer|trader|master|string",
  "action_type": "string",
  "category": "auth|analysis|trade|master|system|string",
  "method": "GET|POST|PATCH|...",
  "path": "string",
  "status_code": 200,
  "ip": "string",
  "user_agent": "string",
  "payload": { "any": "json" },
  "created_at": "datetime"
}
```

Indexes:
- `idx_activity_user_time` on `(user_id, created_at desc)`
- `idx_activity_path_time` on `(path, created_at desc)`
- `idx_activity_created_at` on `created_at` desc

### `user_trades`
Purpose: User-scoped trading/order lifecycle records.

Suggested document shape:
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId|null",
  "user_email": "string",
  "user_role": "viewer|trader|master|string",
  "trade_type": "kis_order|kis_order_approval|string",
  "mode": "simulated|live|string",
  "status": "pending_approval|executed|approved_executed|rejected|string",
  "ticker": "string",
  "side": "buy|sell|string",
  "qty": 0,
  "price": 0,
  "order_type": "00|01|string",
  "source": "string",
  "meta": { "any": "json" },
  "created_at": "datetime"
}
```

Indexes:
- `idx_user_trades_user_time` on `(user_id, created_at desc)`
- `idx_user_trades_mode_time` on `(mode, created_at desc)`
- `idx_user_trades_created_at` on `created_at` desc

### `user_settings`
Purpose: Per-user runtime config and API credential storage (LLM/KIS/GURU).

Current document shape:
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId(users._id, unique)",
  "secrets_enc": "Fernet encrypted string",
  "secrets_enc_v": 1,
  "default_llm_model": "string",
  "fast_llm_model": "string",
  "reasoning_effort": "high|medium|low",
  "max_debate_rounds": 2,
  "guru_enabled": false,
  "guru_debate_enabled": true,
  "guru_require_user_confirmation": false,
  "guru_risk_profile": "defensive|balanced|aggressive",
  "guru_investment_principles": "string",
  "guru_min_confidence_to_act": 0.72,
  "guru_max_risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "guru_max_position_pct": 20.0,
  "kis_mock": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

Indexes and validation:
- `uq_user_settings_user_id` unique on `user_id`
- `idx_user_settings_updated_at` on `updated_at` desc
- Collection JSON Schema validator (moderate level) applied for key field integrity
- Legacy plaintext secret fields are auto-migrated to encrypted `secrets_enc` on read/update path

### `order_approvals`
Purpose: Durable approval queue for pre-trade confirmation workflow.

Current document shape:
```json
{
  "_id": "ObjectId",
  "approval_id": "uuid string (unique)",
  "owner_user_id": "ObjectId(users._id)",
  "status": "pending|approved|rejected|expired",
  "created_at": "datetime",
  "expires_at": "datetime",
  "resolved_at": "datetime|null",
  "context": "string",
  "order": {
    "ticker": "string",
    "side": "buy|sell",
    "qty": 0,
    "price": 0,
    "order_type": "00|01"
  },
  "is_mock": true,
  "guru_require_user_confirmation": false,
  "kis_runtime_enc": "Fernet encrypted string",
  "kis_runtime_enc_v": 1,
  "order_result": { "any": "json" },
  "purge_after": "datetime"
}
```

Indexes and validation:
- `uq_order_approvals_approval_id` unique on `approval_id`
- `idx_order_approvals_owner_time` on `(owner_user_id, created_at desc)`
- `idx_order_approvals_status_expire` on `(status, expires_at)`
- `idx_order_approvals_created_at` on `created_at` desc
- `ttl_order_approvals_purge_after` TTL on `purge_after` (`expireAfterSeconds: 0`)
- Collection JSON Schema validator (moderate level) applied

### `runtime_sessions`
Purpose: Durable state for analysis and agent-backtest session lifecycle.

Current document shape:
```json
{
  "_id": "ObjectId",
  "session_id": "uuid string",
  "session_type": "analysis|agent_backtest",
  "owner_user_id": "ObjectId(users._id)",
  "ticker": "string",
  "status": "running|done|error",
  "decision": { "any": "json" },
  "result": { "any": "json" },
  "error": "string|null",
  "created_at": "datetime",
  "updated_at": "datetime",
  "purge_after": "datetime"
}
```

Indexes and validation:
- `uq_runtime_sessions_sid_type` unique on `(session_id, session_type)`
- `idx_runtime_sessions_owner_time` on `(owner_user_id, created_at desc)`
- `idx_runtime_sessions_status_updated` on `(status, updated_at desc)`
- `ttl_runtime_sessions_purge_after` TTL on `purge_after` (`expireAfterSeconds: 0`)
- Collection JSON Schema validator (moderate level) applied

## Target Collections (Next Phase)
### `strategy_runs`
Purpose: Persist each analysis run and pipeline output.

Candidate fields:
- `user_id`, `ticker`, `session_id`
- full thought trace (or pointer to object storage)
- final decision summary
- runtime metrics and model metadata
- created timestamps

Indexes:
- `(user_id, created_at desc)`
- `(ticker, created_at desc)`
- optional unique on `session_id`

### `backtest_runs`
Purpose: Historical backtest jobs and outputs.

Candidate fields:
- `user_id`, `ticker`, date range, strategy mode
- request params
- result metrics and summary
- compact trace artifacts

Indexes:
- `(user_id, created_at desc)`
- `(ticker, created_at desc)`

### `audit_events`
Purpose: Optional immutable append-only ledger for compliance.

Candidate fields:
- event id, actor id, scope, operation
- before/after hashes
- tamper-evident checksum chain fields

## Current Middleware/Access Behavior
- `/api/auth/bootstrap`, `/api/auth/register`, `/api/auth/login`, `/api/health*`, `/docs*`, `/openapi.json` are public.
- Other `/api/*` routes require valid session token.
- `viewer` blocks trade routes (`/api/kis/order*`, `/api/auto-loop*`, `/api/portfolio-loop*`).
- `master` routes are explicitly guarded in `user_system` router.

## Production Hardening Checklist
> 2026-04-26 기준: 8개 항목 모두 미처리 상태로 확인됨. 처리 우선순위·구현 가이드는 `docs/PRE_PRODUCTION_CHECKLIST.md` 의 매핑 컬럼 참고.

1. ⬜ Move session tokens from localStorage to secure cookies (`HttpOnly`, `Secure`, `SameSite=Lax|Strict`). → CHECKLIST §2-A1 (CRITICAL)
2. ⬜ Add rate limiting for login/register endpoints. → CHECKLIST §2-A2 (CRITICAL)
3. ⬜ Add account lockout or exponential backoff for repeated failed login attempts. → CHECKLIST §2-A3 (CRITICAL)
4. ⚠️ Rotate encryption keys and define key-management policy. → CHECKLIST §2-A4 (CRITICAL)
  - `order_approvals.kis_runtime` is encrypted at rest.
  - `user_settings` secrets are encrypted at rest via `secrets_enc`.
  - 운영 환경에서는 `DATA_ENCRYPTION_KEY`를 명시 설정하고 주기적 로테이션 절차를 운영한다.
  - 현재 `data_encryption_key=""` 기본값 + `app_secret_key="dev-secret-change-me"` 폴백 → 출시 전 필수화 + 부팅 검증 필요.
5. ⬜ Add structured log export pipeline (SIEM or long-term archive). → CHECKLIST §3-O1 / §4-O5
6. ⬜ Add retention policy for `activity_logs` and `user_trades`. → CHECKLIST §2-D1 (CRITICAL)
7. ✅ Add full-text or secondary analytics indexes only after workload observation. (의도적 보류, 유지)
8. ⬜ Add integration tests for role-based access boundaries. → CHECKLIST §3-T2

## Migration Notes (In-Memory to DB)
- Per-user runtime settings are now read/write from `user_settings` collection and injected into LLM/KIS execution context.
- `user_settings` 내 API/Broker 비밀값은 암호화 필드(`secrets_enc`)로 저장되고, 레거시 평문 필드는 자동 마이그레이션된다.
- KIS approval queue has been migrated to `order_approvals` collection; restart 이후에도 승인 상태가 유지된다.
- KIS 런타임 자격증명 스냅샷은 `kis_runtime_enc`에 암호화 저장되며 승인 시 복호화해 실행한다.
- 분석/에이전트 백테스트 세션 상태는 `runtime_sessions` 컬렉션으로 이동되어 인메모리 세션 유실 리스크를 제거했다.
- Keep read model compatible during migration by introducing repository layer and toggling via feature flag.

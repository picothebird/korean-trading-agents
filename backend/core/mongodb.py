"""
MongoDB 연결/상태 관리 유틸.
- 앱 시작 시 1회 연결 시도
- 헬스체크에서 ping 확인
- 향후 컬렉션 접근을 위한 get_mongo_database 제공
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING

from backend.core.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None
_last_error: str = ""


async def _ensure_user_settings_schema(db: AsyncIOMotorDatabase) -> None:
    validator = {
        "$jsonSchema": {
            "bsonType": "object",
            "required": [
                "user_id",
                "default_llm_model",
                "fast_llm_model",
                "reasoning_effort",
                "max_debate_rounds",
                "guru_enabled",
                "guru_debate_enabled",
                "guru_require_user_confirmation",
                "guru_risk_profile",
                "guru_investment_principles",
                "guru_min_confidence_to_act",
                "guru_max_risk_level",
                "guru_max_position_pct",
                "kis_mock",
                "created_at",
                "updated_at",
            ],
            "properties": {
                "user_id": {"bsonType": "objectId"},
                "openai_api_key": {"bsonType": "string"},
                "secrets_enc": {"bsonType": "string"},
                "secrets_enc_v": {"bsonType": ["int", "long"]},
                "default_llm_model": {"bsonType": "string"},
                "fast_llm_model": {"bsonType": "string"},
                "reasoning_effort": {"enum": ["high", "medium", "low"]},
                "max_debate_rounds": {"bsonType": ["int", "long", "double"]},
                "guru_enabled": {"bsonType": "bool"},
                "guru_debate_enabled": {"bsonType": "bool"},
                "guru_require_user_confirmation": {"bsonType": "bool"},
                "guru_risk_profile": {"enum": ["defensive", "balanced", "aggressive"]},
                "guru_investment_principles": {"bsonType": "string"},
                "guru_min_confidence_to_act": {"bsonType": ["double", "int", "long"]},
                "guru_max_risk_level": {"enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                "guru_max_position_pct": {"bsonType": ["double", "int", "long"]},
                "kis_mock": {"bsonType": "bool"},
                "kis_app_key": {"bsonType": "string"},
                "kis_app_secret": {"bsonType": "string"},
                "kis_account_no": {"bsonType": "string"},
                "created_at": {"bsonType": "date"},
                "updated_at": {"bsonType": "date"},
            },
            "additionalProperties": True,
        }
    }

    names = await db.list_collection_names()
    if "user_settings" not in names:
        try:
            await db.create_collection(
                "user_settings",
                validator=validator,
                validationLevel="moderate",
                validationAction="error",
            )
        except Exception:
            # 권한/버전 제약으로 validator 생성이 실패할 수 있어 인덱스 경로는 유지한다.
            pass
        return

    try:
        await db.command(
            {
                "collMod": "user_settings",
                "validator": validator,
                "validationLevel": "moderate",
                "validationAction": "error",
            }
        )
    except Exception:
        # 일부 환경에서는 collMod가 제한될 수 있으므로 실패 시 계속 진행한다.
        pass


async def _ensure_order_approvals_schema(db: AsyncIOMotorDatabase) -> None:
    validator = {
        "$jsonSchema": {
            "bsonType": "object",
            "required": [
                "approval_id",
                "owner_user_id",
                "status",
                "created_at",
                "expires_at",
                "order",
                "is_mock",
                "guru_require_user_confirmation",
                "kis_runtime_enc",
                "kis_runtime_enc_v",
                "purge_after",
            ],
            "properties": {
                "approval_id": {"bsonType": "string"},
                "owner_user_id": {"bsonType": "objectId"},
                "status": {"enum": ["pending", "approved", "rejected", "expired"]},
                "created_at": {"bsonType": "date"},
                "expires_at": {"bsonType": "date"},
                "resolved_at": {"bsonType": ["date", "null"]},
                "context": {"bsonType": "string"},
                "order": {
                    "bsonType": "object",
                    "required": ["ticker", "side", "qty", "price", "order_type"],
                    "properties": {
                        "ticker": {"bsonType": "string"},
                        "side": {"enum": ["buy", "sell"]},
                        "qty": {"bsonType": ["int", "long", "double"]},
                        "price": {"bsonType": ["int", "long", "double"]},
                        "order_type": {"enum": ["00", "01"]},
                    },
                    "additionalProperties": True,
                },
                "is_mock": {"bsonType": "bool"},
                "guru_require_user_confirmation": {"bsonType": "bool"},
                "kis_runtime_enc": {"bsonType": "string"},
                "kis_runtime_enc_v": {"bsonType": ["int", "long"]},
                "order_result": {"bsonType": ["object", "null"]},
                "purge_after": {"bsonType": "date"},
            },
            "additionalProperties": True,
        }
    }

    names = await db.list_collection_names()
    if "order_approvals" not in names:
        try:
            await db.create_collection(
                "order_approvals",
                validator=validator,
                validationLevel="moderate",
                validationAction="error",
            )
        except Exception:
            # 권한/버전 제약으로 validator 생성이 실패할 수 있어 인덱스 경로는 유지한다.
            pass
        return

    try:
        await db.command(
            {
                "collMod": "order_approvals",
                "validator": validator,
                "validationLevel": "moderate",
                "validationAction": "error",
            }
        )
    except Exception:
        # 일부 환경에서는 collMod가 제한될 수 있으므로 실패 시 계속 진행한다.
        pass


async def _ensure_runtime_sessions_schema(db: AsyncIOMotorDatabase) -> None:
    validator = {
        "$jsonSchema": {
            "bsonType": "object",
            "required": [
                "session_id",
                "session_type",
                "owner_user_id",
                "status",
                "created_at",
                "updated_at",
                "purge_after",
            ],
            "properties": {
                "session_id": {"bsonType": "string"},
                "session_type": {"enum": ["analysis", "agent_backtest"]},
                "owner_user_id": {"bsonType": "objectId"},
                "ticker": {"bsonType": "string"},
                "status": {"enum": ["running", "done", "error"]},
                "decision": {"bsonType": ["object", "null"]},
                "result": {"bsonType": ["object", "null"]},
                "error": {"bsonType": ["string", "null"]},
                "created_at": {"bsonType": "date"},
                "updated_at": {"bsonType": "date"},
                "purge_after": {"bsonType": "date"},
            },
            "additionalProperties": True,
        }
    }

    names = await db.list_collection_names()
    if "runtime_sessions" not in names:
        try:
            await db.create_collection(
                "runtime_sessions",
                validator=validator,
                validationLevel="moderate",
                validationAction="error",
            )
        except Exception:
            pass
        return

    try:
        await db.command(
            {
                "collMod": "runtime_sessions",
                "validator": validator,
                "validationLevel": "moderate",
                "validationAction": "error",
            }
        )
    except Exception:
        pass


async def _ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await _ensure_user_settings_schema(db)
    await _ensure_order_approvals_schema(db)
    await _ensure_runtime_sessions_schema(db)

    await db.users.create_index([("email", ASCENDING)], unique=True, name="uq_users_email")
    await db.users.create_index([("username", ASCENDING)], sparse=True, name="idx_users_username")
    await db.users.create_index([("role", ASCENDING)], name="idx_users_role")
    await db.users.create_index([("created_at", DESCENDING)], name="idx_users_created_at")

    await db.auth_sessions.create_index([("token_hash", ASCENDING)], unique=True, name="uq_sessions_token_hash")
    await db.auth_sessions.create_index([("user_id", ASCENDING)], name="idx_sessions_user_id")
    await db.auth_sessions.create_index(
        [("expires_at", ASCENDING)],
        expireAfterSeconds=0,
        name="ttl_sessions_expires_at",
    )

    await db.activity_logs.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)], name="idx_activity_user_time")
    await db.activity_logs.create_index([("path", ASCENDING), ("created_at", DESCENDING)], name="idx_activity_path_time")
    await db.activity_logs.create_index([("created_at", DESCENDING)], name="idx_activity_created_at")
    # TTL — settings.activity_log_retention_days
    await db.activity_logs.create_index(
        [("created_at", ASCENDING)],
        expireAfterSeconds=int(settings.activity_log_retention_days) * 24 * 3600,
        name="ttl_activity_logs_created_at",
    )

    await db.user_trades.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)], name="idx_user_trades_user_time")
    await db.user_trades.create_index([("mode", ASCENDING), ("created_at", DESCENDING)], name="idx_user_trades_mode_time")
    await db.user_trades.create_index([("created_at", DESCENDING)], name="idx_user_trades_created_at")
    # TTL — settings.user_trade_retention_days (권장: 365일)
    await db.user_trades.create_index(
        [("created_at", ASCENDING)],
        expireAfterSeconds=int(settings.user_trade_retention_days) * 24 * 3600,
        name="ttl_user_trades_created_at",
    )
    # 멱등성 — (user_id, idempotency_key) 유니크 (key가 있는 문서만)
    await db.user_trades.create_index(
        [("user_id", ASCENDING), ("idempotency_key", ASCENDING)],
        unique=True,
        partialFilterExpression={"idempotency_key": {"$exists": True, "$type": "string"}},
        name="uq_user_trades_idempotency",
    )

    await db.user_settings.create_index([("user_id", ASCENDING)], unique=True, name="uq_user_settings_user_id")
    await db.user_settings.create_index([("updated_at", DESCENDING)], name="idx_user_settings_updated_at")

    await db.order_approvals.create_index([("approval_id", ASCENDING)], unique=True, name="uq_order_approvals_approval_id")
    await db.order_approvals.create_index([("owner_user_id", ASCENDING), ("created_at", DESCENDING)], name="idx_order_approvals_owner_time")
    await db.order_approvals.create_index([("status", ASCENDING), ("expires_at", ASCENDING)], name="idx_order_approvals_status_expire")
    await db.order_approvals.create_index([("created_at", DESCENDING)], name="idx_order_approvals_created_at")
    await db.order_approvals.create_index(
        [("purge_after", ASCENDING)],
        expireAfterSeconds=0,
        name="ttl_order_approvals_purge_after",
    )

    await db.runtime_sessions.create_index(
        [("session_id", ASCENDING), ("session_type", ASCENDING)],
        unique=True,
        name="uq_runtime_sessions_sid_type",
    )
    await db.runtime_sessions.create_index(
        [("owner_user_id", ASCENDING), ("created_at", DESCENDING)],
        name="idx_runtime_sessions_owner_time",
    )
    await db.runtime_sessions.create_index(
        [("status", ASCENDING), ("updated_at", DESCENDING)],
        name="idx_runtime_sessions_status_updated",
    )
    await db.runtime_sessions.create_index(
        [("purge_after", ASCENDING)],
        expireAfterSeconds=0,
        name="ttl_runtime_sessions_purge_after",
    )

    # ── 자동/포트폴리오 루프 영속화 (Critical C1) ──────────────
    await db.trading_loops.create_index(
        [("loop_id", ASCENDING)], unique=True, name="uq_trading_loops_loop_id"
    )
    await db.trading_loops.create_index(
        [("owner_user_id", ASCENDING), ("status", ASCENDING)],
        name="idx_trading_loops_owner_status",
    )
    await db.trading_loops.create_index(
        [("owner_user_id", ASCENDING), ("loop_kind", ASCENDING), ("settings.ticker", ASCENDING), ("status", ASCENDING)],
        name="idx_trading_loops_owner_kind_ticker_status",
    )
    await db.trading_loops.create_index(
        [("updated_at", DESCENDING)], name="idx_trading_loops_updated_at"
    )

    # ── 분석 메모리 (Phase 3: reflection loop) ───────────────
    try:
        from backend.services.memory_service import ensure_memory_indexes
        await ensure_memory_indexes(db)
    except Exception:
        # 메모리 인덱스 생성 실패는 부팅을 막지 않는다 — 다른 컬렉션은 정상 운영.
        pass


def _configured_uri() -> str:
    return str(settings.mongodb_uri or "").strip()


def _resolve_db_name(uri: str) -> str:
    # 우선순위: 명시적 DB 이름 설정 > URI path > 기본값
    cfg_name = str(settings.mongodb_db_name or "").strip()
    if cfg_name:
        return cfg_name

    parsed = urlparse(uri)
    uri_name = parsed.path.lstrip("/").strip()
    if uri_name:
        return uri_name

    return "korean_trading_agents"


async def connect_to_mongo() -> dict[str, Any]:
    """MongoDB 연결 시도 결과를 반환.

    반환 예시:
    {
      "configured": True,
      "connected": True,
      "database": "korean_trading_agents",
      "error": ""
    }
    """
    global _client, _db, _last_error

    uri = _configured_uri()
    if not uri:
        _client = None
        _db = None
        _last_error = ""
        return {
            "configured": False,
            "connected": False,
            "database": None,
            "error": "MONGODB_URI is empty",
        }

    try:
        _client = AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=int(settings.mongodb_connect_timeout_ms),
            appname="korean-trading-agents",
        )
        await _client.admin.command("ping")

        db_name = _resolve_db_name(uri)
        _db = _client[db_name]
        await _ensure_indexes(_db)
        _last_error = ""
        return {
            "configured": True,
            "connected": True,
            "database": db_name,
            "error": "",
        }
    except Exception as e:
        _last_error = str(e)
        if _client is not None:
            _client.close()
        _client = None
        _db = None
        return {
            "configured": True,
            "connected": False,
            "database": None,
            "error": _last_error,
        }


async def close_mongo() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None


def get_mongo_database() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("MongoDB is not connected. Call connect_to_mongo() first.")
    return _db


async def get_mongo_health() -> dict[str, Any]:
    """현재 Mongo 연결 상태를 반환한다."""
    global _last_error

    uri = _configured_uri()
    if not uri:
        return {
            "configured": False,
            "connected": False,
            "database": None,
            "error": "MONGODB_URI is empty",
        }

    if _client is None:
        return {
            "configured": True,
            "connected": False,
            "database": None,
            "error": _last_error or "Mongo client is not initialized",
        }

    try:
        await _client.admin.command("ping")
        db_name = _db.name if _db is not None else _resolve_db_name(uri)
        return {
            "configured": True,
            "connected": True,
            "database": db_name,
            "error": "",
        }
    except Exception as e:
        _last_error = str(e)
        return {
            "configured": True,
            "connected": False,
            "database": _db.name if _db is not None else None,
            "error": _last_error,
        }

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

RUNTIME_SESSION_COLLECTION = "runtime_sessions"

SESSION_TYPE_ANALYSIS = "analysis"
SESSION_TYPE_AGENT_BACKTEST = "agent_backtest"

SESSION_STATUS_RUNNING = "running"
SESSION_STATUS_DONE = "done"
SESSION_STATUS_ERROR = "error"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_datetime(v: Any) -> datetime | None:
    if isinstance(v, datetime):
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)
    if isinstance(v, str):
        text = v.strip()
        if not text:
            return None
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None
    return None


def _utc_iso(v: Any) -> str | None:
    dt = _as_datetime(v)
    if dt is None:
        return None
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _to_object_id(raw: Any) -> ObjectId:
    if isinstance(raw, ObjectId):
        return raw
    return ObjectId(str(raw))


def serialize_runtime_session(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    if isinstance(out.get("_id"), ObjectId):
        out["_id"] = str(out["_id"])

    owner = out.get("owner_user_id")
    if isinstance(owner, ObjectId):
        out["owner_user_id"] = str(owner)

    for key in ("created_at", "updated_at", "purge_after"):
        out[key] = _utc_iso(out.get(key))

    return out


async def create_runtime_session(
    db: AsyncIOMotorDatabase,
    *,
    session_id: str,
    session_type: str,
    owner_user_id: Any,
    ticker: str,
    max_keep_hours: int,
) -> dict[str, Any]:
    now = _utc_now()
    purge_after = now + timedelta(hours=max(1, int(max_keep_hours)))

    row = await db[RUNTIME_SESSION_COLLECTION].find_one_and_update(
        {
            "session_id": str(session_id),
            "session_type": str(session_type),
        },
        {
            "$set": {
                "owner_user_id": _to_object_id(owner_user_id),
                "ticker": str(ticker or "").strip(),
                "status": SESSION_STATUS_RUNNING,
                "decision": None,
                "result": None,
                "error": None,
                "updated_at": now,
                "purge_after": purge_after,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    if row is None:
        raise RuntimeError("runtime session upsert failed")
    return row


async def get_runtime_session(
    db: AsyncIOMotorDatabase,
    session_id: str,
    session_type: str,
) -> dict[str, Any] | None:
    return await db[RUNTIME_SESSION_COLLECTION].find_one(
        {
            "session_id": str(session_id),
            "session_type": str(session_type),
        }
    )


async def mark_runtime_session_done(
    db: AsyncIOMotorDatabase,
    *,
    session_id: str,
    session_type: str,
    decision: dict[str, Any] | None = None,
    result: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    now = _utc_now()
    set_patch: dict[str, Any] = {
        "status": SESSION_STATUS_DONE,
        "updated_at": now,
    }
    if decision is not None:
        set_patch["decision"] = decision
    if result is not None:
        set_patch["result"] = result

    return await db[RUNTIME_SESSION_COLLECTION].find_one_and_update(
        {
            "session_id": str(session_id),
            "session_type": str(session_type),
        },
        {
            "$set": set_patch,
            "$unset": {"error": ""},
        },
        return_document=ReturnDocument.AFTER,
    )


async def mark_runtime_session_error(
    db: AsyncIOMotorDatabase,
    *,
    session_id: str,
    session_type: str,
    error: str,
) -> dict[str, Any] | None:
    now = _utc_now()
    return await db[RUNTIME_SESSION_COLLECTION].find_one_and_update(
        {
            "session_id": str(session_id),
            "session_type": str(session_type),
        },
        {
            "$set": {
                "status": SESSION_STATUS_ERROR,
                "error": str(error or ""),
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

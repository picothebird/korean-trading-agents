from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

from bson import ObjectId
from cryptography.fernet import Fernet, InvalidToken
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from backend.core.config import settings

ORDER_APPROVAL_COLLECTION = "order_approvals"
ORDER_APPROVAL_PENDING = "pending"
ORDER_APPROVAL_APPROVED = "approved"
ORDER_APPROVAL_REJECTED = "rejected"
ORDER_APPROVAL_EXPIRED = "expired"

_ORDER_APPROVAL_STATUSES = {
    ORDER_APPROVAL_PENDING,
    ORDER_APPROVAL_APPROVED,
    ORDER_APPROVAL_REJECTED,
    ORDER_APPROVAL_EXPIRED,
}

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    value = dt.astimezone(timezone.utc)
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


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


def _to_object_id(raw: Any) -> ObjectId:
    if isinstance(raw, ObjectId):
        return raw
    return ObjectId(str(raw))


def _derive_fernet_key(seed: str) -> bytes:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _normalize_fernet_key(raw: str) -> bytes:
    candidate = raw.strip().encode("utf-8")
    if not candidate:
        raise ValueError("empty encryption key")
    try:
        Fernet(candidate)
        return candidate
    except Exception:
        # 사람이 읽기 쉬운 패스프레이즈를 넣는 경우에도 동작하도록 SHA-256 기반으로 정규화한다.
        return _derive_fernet_key(raw.strip())


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    explicit_key = str(settings.data_encryption_key or "").strip()
    if explicit_key:
        return Fernet(_normalize_fernet_key(explicit_key))

    app_secret = str(settings.app_secret_key or "").strip() or "dev-secret-change-me"
    if app_secret == "dev-secret-change-me":
        logger.warning(
            "DATA_ENCRYPTION_KEY is not configured and APP_SECRET_KEY is default; "
            "order approval runtime encryption is using a weak development key."
        )
    return Fernet(_derive_fernet_key(app_secret))


def encrypt_dict(payload: dict[str, Any]) -> str:
    plaintext = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    return _get_fernet().encrypt(plaintext).decode("utf-8")


def decrypt_dict(token_text: str) -> dict[str, Any]:
    token = str(token_text or "").strip().encode("utf-8")
    if not token:
        raise ValueError("empty encrypted token")
    try:
        plaintext = _get_fernet().decrypt(token)
    except InvalidToken as e:
        raise ValueError("failed to decrypt approval runtime payload") from e
    obj = json.loads(plaintext.decode("utf-8"))
    if not isinstance(obj, dict):
        raise ValueError("invalid decrypted runtime payload")
    return obj


def is_expired(row: dict[str, Any], *, now: datetime | None = None) -> bool:
    expires_at = _as_datetime(row.get("expires_at"))
    if expires_at is None:
        return True
    ref = now or _utc_now()
    return ref >= expires_at


def serialize_approval(row: dict[str, Any]) -> dict[str, Any]:
    status = str(row.get("status", "") or "")
    if status not in _ORDER_APPROVAL_STATUSES:
        status = ORDER_APPROVAL_PENDING

    out = {
        "approval_id": str(row.get("approval_id", "") or ""),
        "status": status,
        "created_at": utc_iso(_as_datetime(row.get("created_at"))),
        "expires_at": utc_iso(_as_datetime(row.get("expires_at"))),
        "resolved_at": utc_iso(_as_datetime(row.get("resolved_at"))),
        "order": row.get("order") or {},
        "is_mock": bool(row.get("is_mock", True)),
        "guru_require_user_confirmation": bool(row.get("guru_require_user_confirmation", False)),
    }
    if "order_result" in row and row.get("order_result") is not None:
        out["order_result"] = row.get("order_result")
    return out


async def create_order_approval(
    db: AsyncIOMotorDatabase,
    *,
    approval_id: str,
    owner_user_id: Any,
    context: str,
    order_payload: dict[str, Any],
    is_mock: bool,
    guru_require_user_confirmation: bool,
    kis_runtime: dict[str, Any],
    ttl_min: int,
    max_keep_hours: int,
) -> dict[str, Any]:
    now = _utc_now()
    expires_at = now + timedelta(minutes=max(1, int(ttl_min)))
    purge_after = now + timedelta(hours=max(1, int(max_keep_hours)))

    row = {
        "approval_id": str(approval_id),
        "owner_user_id": _to_object_id(owner_user_id),
        "status": ORDER_APPROVAL_PENDING,
        "created_at": now,
        "expires_at": expires_at,
        "resolved_at": None,
        "context": str(context or "")[:500],
        "order": dict(order_payload),
        "is_mock": bool(is_mock),
        "guru_require_user_confirmation": bool(guru_require_user_confirmation),
        "kis_runtime_enc": encrypt_dict(dict(kis_runtime)),
        "kis_runtime_enc_v": 1,
        "purge_after": purge_after,
    }

    await db[ORDER_APPROVAL_COLLECTION].insert_one(row)
    return row


async def get_order_approval(db: AsyncIOMotorDatabase, approval_id: str) -> dict[str, Any] | None:
    row = await db[ORDER_APPROVAL_COLLECTION].find_one({"approval_id": str(approval_id)})
    if row is None:
        return None

    if str(row.get("status", "") or "") == ORDER_APPROVAL_PENDING and is_expired(row):
        now = _utc_now()
        updated = await db[ORDER_APPROVAL_COLLECTION].find_one_and_update(
            {
                "approval_id": str(approval_id),
                "status": ORDER_APPROVAL_PENDING,
            },
            {
                "$set": {
                    "status": ORDER_APPROVAL_EXPIRED,
                    "resolved_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated is not None:
            return updated
        return await db[ORDER_APPROVAL_COLLECTION].find_one({"approval_id": str(approval_id)})

    return row


async def reject_order_approval(db: AsyncIOMotorDatabase, approval_id: str) -> dict[str, Any] | None:
    now = _utc_now()
    return await db[ORDER_APPROVAL_COLLECTION].find_one_and_update(
        {
            "approval_id": str(approval_id),
            "status": ORDER_APPROVAL_PENDING,
        },
        {
            "$set": {
                "status": ORDER_APPROVAL_REJECTED,
                "resolved_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )


async def approve_order_approval(
    db: AsyncIOMotorDatabase,
    approval_id: str,
    order_result: dict[str, Any],
) -> dict[str, Any] | None:
    now = _utc_now()
    return await db[ORDER_APPROVAL_COLLECTION].find_one_and_update(
        {
            "approval_id": str(approval_id),
            "status": ORDER_APPROVAL_PENDING,
        },
        {
            "$set": {
                "status": ORDER_APPROVAL_APPROVED,
                "resolved_at": now,
                "order_result": order_result,
            }
        },
        return_document=ReturnDocument.AFTER,
    )


def load_kis_runtime(approval_row: dict[str, Any]) -> dict[str, Any]:
    token = str(approval_row.get("kis_runtime_enc", "") or "")
    runtime = decrypt_dict(token)

    # 런타임 컨텍스트에서 기대하는 키만 최소 복원한다.
    return {
        "kis_mock": bool(runtime.get("kis_mock", True)),
        "kis_app_key": str(runtime.get("kis_app_key", "") or ""),
        "kis_app_secret": str(runtime.get("kis_app_secret", "") or ""),
        "kis_account_no": str(runtime.get("kis_account_no", "") or ""),
    }

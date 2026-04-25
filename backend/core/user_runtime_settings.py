from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import logging
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.core.config import settings
from backend.core.order_approvals import decrypt_dict, encrypt_dict

_RUNTIME_PROFILE: ContextVar[dict[str, Any] | None] = ContextVar("runtime_profile", default=None)

_ALLOWED_REASONING = {"high", "medium", "low"}
_ALLOWED_GURU_RISK = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
_ALLOWED_GURU_PROFILE = {"defensive", "balanced", "aggressive"}

_SECRET_FIELDS = {
    "openai_api_key",
    "kis_app_key",
    "kis_app_secret",
    "kis_account_no",
}

_SECRET_BLOB_FIELD = "secrets_enc"
_SECRET_BLOB_VERSION_FIELD = "secrets_enc_v"

_USER_SETTINGS_COLLECTION = "user_settings"

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_object_id(raw: Any) -> ObjectId:
    if isinstance(raw, ObjectId):
        return raw
    return ObjectId(str(raw))


def _as_bool(v: Any, default: bool) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in {"1", "true", "yes", "y", "on"}:
            return True
        if s in {"0", "false", "no", "n", "off"}:
            return False
    if isinstance(v, (int, float)):
        return bool(v)
    return default


def _as_int(v: Any, default: int, min_v: int, max_v: int) -> int:
    try:
        i = int(v)
    except Exception:
        i = default
    return max(min_v, min(max_v, i))


def _as_float(v: Any, default: float, min_v: float, max_v: float) -> float:
    try:
        f = float(v)
    except Exception:
        f = default
    return max(min_v, min(max_v, f))


def _as_text(v: Any, default: str = "") -> str:
    if v is None:
        return default
    return str(v).strip()


def _default_profile() -> dict[str, Any]:
    return {
        "openai_api_key": "",
        "default_llm_model": "gpt-5.5",
        "fast_llm_model": "gpt-5.5",
        "reasoning_effort": "high",
        "max_debate_rounds": 2,
        "guru_enabled": False,
        "guru_debate_enabled": True,
        "guru_require_user_confirmation": False,
        "guru_risk_profile": "balanced",
        "guru_investment_principles": "",
        "guru_min_confidence_to_act": 0.72,
        "guru_max_risk_level": "HIGH",
        "guru_max_position_pct": 20.0,
        "kis_mock": True,
        "kis_app_key": "",
        "kis_app_secret": "",
        "kis_account_no": "",
    }


def normalize_profile(source: dict[str, Any] | None) -> dict[str, Any]:
    merged = _default_profile()
    if source:
        merged.update(source)

    reasoning = _as_text(merged.get("reasoning_effort"), "high").lower()
    if reasoning not in _ALLOWED_REASONING:
        reasoning = "high"

    guru_profile = _as_text(merged.get("guru_risk_profile"), "balanced").lower()
    if guru_profile not in _ALLOWED_GURU_PROFILE:
        guru_profile = "balanced"

    guru_risk_level = _as_text(merged.get("guru_max_risk_level"), "HIGH").upper()
    if guru_risk_level not in _ALLOWED_GURU_RISK:
        guru_risk_level = "HIGH"

    return {
        "openai_api_key": _as_text(merged.get("openai_api_key"), ""),
        "default_llm_model": _as_text(merged.get("default_llm_model"), "gpt-5.5") or "gpt-5.5",
        "fast_llm_model": _as_text(merged.get("fast_llm_model"), "") or _as_text(merged.get("default_llm_model"), "gpt-5.5") or "gpt-5.5",
        "reasoning_effort": reasoning,
        "max_debate_rounds": _as_int(merged.get("max_debate_rounds"), 2, 1, 8),
        "guru_enabled": _as_bool(merged.get("guru_enabled"), False),
        "guru_debate_enabled": _as_bool(merged.get("guru_debate_enabled"), True),
        "guru_require_user_confirmation": _as_bool(merged.get("guru_require_user_confirmation"), False),
        "guru_risk_profile": guru_profile,
        "guru_investment_principles": _as_text(merged.get("guru_investment_principles"), "")[:1200],
        "guru_min_confidence_to_act": _as_float(merged.get("guru_min_confidence_to_act"), 0.72, 0.0, 1.0),
        "guru_max_risk_level": guru_risk_level,
        "guru_max_position_pct": _as_float(merged.get("guru_max_position_pct"), 20.0, 1.0, 100.0),
        "kis_mock": _as_bool(merged.get("kis_mock"), True),
        "kis_app_key": _as_text(merged.get("kis_app_key"), ""),
        "kis_app_secret": _as_text(merged.get("kis_app_secret"), ""),
        "kis_account_no": _as_text(merged.get("kis_account_no"), ""),
    }


def _extract_secret_values(source: dict[str, Any] | None) -> dict[str, str]:
    out = {key: "" for key in _SECRET_FIELDS}
    if not source:
        return out

    token = _as_text(source.get(_SECRET_BLOB_FIELD), "")
    if token:
        try:
            decrypted = decrypt_dict(token)
            for key in _SECRET_FIELDS:
                out[key] = _as_text(decrypted.get(key), "")
        except Exception as exc:
            logger.warning("Failed to decrypt user_settings secrets_enc payload: %s", str(exc)[:200])

    # Backward compatibility: fall back to legacy plaintext fields when needed.
    for key in _SECRET_FIELDS:
        if out[key]:
            continue
        out[key] = _as_text(source.get(key), "")

    return out


def _normalize_profile_from_storage_doc(source: dict[str, Any] | None) -> dict[str, Any]:
    raw = dict(source or {})
    raw.update(_extract_secret_values(raw))
    return normalize_profile(raw)


def _build_secret_blob_patch(profile: dict[str, Any]) -> dict[str, Any]:
    secret_payload = {key: _as_text(profile.get(key), "") for key in _SECRET_FIELDS}
    return {
        _SECRET_BLOB_FIELD: encrypt_dict(secret_payload),
        _SECRET_BLOB_VERSION_FIELD: 1,
    }


def _mask_openai_key(key: str) -> str:
    if not key:
        return ""
    if len(key) > 8:
        return f"{key[:7]}...{key[-4:]}"
    return "설정됨"


def build_public_settings(profile_like: dict[str, Any] | None) -> dict[str, Any]:
    profile = _normalize_profile_from_storage_doc(profile_like)
    key = str(profile.get("openai_api_key", "") or "")
    return {
        "openai_api_key_set": bool(key),
        "openai_api_key_preview": _mask_openai_key(key),
        "default_llm_model": profile["default_llm_model"],
        "fast_llm_model": profile["fast_llm_model"],
        "reasoning_effort": profile["reasoning_effort"],
        "max_debate_rounds": profile["max_debate_rounds"],
        "guru_enabled": profile["guru_enabled"],
        "guru_debate_enabled": profile["guru_debate_enabled"],
        "guru_require_user_confirmation": profile["guru_require_user_confirmation"],
        "guru_risk_profile": profile["guru_risk_profile"],
        "guru_investment_principles": profile["guru_investment_principles"],
        "guru_min_confidence_to_act": profile["guru_min_confidence_to_act"],
        "guru_max_risk_level": profile["guru_max_risk_level"],
        "guru_max_position_pct": profile["guru_max_position_pct"],
        "kis_mock": profile["kis_mock"],
        "kis_app_key_set": bool(profile.get("kis_app_key")),
        "kis_app_secret_set": bool(profile.get("kis_app_secret")),
        "kis_account_no": str(profile.get("kis_account_no", "") or ""),
    }


def _base_storage_doc(user_id: ObjectId) -> dict[str, Any]:
    profile = normalize_profile({})
    now = _utc_now()
    non_secret = {k: v for k, v in profile.items() if k not in _SECRET_FIELDS}
    return {
        "user_id": user_id,
        **non_secret,
        **_build_secret_blob_patch(profile),
        "created_at": now,
        "updated_at": now,
    }


def _storage_patch(payload: dict[str, Any], current_doc: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    patch: dict[str, Any] = {}
    unset_fields: dict[str, str] = {}

    current_profile = _normalize_profile_from_storage_doc(current_doc)
    secret_changed = False

    # 비밀키는 빈 문자열이면 기존값 유지, 값이 있으면 교체
    for key in _SECRET_FIELDS:
        if key not in payload:
            continue
        raw = payload.get(key)
        if raw is None:
            continue
        val = str(raw).strip()
        if val:
            current_profile[key] = val
            secret_changed = True

    if secret_changed or (not _as_text(current_doc.get(_SECRET_BLOB_FIELD), "")):
        patch.update(_build_secret_blob_patch(current_profile))
        # Legacy plaintext secret fields are removed after encrypted migration.
        for key in _SECRET_FIELDS:
            unset_fields[key] = ""

    # 나머지는 정규화해서 항상 반영
    normalized = normalize_profile(payload)
    for key, value in normalized.items():
        if key in _SECRET_FIELDS:
            continue
        if key not in payload:
            continue
        patch[key] = value

    patch["updated_at"] = _utc_now()
    return patch, unset_fields


async def get_or_create_user_settings_doc(db: AsyncIOMotorDatabase, user_like: dict[str, Any]) -> dict[str, Any]:
    user_id = _to_object_id(user_like.get("_id") or user_like.get("id"))
    row = await db[_USER_SETTINGS_COLLECTION].find_one({"user_id": user_id})
    if row is not None:
        needs_secret_migration = (not _as_text(row.get(_SECRET_BLOB_FIELD), "")) or any(
            _as_text(row.get(key), "") for key in _SECRET_FIELDS
        )
        if needs_secret_migration:
            profile = _normalize_profile_from_storage_doc(row)
            set_patch = {
                **_build_secret_blob_patch(profile),
                "updated_at": _utc_now(),
            }
            unset_patch = {key: "" for key in _SECRET_FIELDS if key in row}
            update_doc: dict[str, Any] = {"$set": set_patch}
            if unset_patch:
                update_doc["$unset"] = unset_patch

            await db[_USER_SETTINGS_COLLECTION].update_one(
                {"user_id": user_id},
                update_doc,
                upsert=True,
            )
            row = await db[_USER_SETTINGS_COLLECTION].find_one({"user_id": user_id}) or row
        return row

    doc = _base_storage_doc(user_id)
    await db[_USER_SETTINGS_COLLECTION].update_one(
        {"user_id": user_id},
        {"$setOnInsert": doc},
        upsert=True,
    )
    return await db[_USER_SETTINGS_COLLECTION].find_one({"user_id": user_id}) or doc


async def update_user_settings_doc(
    db: AsyncIOMotorDatabase,
    user_like: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    user_id = _to_object_id(user_like.get("_id") or user_like.get("id"))
    current = await get_or_create_user_settings_doc(db, user_like)
    patch, unset_fields = _storage_patch(payload, current)

    update_doc: dict[str, Any] = {"$set": patch}
    if unset_fields:
        update_doc["$unset"] = unset_fields

    await db[_USER_SETTINGS_COLLECTION].update_one(
        {"user_id": user_id},
        update_doc,
        upsert=True,
    )
    row = await db[_USER_SETTINGS_COLLECTION].find_one({"user_id": user_id})
    if row is None:
        raise RuntimeError("user_settings 저장 후 조회 실패")
    return row


async def get_runtime_profile_for_user(db: AsyncIOMotorDatabase, user_like: dict[str, Any]) -> dict[str, Any]:
    row = await get_or_create_user_settings_doc(db, user_like)
    return _normalize_profile_from_storage_doc(row)


def get_runtime_setting(
    name: str,
    default: Any = None,
    *,
    use_global_when_unset: bool = True,
) -> Any:
    profile = _RUNTIME_PROFILE.get()
    if profile is not None:
        return profile.get(name, default)

    if use_global_when_unset and hasattr(settings, name):
        return getattr(settings, name)
    return default


@contextmanager
def runtime_profile_context(profile_like: dict[str, Any] | None):
    token = _RUNTIME_PROFILE.set(normalize_profile(profile_like))
    try:
        yield
    finally:
        _RUNTIME_PROFILE.reset(token)

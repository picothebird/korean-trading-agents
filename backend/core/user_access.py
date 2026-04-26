from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from backend.core.mongodb import get_mongo_database

ROLE_RANK: dict[str, int] = {
    "viewer": 1,
    "trader": 2,
    "master": 3,
}

PUBLIC_API_PATHS: set[str] = {
    "/health",
    "/api/health/mongo",
    "/api/auth/bootstrap",
    "/api/auth/login",
    "/api/auth/register",
}

TRADER_REQUIRED_PREFIXES: tuple[str, ...] = (
    "/api/kis",
    "/api/auto-loop",
    "/api/portfolio-loop",
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(dt: datetime | None = None) -> str:
    value = dt or utc_now()
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def role_at_least(user_role: str, required_role: str) -> bool:
    return ROLE_RANK.get(user_role, 0) >= ROLE_RANK.get(required_role, 0)


def normalize_role(role: str | None) -> str:
    candidate = (role or "").strip().lower()
    if candidate in ROLE_RANK:
        return candidate
    return "viewer"


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


def serialize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = utc_iso(v.astimezone(timezone.utc))
        else:
            out[k] = v
    return out


def sanitize_user(user_doc: dict[str, Any]) -> dict[str, Any]:
    uid = str(user_doc.get("_id") or user_doc.get("id") or "")
    return {
        "_id": uid,
        "id": uid,
        "email": str(user_doc.get("email", "")),
        "username": str(user_doc.get("username", "")),
        "role": normalize_role(str(user_doc.get("role", "viewer"))),
        "disabled": bool(user_doc.get("disabled", False)),
        "created_at": utc_iso(_as_datetime(user_doc.get("created_at")) or utc_now()),
        "updated_at": (
            utc_iso(_as_datetime(user_doc.get("updated_at")))
            if _as_datetime(user_doc.get("updated_at"))
            else None
        ),
        "last_login_at": (
            utc_iso(_as_datetime(user_doc.get("last_login_at")))
            if _as_datetime(user_doc.get("last_login_at"))
            else None
        ),
    }


def hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    if salt_hex:
        salt_bytes = bytes.fromhex(salt_hex)
        salt_out = salt_hex
    else:
        salt_bytes = secrets.token_bytes(16)
        salt_out = salt_bytes.hex()

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_bytes,
        160_000,
    )
    return salt_out, digest.hex()


def verify_password(password: str, salt_hex: str, expected_hash_hex: str) -> bool:
    _, computed_hash_hex = hash_password(password, salt_hex=salt_hex)
    return secrets.compare_digest(computed_hash_hex, expected_hash_hex)


def create_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_request_token(request: Request) -> str | None:
    auth_header = str(request.headers.get("authorization", "") or "").strip()
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token

    query_token = str(request.query_params.get("access_token", "") or "").strip()
    if query_token:
        return query_token
    return None


async def resolve_user_from_request(request: Request) -> dict[str, Any] | None:
    token = get_request_token(request)
    if not token:
        return None

    try:
        db = get_mongo_database()
    except Exception:
        return None

    session = await db.auth_sessions.find_one({"token_hash": hash_session_token(token)})
    if not session:
        return None

    expires_at = _as_datetime(session.get("expires_at"))
    if expires_at is None or expires_at <= utc_now():
        await db.auth_sessions.delete_one({"_id": session.get("_id")})
        return None

    user_id = session.get("user_id")
    if not isinstance(user_id, ObjectId):
        try:
            user_id = ObjectId(str(user_id))
        except Exception:
            return None

    user = await db.users.find_one({"_id": user_id, "disabled": {"$ne": True}})
    if not user:
        return None

    user["_session_token_hash"] = str(session.get("token_hash", ""))
    return user


async def require_user(request: Request) -> dict[str, Any]:
    user = getattr(request.state, "current_user", None)
    if user is None:
        user = await resolve_user_from_request(request)
        request.state.current_user = user
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return user


async def require_master(request: Request) -> dict[str, Any]:
    user = await require_user(request)
    if not role_at_least(normalize_role(str(user.get("role", "viewer"))), "master"):
        raise HTTPException(status_code=403, detail="마스터 권한이 필요합니다")
    return user


async def require_trader(request: Request) -> dict[str, Any]:
    user = await require_user(request)
    if not role_at_least(normalize_role(str(user.get("role", "viewer"))), "trader"):
        raise HTTPException(status_code=403, detail="트레이더 이상 권한이 필요합니다")
    return user


async def record_activity(
    *,
    request: Request,
    action_type: str,
    category: str,
    payload: dict[str, Any] | None = None,
    status_code: int | None = None,
) -> None:
    try:
        db = get_mongo_database()
    except Exception:
        return

    user = getattr(request.state, "current_user", None)
    user_id: ObjectId | None = None
    user_role = None
    user_email = None
    if isinstance(user, dict):
        user_email = str(user.get("email", "") or "")
        user_role = normalize_role(str(user.get("role", "viewer")))
        uid = user.get("_id")
        if isinstance(uid, ObjectId):
            user_id = uid
        elif uid is not None:
            try:
                user_id = ObjectId(str(uid))
            except Exception:
                user_id = None

    doc = {
        "user_id": user_id,
        "user_email": user_email,
        "user_role": user_role,
        "action_type": action_type,
        "category": category,
        "method": request.method,
        "path": request.url.path,
        "query": dict(request.query_params),
        "status_code": status_code,
        "ip": request.client.host if request.client else "",
        "user_agent": str(request.headers.get("user-agent", "") or "")[:300],
        "payload": payload or {},
        "created_at": utc_now(),
    }

    await db.activity_logs.insert_one(doc)


async def record_trade(
    *,
    request: Request,
    trade_type: str,
    mode: str,
    status: str,
    ticker: str,
    side: str,
    qty: int,
    price: int,
    order_type: str,
    source: str,
    meta: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> None:
    try:
        db = get_mongo_database()
    except Exception:
        return

    user = getattr(request.state, "current_user", None)
    if not isinstance(user, dict):
        return

    uid = user.get("_id")
    if not isinstance(uid, ObjectId):
        try:
            uid = ObjectId(str(uid))
        except Exception:
            return

    doc = {
        "user_id": uid,
        "user_email": str(user.get("email", "") or ""),
        "trade_type": trade_type,
        "mode": mode,
        "status": status,
        "ticker": str(ticker),
        "side": str(side),
        "qty": int(qty),
        "price": int(price),
        "order_type": str(order_type),
        "source": str(source),
        "meta": meta or {},
        "created_at": utc_now(),
    }
    if idempotency_key:
        doc["idempotency_key"] = str(idempotency_key)

    try:
        await db.user_trades.insert_one(doc)
    except Exception:
        # 멱등키 충돌(DuplicateKeyError) 등은 swallow — 이미 기록됨
        pass


def install_user_activity_middleware(app) -> None:
    @app.middleware("http")
    async def _user_activity_middleware(request: Request, call_next):
        path = request.url.path

        if request.method == "OPTIONS":
            return await call_next(request)

        user = await resolve_user_from_request(request)
        request.state.current_user = user

        # API 보호: 인증 필수
        is_public = (
            path in PUBLIC_API_PATHS
            or path.startswith("/docs")
            or path.startswith("/redoc")
            or path.startswith("/openapi")
        )

        if path.startswith("/api") and not is_public:
            if user is None:
                return JSONResponse(status_code=401, content={"detail": "로그인이 필요합니다"})

            if any(path.startswith(pfx) for pfx in TRADER_REQUIRED_PREFIXES):
                role = normalize_role(str(user.get("role", "viewer")))
                if not role_at_least(role, "trader"):
                    return JSONResponse(status_code=403, content={"detail": "트레이더 이상 권한이 필요합니다"})

        started_at = utc_now()
        response = await call_next(request)

        if path.startswith("/api"):
            duration_ms = max(0, int((utc_now() - started_at).total_seconds() * 1000))
            await record_activity(
                request=request,
                action_type="api_call",
                category="api",
                payload={"duration_ms": duration_ms},
                status_code=response.status_code,
            )

        return response

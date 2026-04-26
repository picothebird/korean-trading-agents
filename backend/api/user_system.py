from __future__ import annotations

import re
import secrets
from datetime import timedelta
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.core.mongodb import get_mongo_database
from backend.core.rate_limit import limiter, login_rate, register_rate
from backend.core.user_access import (
    _as_datetime,
    create_session_token,
    hash_password,
    hash_session_token,
    normalize_role,
    record_activity,
    require_master,
    require_user,
    sanitize_user,
    serialize_doc,
    utc_iso,
    utc_now,
    verify_password,
)

router = APIRouter(prefix="/api", tags=["user-system"])

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
VALID_ROLES = ("viewer", "trader", "master")


class AuthRegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    username: str = Field(default="", max_length=40)
    role: Literal["viewer", "trader", "master"] | None = None
    invite_code: str = Field(default="", max_length=64)


class CreateInviteCodeRequest(BaseModel):
    note: str = Field(default="", max_length=200)
    role: Literal["viewer", "trader", "master"] = "viewer"


class AuthLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)


class UpdateUserRoleRequest(BaseModel):
    role: Literal["viewer", "trader", "master"]


class UpdateUserDisabledRequest(BaseModel):
    disabled: bool


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def _ensure_db():
    try:
        return get_mongo_database()
    except Exception:
        raise HTTPException(status_code=503, detail="MongoDB 연결이 필요합니다")


def _build_session_doc(user_id: ObjectId) -> tuple[str, dict[str, Any]]:
    token = create_session_token()
    now = utc_now()
    expires_at = now + timedelta(days=14)
    doc = {
        "token_hash": hash_session_token(token),
        "user_id": user_id,
        "created_at": now,
        "expires_at": expires_at,
    }
    return token, doc


@router.get("/auth/bootstrap")
async def auth_bootstrap_status():
    db = await _ensure_db()
    users_count = await db.users.count_documents({})
    masters_count = await db.users.count_documents({"role": "master", "disabled": {"$ne": True}})
    return {
        "bootstrapped": users_count > 0,
        "users_count": users_count,
        "masters_count": masters_count,
    }


@router.post("/auth/register")
@limiter.limit(register_rate)
async def auth_register(req: AuthRegisterRequest, request: Request):
    db = await _ensure_db()

    email = _normalize_email(req.email)
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="유효한 이메일 형식이 아닙니다")

    if len(req.password.strip()) < 8:
        raise HTTPException(status_code=422, detail="비밀번호는 8자 이상이어야 합니다")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="이미 존재하는 이메일입니다")

    users_count = await db.users.count_documents({})
    current_user = getattr(request.state, "current_user", None)

    role = "viewer"
    invite_doc: dict[str, Any] | None = None
    invite_code_value = (req.invite_code or "").strip().upper()

    if users_count == 0:
        # Bootstrap: first user becomes master without invite code requirement.
        role = normalize_role(req.role or "master")
    elif isinstance(current_user, dict) and normalize_role(str(current_user.get("role", "viewer"))) == "master":
        # Master creating accounts directly (e.g. via master console) does not need a code.
        role = normalize_role(req.role or "viewer")
    else:
        # All other public signups require an unused invite code.
        if not invite_code_value:
            raise HTTPException(status_code=422, detail="초대 코드가 필요합니다")
        invite_doc = await db.invite_codes.find_one({"code": invite_code_value})
        if not invite_doc:
            raise HTTPException(status_code=404, detail="존재하지 않는 초대 코드입니다")
        if invite_doc.get("used_by"):
            raise HTTPException(status_code=409, detail="이미 사용된 초대 코드입니다")
        if bool(invite_doc.get("revoked", False)):
            raise HTTPException(status_code=403, detail="비활성화된 초대 코드입니다")
        role = normalize_role(str(invite_doc.get("role", "viewer")))

    now = utc_now()
    salt_hex, pw_hash = hash_password(req.password)
    user_doc = {
        "email": email,
        "username": req.username.strip(),
        "role": role,
        "disabled": False,
        "password_salt": salt_hex,
        "password_hash": pw_hash,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }

    insert_res = await db.users.insert_one(user_doc)
    user_id = insert_res.inserted_id

    if invite_doc is not None:
        await db.invite_codes.update_one(
            {"_id": invite_doc["_id"], "used_by": None},
            {"$set": {"used_by": user_id, "used_at": now}},
        )

    token, session_doc = _build_session_doc(user_id)
    await db.auth_sessions.insert_one(session_doc)

    created_user = await db.users.find_one({"_id": user_id})
    if not created_user:
        raise HTTPException(status_code=500, detail="사용자 생성 후 조회 실패")

    request.state.current_user = created_user
    await record_activity(
        request=request,
        action_type="auth_register",
        category="auth",
        payload={"created_user_id": str(user_id), "created_role": role},
        status_code=200,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in_sec": 14 * 24 * 3600,
        "user": sanitize_user(created_user),
    }


@router.post("/auth/login")
@limiter.limit(login_rate)
async def auth_login(req: AuthLoginRequest, request: Request):
    db = await _ensure_db()

    email = _normalize_email(req.email)
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    if bool(user.get("disabled", False)):
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다")

    # ── 계정 잠금 검사 (Critical A3) ───────────────────────
    from backend.core.config import settings as _settings  # lazy import to avoid cycles
    locked_until = user.get("locked_until")
    now = utc_now()
    if isinstance(locked_until, type(now)) and locked_until > now:
        retry_in = int((locked_until - now).total_seconds())
        raise HTTPException(
            status_code=423,
            detail=f"로그인 시도가 너무 많습니다. {retry_in}초 후 다시 시도하세요.",
        )

    salt_hex = str(user.get("password_salt", ""))
    expected_hash = str(user.get("password_hash", ""))
    if not salt_hex or not expected_hash or not verify_password(req.password, salt_hex, expected_hash):
        # 실패 카운터 증가 + 임계 도달 시 잠금
        new_attempts = int(user.get("failed_login_attempts", 0)) + 1
        update_doc: dict[str, Any] = {
            "failed_login_attempts": new_attempts,
            "last_failed_login_at": now,
            "last_failed_login_ip": (request.client.host if request.client else None),
        }
        if new_attempts >= int(_settings.login_max_failed_attempts):
            update_doc["locked_until"] = now + timedelta(minutes=int(_settings.login_lockout_minutes))
            update_doc["failed_login_attempts"] = 0  # 잠금 후 카운터 리셋
        await db.users.update_one({"_id": user["_id"]}, {"$set": update_doc})
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    token, session_doc = _build_session_doc(user["_id"])
    await db.auth_sessions.insert_one(session_doc)

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "last_login_at": now,
            "updated_at": now,
            "failed_login_attempts": 0,
            "locked_until": None,
        }},
    )
    user["last_login_at"] = now

    request.state.current_user = user
    await record_activity(
        request=request,
        action_type="auth_login",
        category="auth",
        payload={"user_id": str(user.get("_id"))},
        status_code=200,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in_sec": 14 * 24 * 3600,
        "user": sanitize_user(user),
    }


@router.post("/auth/logout")
async def auth_logout(request: Request):
    db = await _ensure_db()
    user = await require_user(request)

    token = request.headers.get("authorization", "")
    token_value = ""
    if token.lower().startswith("bearer "):
        token_value = token[7:].strip()
    if not token_value:
        token_value = str(request.query_params.get("access_token", "") or "").strip()

    if token_value:
        await db.auth_sessions.delete_many({"token_hash": hash_session_token(token_value)})

    await record_activity(
        request=request,
        action_type="auth_logout",
        category="auth",
        payload={"user_id": str(user.get("_id"))},
        status_code=200,
    )

    return {"ok": True}


@router.get("/auth/me")
async def auth_me(request: Request):
    user = await require_user(request)
    return {"user": sanitize_user(user)}


@router.get("/users/me/activity")
async def user_activity_me(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
):
    db = await _ensure_db()
    user = await require_user(request)
    uid = user.get("_id")

    cursor = db.activity_logs.find({"user_id": uid}).sort("created_at", -1).limit(limit)
    items = [serialize_doc(doc) async for doc in cursor]
    return {"items": items}


@router.get("/users/me/trades")
async def user_trades_me(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
):
    db = await _ensure_db()
    user = await require_user(request)
    uid = user.get("_id")

    cursor = db.user_trades.find({"user_id": uid}).sort("created_at", -1).limit(limit)
    items = [serialize_doc(doc) async for doc in cursor]
    return {"items": items}


@router.get("/master/overview")
async def master_overview(request: Request):
    db = await _ensure_db()
    await require_master(request)

    total_users = await db.users.count_documents({})
    active_users = await db.users.count_documents({"disabled": {"$ne": True}})
    masters = await db.users.count_documents({"role": "master", "disabled": {"$ne": True}})
    traders = await db.users.count_documents({"role": "trader", "disabled": {"$ne": True}})
    viewers = await db.users.count_documents({"role": "viewer", "disabled": {"$ne": True}})

    logs_24h = await db.activity_logs.count_documents({"created_at": {"$gte": utc_now() - timedelta(hours=24)}})
    trades_24h = await db.user_trades.count_documents({"created_at": {"$gte": utc_now() - timedelta(hours=24)}})

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "masters": masters,
            "traders": traders,
            "viewers": viewers,
        },
        "activity": {
            "logs_24h": logs_24h,
            "trades_24h": trades_24h,
        },
    }


@router.get("/master/users")
async def master_users(
    request: Request,
    limit: int = Query(default=200, ge=1, le=1000),
):
    db = await _ensure_db()
    await require_master(request)

    cursor = db.users.find({}).sort("created_at", -1).limit(limit)
    rows = [sanitize_user(doc) async for doc in cursor]
    return {"items": rows}


@router.patch("/master/users/{user_id}/role")
async def master_update_user_role(user_id: str, req: UpdateUserRoleRequest, request: Request):
    db = await _ensure_db()
    acting_user = await require_master(request)

    try:
        target_oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=422, detail="잘못된 user_id")

    target = await db.users.find_one({"_id": target_oid})
    if not target:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    role = normalize_role(req.role)
    if str(acting_user.get("_id")) == user_id and role != "master":
        raise HTTPException(status_code=400, detail="자기 자신의 마스터 권한은 해제할 수 없습니다")

    await db.users.update_one(
        {"_id": target_oid},
        {"$set": {"role": role, "updated_at": utc_now()}},
    )

    await record_activity(
        request=request,
        action_type="master_update_role",
        category="master",
        payload={"target_user_id": user_id, "new_role": role},
        status_code=200,
    )

    updated = await db.users.find_one({"_id": target_oid})
    return {"user": sanitize_user(updated)}


@router.patch("/master/users/{user_id}/disabled")
async def master_update_user_disabled(user_id: str, req: UpdateUserDisabledRequest, request: Request):
    db = await _ensure_db()
    acting_user = await require_master(request)

    if str(acting_user.get("_id")) == user_id and req.disabled:
        raise HTTPException(status_code=400, detail="자기 자신을 비활성화할 수 없습니다")

    try:
        target_oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=422, detail="잘못된 user_id")

    target = await db.users.find_one({"_id": target_oid})
    if not target:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    await db.users.update_one(
        {"_id": target_oid},
        {"$set": {"disabled": bool(req.disabled), "updated_at": utc_now()}},
    )

    await record_activity(
        request=request,
        action_type="master_update_disabled",
        category="master",
        payload={"target_user_id": user_id, "disabled": bool(req.disabled)},
        status_code=200,
    )

    updated = await db.users.find_one({"_id": target_oid})
    return {"user": sanitize_user(updated)}


@router.get("/master/activity")
async def master_activity(
    request: Request,
    limit: int = Query(default=200, ge=1, le=1000),
    user_id: str = Query(default=""),
    category: str = Query(default=""),
    exclude_noise: bool = Query(default=True),
):
    """전체 액션 로그.

    운영 화면에서 의미 있는 이벤트만 보기 쉽게 하기 위해 기본값으로
    `action_type == "api_call"` 노이즈를 제외한다 (`exclude_noise=true`).
    또한 응답에 전체 개수(`total`)와 노이즈 제외 개수(`total_excluding_noise`)를
    함께 반환해 silent truncation을 방지한다.
    """
    db = await _ensure_db()
    await require_master(request)

    q: dict[str, Any] = {}
    if user_id.strip():
        try:
            q["user_id"] = ObjectId(user_id.strip())
        except Exception:
            raise HTTPException(status_code=422, detail="잘못된 user_id")
    if category.strip():
        q["category"] = category.strip()
    if exclude_noise:
        q["action_type"] = {"$ne": "api_call"}

    cursor = db.activity_logs.find(q).sort("created_at", -1).limit(limit)
    items = [serialize_doc(doc) async for doc in cursor]

    # 운영자가 표시 건수를 정확히 인지할 수 있도록 합계 메타를 함께 반환.
    base_filter: dict[str, Any] = {}
    if user_id.strip():
        base_filter["user_id"] = q["user_id"]
    if category.strip():
        base_filter["category"] = category.strip()

    total_all = await db.activity_logs.count_documents(base_filter)
    noise_filter = dict(base_filter)
    noise_filter["action_type"] = {"$ne": "api_call"}
    total_excluding_noise = await db.activity_logs.count_documents(noise_filter)

    return {
        "items": items,
        "total": total_all,
        "total_excluding_noise": total_excluding_noise,
        "applied": {
            "limit": limit,
            "user_id": user_id.strip() or None,
            "category": category.strip() or None,
            "exclude_noise": exclude_noise,
        },
    }


@router.get("/master/trades")
async def master_trades(
    request: Request,
    limit: int = Query(default=200, ge=1, le=1000),
    user_id: str = Query(default=""),
):
    db = await _ensure_db()
    await require_master(request)

    q: dict[str, Any] = {}
    if user_id.strip():
        try:
            q["user_id"] = ObjectId(user_id.strip())
        except Exception:
            raise HTTPException(status_code=422, detail="잘못된 user_id")

    cursor = db.user_trades.find(q).sort("created_at", -1).limit(limit)
    items = [serialize_doc(doc) async for doc in cursor]

    base_filter: dict[str, Any] = {}
    if user_id.strip():
        base_filter["user_id"] = q["user_id"]
    total_all = await db.user_trades.count_documents(base_filter)

    return {
        "items": items,
        "total": total_all,
        "applied": {
            "limit": limit,
            "user_id": user_id.strip() or None,
        },
    }


# ── Invite codes ────────────────────────────────────────────────


def _generate_invite_code() -> str:
    # 10 characters, uppercase A-Z + digits, ambiguous chars removed.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(10))


def _serialize_invite(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc.get("_id")),
        "code": str(doc.get("code", "")),
        "role": normalize_role(str(doc.get("role", "viewer"))),
        "note": str(doc.get("note", "")),
        "created_at": utc_iso(_as_datetime(doc.get("created_at")) or utc_now()),
        "created_by": str(doc.get("created_by")) if doc.get("created_by") else None,
        "used_by": str(doc.get("used_by")) if doc.get("used_by") else None,
        "used_at": utc_iso(_as_datetime(doc.get("used_at"))) if doc.get("used_at") else None,
        "revoked": bool(doc.get("revoked", False)),
    }


@router.get("/master/invite-codes")
async def master_invite_codes_list(
    request: Request,
    limit: int = Query(default=200, ge=1, le=1000),
):
    db = await _ensure_db()
    await require_master(request)

    cursor = db.invite_codes.find({}).sort("created_at", -1).limit(limit)
    items: list[dict[str, Any]] = []
    user_ids: set[ObjectId] = set()
    raw_docs: list[dict[str, Any]] = []
    async for doc in cursor:
        raw_docs.append(doc)
        if doc.get("used_by"):
            user_ids.add(doc["used_by"])

    user_lookup: dict[str, dict[str, Any]] = {}
    if user_ids:
        users_cursor = db.users.find({"_id": {"$in": list(user_ids)}})
        async for u in users_cursor:
            user_lookup[str(u["_id"])] = sanitize_user(u)

    for doc in raw_docs:
        item = _serialize_invite(doc)
        used_by = item.get("used_by")
        if used_by and used_by in user_lookup:
            item["used_by_user"] = user_lookup[used_by]
        items.append(item)

    return {"items": items}


@router.post("/master/invite-codes")
async def master_invite_codes_create(req: CreateInviteCodeRequest, request: Request):
    db = await _ensure_db()
    acting_user = await require_master(request)

    # Try a few times in the unlikely event of a collision.
    for _ in range(8):
        code = _generate_invite_code()
        existing = await db.invite_codes.find_one({"code": code})
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="초대 코드 생성 실패")

    now = utc_now()
    doc = {
        "code": code,
        "role": normalize_role(req.role),
        "note": req.note.strip(),
        "created_at": now,
        "created_by": acting_user.get("_id"),
        "used_by": None,
        "used_at": None,
        "revoked": False,
    }
    res = await db.invite_codes.insert_one(doc)
    doc["_id"] = res.inserted_id

    await record_activity(
        request=request,
        action_type="master_create_invite",
        category="master",
        payload={"invite_id": str(res.inserted_id), "role": doc["role"]},
        status_code=200,
    )

    return {"invite": _serialize_invite(doc)}


@router.delete("/master/invite-codes/{invite_id}")
async def master_invite_codes_revoke(invite_id: str, request: Request):
    db = await _ensure_db()
    await require_master(request)

    try:
        oid = ObjectId(invite_id)
    except Exception:
        raise HTTPException(status_code=422, detail="잘못된 invite_id")

    doc = await db.invite_codes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="초대 코드를 찾을 수 없습니다")

    if doc.get("used_by"):
        raise HTTPException(status_code=409, detail="이미 사용된 초대 코드는 삭제할 수 없습니다")

    await db.invite_codes.delete_one({"_id": oid})

    await record_activity(
        request=request,
        action_type="master_revoke_invite",
        category="master",
        payload={"invite_id": invite_id, "code": str(doc.get("code", ""))},
        status_code=200,
    )

    return {"ok": True}

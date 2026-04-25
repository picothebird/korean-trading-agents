"""
MS8 — 사용자별 사무실 레이아웃 CRUD.

`office_layouts` 컬렉션에 사용자별 가구/캐릭터 배치 + 활성 레이아웃 토글을 저장합니다.
Phaser 3 기반 캔버스 마이그레이션(MS0~MS11)이 완성되기 전이라도, 프론트의 `useAgentOffice`
및 `usePersonalization` 스토어가 이 엔드포인트로 직렬 백업/공유할 수 있도록 미리 깔아둡니다.

관계:
- 1 사용자 ↔ N 레이아웃 (1개만 active)
- 활성 레이아웃 변경 시 트랜잭션 없이 두 단계 update (단일 사용자 가정)
- shared_token이 있으면 비로그인 GET 가능 (MS9 공유 임포트의 1차 토대)
"""

from __future__ import annotations

import secrets
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Path, Request
from pydantic import BaseModel, Field

from backend.core.mongodb import get_mongo_database
from backend.core.user_access import (
    require_user,
    serialize_doc,
    utc_iso,
    utc_now,
)

router = APIRouter(prefix="/api/office-layouts", tags=["office-layouts"])


# ─────────────────────────────────────────────
# Pydantic 모델 — 페이로드 화이트리스트 (MS9 공유 임포트 보호)
# ─────────────────────────────────────────────


class FurniturePlacement(BaseModel):
    """가구 배치 — MS7 인게임 에디터의 출력."""
    asset_id: str = Field(min_length=1, max_length=80)
    x: float
    y: float
    rotation: Literal[0, 90, 180, 270] = 0
    layer: Literal["floor", "wall", "decor"] = "floor"


class CharacterCustomization(BaseModel):
    """MS6 캐릭터 커스터마이저 출력. 9 에이전트별 외형."""
    role: str = Field(min_length=1, max_length=40)
    base: str = Field(default="default", max_length=40)
    hair: str = Field(default="default", max_length=40)
    outfit: str = Field(default="default", max_length=40)
    accent_color: str | None = Field(default=None, max_length=16)


class LayoutPayload(BaseModel):
    """저장 페이로드. theme/map_id는 MS5/MS2의 카탈로그 키."""
    name: str = Field(min_length=1, max_length=80)
    map_id: str = Field(default="default-office", max_length=80)
    theme: Literal["neutral", "warm", "dark", "hanok"] = "neutral"
    furniture: list[FurniturePlacement] = Field(default_factory=list, max_length=500)
    characters: list[CharacterCustomization] = Field(default_factory=list, max_length=20)
    notes: str = Field(default="", max_length=400)


class LayoutCreateRequest(LayoutPayload):
    set_active: bool = False


class LayoutUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    map_id: str | None = Field(default=None, max_length=80)
    theme: Literal["neutral", "warm", "dark", "hanok"] | None = None
    furniture: list[FurniturePlacement] | None = Field(default=None, max_length=500)
    characters: list[CharacterCustomization] | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=400)


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────


def _coll():
    db = get_mongo_database()
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB 연결이 필요합니다")
    return db["office_layouts"]


def _serialize(doc: dict[str, Any]) -> dict[str, Any]:
    out = serialize_doc(doc)
    # 보안: shared_token은 owner GET 응답에만 포함, 공개 GET에서는 별도 처리
    return out


def _owner_filter(user_id: str, layout_id: str) -> dict[str, Any]:
    try:
        oid = ObjectId(layout_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="잘못된 레이아웃 ID") from exc
    return {"_id": oid, "user_id": user_id}


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────


@router.get("")
async def list_layouts(request: Request) -> dict[str, Any]:
    user = await require_user(request)
    coll = _coll()
    cursor = coll.find({"user_id": str(user["_id"])}).sort("updated_at", -1).limit(50)
    items = [_serialize(d) async for d in cursor]
    return {"items": items, "total": len(items)}


@router.post("")
async def create_layout(payload: LayoutCreateRequest, request: Request) -> dict[str, Any]:
    user = await require_user(request)
    coll = _coll()
    user_id = str(user["_id"])
    now = utc_now()

    doc = {
        "user_id": user_id,
        "name": payload.name.strip(),
        "map_id": payload.map_id,
        "theme": payload.theme,
        "furniture": [f.model_dump() for f in payload.furniture],
        "characters": [c.model_dump() for c in payload.characters],
        "notes": payload.notes.strip(),
        "is_active": False,
        "shared_token": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await coll.insert_one(doc)
    layout_id = str(result.inserted_id)

    if payload.set_active:
        await _set_active_internal(user_id, layout_id)
        doc["is_active"] = True

    doc["_id"] = result.inserted_id
    return {"layout": _serialize(doc), "created_at": utc_iso(now)}


@router.get("/active")
async def get_active(request: Request) -> dict[str, Any]:
    user = await require_user(request)
    coll = _coll()
    doc = await coll.find_one({"user_id": str(user["_id"]), "is_active": True})
    return {"layout": _serialize(doc) if doc else None}


@router.get("/{layout_id}")
async def get_layout(layout_id: str, request: Request) -> dict[str, Any]:
    user = await require_user(request)
    doc = await _coll().find_one(_owner_filter(str(user["_id"]), layout_id))
    if not doc:
        raise HTTPException(status_code=404, detail="레이아웃을 찾을 수 없습니다")
    return {"layout": _serialize(doc)}


@router.patch("/{layout_id}")
async def update_layout(
    layout_id: str, payload: LayoutUpdateRequest, request: Request
) -> dict[str, Any]:
    user = await require_user(request)
    update: dict[str, Any] = {}
    if payload.name is not None:
        update["name"] = payload.name.strip()
    if payload.map_id is not None:
        update["map_id"] = payload.map_id
    if payload.theme is not None:
        update["theme"] = payload.theme
    if payload.furniture is not None:
        update["furniture"] = [f.model_dump() for f in payload.furniture]
    if payload.characters is not None:
        update["characters"] = [c.model_dump() for c in payload.characters]
    if payload.notes is not None:
        update["notes"] = payload.notes.strip()

    if not update:
        raise HTTPException(status_code=400, detail="변경할 필드가 없습니다")

    update["updated_at"] = utc_now()
    coll = _coll()
    result = await coll.find_one_and_update(
        _owner_filter(str(user["_id"]), layout_id),
        {"$set": update},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="레이아웃을 찾을 수 없습니다")
    return {"layout": _serialize(result)}


@router.delete("/{layout_id}")
async def delete_layout(layout_id: str, request: Request) -> dict[str, Any]:
    user = await require_user(request)
    coll = _coll()
    result = await coll.delete_one(_owner_filter(str(user["_id"]), layout_id))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="레이아웃을 찾을 수 없습니다")
    return {"deleted": True, "layout_id": layout_id}


@router.post("/{layout_id}/activate")
async def activate_layout(layout_id: str, request: Request) -> dict[str, Any]:
    user = await require_user(request)
    user_id = str(user["_id"])
    # 존재 확인 먼저
    target = await _coll().find_one(_owner_filter(user_id, layout_id))
    if not target:
        raise HTTPException(status_code=404, detail="레이아웃을 찾을 수 없습니다")
    await _set_active_internal(user_id, layout_id)
    refreshed = await _coll().find_one({"_id": target["_id"]})
    return {"layout": _serialize(refreshed) if refreshed else None}


@router.post("/{layout_id}/share")
async def issue_share_token(layout_id: str, request: Request) -> dict[str, Any]:
    """MS9 공유 1차 토대: 토큰 발급. 임포트 시 토큰만 알면 GET 가능."""
    user = await require_user(request)
    coll = _coll()
    token = secrets.token_urlsafe(16)
    result = await coll.find_one_and_update(
        _owner_filter(str(user["_id"]), layout_id),
        {"$set": {"shared_token": token, "updated_at": utc_now()}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="레이아웃을 찾을 수 없습니다")
    return {"shared_token": token, "layout": _serialize(result)}


@router.delete("/{layout_id}/share")
async def revoke_share_token(layout_id: str, request: Request) -> dict[str, Any]:
    user = await require_user(request)
    coll = _coll()
    result = await coll.find_one_and_update(
        _owner_filter(str(user["_id"]), layout_id),
        {"$set": {"shared_token": None, "updated_at": utc_now()}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="레이아웃을 찾을 수 없습니다")
    return {"layout": _serialize(result)}


@router.get("/shared/{token}")
async def get_shared_layout(token: str = Path(..., min_length=8, max_length=64)) -> dict[str, Any]:
    """비로그인 공개 GET — shared_token으로만 접근. user_id는 응답에서 제거."""
    coll = _coll()
    doc = await coll.find_one({"shared_token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="공유 레이아웃을 찾을 수 없습니다")
    out = _serialize(doc)
    out.pop("user_id", None)
    out.pop("is_active", None)
    out.pop("shared_token", None)
    return {"layout": out}


# ─────────────────────────────────────────────
# Internal
# ─────────────────────────────────────────────


async def _set_active_internal(user_id: str, layout_id: str) -> None:
    coll = _coll()
    now = utc_now()
    # 모든 다른 레이아웃 비활성화
    await coll.update_many(
        {"user_id": user_id, "is_active": True},
        {"$set": {"is_active": False, "updated_at": now}},
    )
    try:
        oid = ObjectId(layout_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="잘못된 레이아웃 ID") from exc
    await coll.update_one(
        {"_id": oid, "user_id": user_id},
        {"$set": {"is_active": True, "updated_at": now}},
    )

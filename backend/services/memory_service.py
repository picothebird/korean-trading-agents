"""
분석 의사결정 메모리·리플렉션 서비스.

목적
----
- 매 분석마다 의사결정 스냅샷을 영속화한다 (`analysis_memories` 컬렉션).
- 사용자가 동일 종목을 재분석할 때 과거 결정과 그 결과(realized_return)를 LLM 프롬프트에 주입한다.
- 종목별 학습이 누적되도록 매수/매도 후 손익이 확정되면 LLM 이 한 줄 "교훈" 을 생성한다.

스키마 — analysis_memories (validator 는 mongodb.py 가 보장)
----------------------------------------------------------------
{
  _id: ObjectId,
  user_id: ObjectId,            # 필수 — 사용자 격리
  ticker: str,
  session_id: str,              # runtime_sessions 와 연결 (선택)
  decision_id: str,             # 본 메모리의 고유 ID
  created_at: date,
  action: "BUY"|"SELL"|"HOLD",
  confidence: float,             # 0.0~1.0
  position_pct: float,
  entry_price: float | null,
  reasoning: str,                # ≤500자 (요약본)
  agent_signals: { BUY: int, SELL: int, HOLD: int },
  avg_confidence: float,
  outcome: {
    status: "open" | "closed" | "expired" | "skipped",
    exit_price: float | null,
    realized_return_pct: float | null,
    holding_days: int | null,
    closed_at: date | null,
  },
  lesson: str | null,            # ≤200자 — outcome closed 후 생성
  lesson_generated_at: date | null,
}

인덱스
- (user_id, ticker, created_at desc)
- (user_id, ticker, "outcome.status", "outcome.realized_return_pct" desc)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.core.mongodb import get_mongo_database


COLLECTION = "analysis_memories"

# 메모리 1건이 LLM 프롬프트로 주입될 때 사용되는 최대 글자수
_LESSON_MAX = 200
_REASONING_MAX = 500


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_db() -> AsyncIOMotorDatabase | None:
    try:
        return get_mongo_database()
    except Exception:
        return None


def _to_object_id(value: Any) -> ObjectId | None:
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str) and ObjectId.is_valid(value):
        return ObjectId(value)
    return None


# ──────────────────────────────────────────────
# 기록 (Record)
# ──────────────────────────────────────────────

async def record_decision(
    *,
    user_id: Any,
    ticker: str,
    session_id: str,
    action: str,
    confidence: float,
    position_pct: float,
    reasoning: str,
    agent_signals: dict[str, int],
    avg_confidence: float,
    entry_price: float | None = None,
) -> str | None:
    """의사결정 1건을 영속화한다.

    Returns:
        str | None: decision_id (문자열). 사용자/DB 미가용 시 None.
    """
    uid = _to_object_id(user_id)
    if uid is None:
        return None
    db = _safe_db()
    if db is None:
        return None

    decision_id = str(uuid4())
    doc = {
        "user_id": uid,
        "ticker": str(ticker or "").strip(),
        "session_id": str(session_id or ""),
        "decision_id": decision_id,
        "created_at": _utc_now(),
        "action": str(action or "HOLD").upper(),
        "confidence": float(confidence or 0.0),
        "position_pct": float(position_pct or 0.0),
        "entry_price": float(entry_price) if entry_price is not None else None,
        "reasoning": (str(reasoning or "")[:_REASONING_MAX]),
        "agent_signals": {
            "BUY": int(agent_signals.get("BUY", 0) or 0),
            "SELL": int(agent_signals.get("SELL", 0) or 0),
            "HOLD": int(agent_signals.get("HOLD", 0) or 0),
        },
        "avg_confidence": float(avg_confidence or 0.0),
        "outcome": {
            "status": "open" if str(action).upper() in {"BUY", "SELL"} else "skipped",
            "exit_price": None,
            "realized_return_pct": None,
            "holding_days": None,
            "closed_at": None,
        },
        "lesson": None,
        "lesson_generated_at": None,
    }
    try:
        await db[COLLECTION].insert_one(doc)
    except Exception:
        return None
    return decision_id


# ──────────────────────────────────────────────
# 조회 (Retrieval)
# ──────────────────────────────────────────────

async def get_recent_memories(
    *,
    user_id: Any,
    ticker: str,
    limit: int = 5,
) -> list[dict]:
    """동일 종목의 최근 의사결정 메모리 리스트 (최신순)."""
    uid = _to_object_id(user_id)
    if uid is None:
        return []
    db = _safe_db()
    if db is None:
        return []
    try:
        cursor = (
            db[COLLECTION]
            .find({"user_id": uid, "ticker": str(ticker)})
            .sort("created_at", -1)
            .limit(max(1, min(20, int(limit))))
        )
        return [d async for d in cursor]
    except Exception:
        return []


async def get_extreme_outcomes(
    *,
    user_id: Any,
    ticker: str,
    each: int = 1,
) -> dict[str, list[dict]]:
    """동일 종목에서 가장 큰 이익/손실 결과 메모리 (학습용)."""
    uid = _to_object_id(user_id)
    if uid is None:
        return {"best": [], "worst": []}
    db = _safe_db()
    if db is None:
        return {"best": [], "worst": []}
    try:
        base_filter = {
            "user_id": uid,
            "ticker": str(ticker),
            "outcome.status": "closed",
            "outcome.realized_return_pct": {"$ne": None},
        }
        n = max(1, min(5, int(each)))
        best_cursor = (
            db[COLLECTION]
            .find(base_filter)
            .sort("outcome.realized_return_pct", -1)
            .limit(n)
        )
        worst_cursor = (
            db[COLLECTION]
            .find(base_filter)
            .sort("outcome.realized_return_pct", 1)
            .limit(n)
        )
        best = [d async for d in best_cursor]
        worst = [d async for d in worst_cursor]
        return {"best": best, "worst": worst}
    except Exception:
        return {"best": [], "worst": []}


def format_memories_for_prompt(
    recent: list[dict],
    extremes: dict[str, list[dict]] | None = None,
    max_recent: int = 5,
) -> str:
    """메모리 리스트를 LLM 프롬프트용 한국어 블록으로 직렬화한다.

    - 최근 N건 + 최대 이익/손실 1건씩 = 최대 7건.
    - 각 항목은 1줄 — 액션, 신뢰도, 결과(closed면 손익률), lesson 포함.
    - 메모리가 0건이면 빈 문자열 반환 (호출자가 분기).
    """
    if not recent and (not extremes or (not extremes.get("best") and not extremes.get("worst"))):
        return ""

    def _fmt(m: dict, prefix: str = "") -> str:
        action = str(m.get("action", "?"))
        conf = float(m.get("confidence", 0.0) or 0.0) * 100
        created = m.get("created_at")
        date_str = (
            created.strftime("%Y-%m-%d") if hasattr(created, "strftime")
            else str(created or "")[:10]
        )
        outcome = m.get("outcome") or {}
        status = str(outcome.get("status", "open"))
        rr = outcome.get("realized_return_pct")
        if status == "closed" and rr is not None:
            outcome_str = f"실현 {rr:+.2f}%"
        elif status == "open":
            outcome_str = "보유 중"
        elif status == "skipped":
            outcome_str = "관망"
        else:
            outcome_str = status
        lesson = str(m.get("lesson") or "").strip()
        line = f"  {prefix}[{date_str}] {action} 신뢰 {conf:.0f}% → {outcome_str}"
        if lesson:
            line += f" / 교훈: {lesson[:_LESSON_MAX]}"
        else:
            reasoning = str(m.get("reasoning") or "").strip()
            if reasoning:
                line += f" / 사유: {reasoning[:120]}"
        return line

    lines: list[str] = ["[과거 동일 종목 의사결정 회고]"]

    recent_clean = list(recent)[:max_recent]
    if recent_clean:
        lines.append("- 최근 결정:")
        for m in recent_clean:
            lines.append(_fmt(m))

    if extremes:
        for key, label in (("best", "최대 이익 사례"), ("worst", "최대 손실 사례")):
            arr = extremes.get(key) or []
            if arr:
                lines.append(f"- {label}:")
                for m in arr:
                    lines.append(_fmt(m))

    lines.append(
        "  ※ 위 회고를 참고하여 같은 실수를 반복하지 말고, 효과적이었던 신호 패턴은 강화하세요."
    )
    return "\n".join(lines)


async def build_memory_block(
    user_id: Any,
    ticker: str,
    *,
    recent_n: int = 5,
    each_extreme: int = 1,
) -> str:
    """프롬프트 주입용 메모리 블록 단일 호출. 비활성화/미가용시 빈 문자열."""
    uid = _to_object_id(user_id)
    if uid is None:
        return ""
    recent_task = asyncio.create_task(get_recent_memories(user_id=uid, ticker=ticker, limit=recent_n))
    extr_task = asyncio.create_task(get_extreme_outcomes(user_id=uid, ticker=ticker, each=each_extreme))
    recent, extremes = await asyncio.gather(recent_task, extr_task, return_exceptions=True)
    if isinstance(recent, Exception):
        recent = []
    if isinstance(extremes, Exception):
        extremes = {"best": [], "worst": []}
    return format_memories_for_prompt(recent, extremes, max_recent=recent_n)


# ──────────────────────────────────────────────
# 결과 갱신 (Outcome update + Lesson generation)
# ──────────────────────────────────────────────

async def update_outcome(
    *,
    user_id: Any,
    decision_id: str,
    exit_price: float,
    closed_at: datetime | None = None,
    generate_lesson: bool = True,
) -> dict[str, Any] | None:
    """의사결정 1건의 outcome을 마감 처리하고, 옵션으로 LLM lesson을 생성한다.

    Returns:
        업데이트된 메모리 문서 (또는 None).
    """
    uid = _to_object_id(user_id)
    if uid is None or not decision_id:
        return None
    db = _safe_db()
    if db is None:
        return None

    doc = await db[COLLECTION].find_one({"user_id": uid, "decision_id": decision_id})
    if not doc:
        return None
    if (doc.get("outcome") or {}).get("status") == "closed":
        return doc  # already closed → no-op

    entry = doc.get("entry_price")
    action = str(doc.get("action", "HOLD")).upper()
    realized = None
    try:
        ep = float(entry) if entry is not None else None
        xp = float(exit_price)
        if ep and ep > 0:
            raw = (xp - ep) / ep * 100.0
            realized = raw if action == "BUY" else (-raw if action == "SELL" else None)
    except Exception:
        realized = None

    holding_days = None
    try:
        created = doc.get("created_at")
        when = closed_at or _utc_now()
        if hasattr(created, "tzinfo"):
            holding_days = max(0, (when - created).days)
    except Exception:
        holding_days = None

    update = {
        "outcome.status": "closed",
        "outcome.exit_price": float(exit_price),
        "outcome.realized_return_pct": realized,
        "outcome.holding_days": holding_days,
        "outcome.closed_at": closed_at or _utc_now(),
    }
    try:
        await db[COLLECTION].update_one(
            {"user_id": uid, "decision_id": decision_id},
            {"$set": update},
        )
    except Exception:
        return None

    refreshed = await db[COLLECTION].find_one({"user_id": uid, "decision_id": decision_id})

    if generate_lesson and refreshed and realized is not None:
        try:
            lesson = await _generate_lesson(refreshed)
            if lesson:
                await db[COLLECTION].update_one(
                    {"user_id": uid, "decision_id": decision_id},
                    {"$set": {"lesson": lesson, "lesson_generated_at": _utc_now()}},
                )
                refreshed["lesson"] = lesson
        except Exception:
            pass

    return refreshed


async def _generate_lesson(memory: dict) -> str:
    """LLM 으로 200자 이내 교훈을 생성한다."""
    from backend.core.llm import create_response  # 지연 import (순환 회피)

    action = memory.get("action")
    conf = float(memory.get("confidence", 0.0) or 0.0) * 100
    pos = float(memory.get("position_pct", 0.0) or 0.0)
    reasoning = (memory.get("reasoning") or "")[:_REASONING_MAX]
    outcome = memory.get("outcome") or {}
    rr = outcome.get("realized_return_pct")
    holding = outcome.get("holding_days")
    signals = memory.get("agent_signals") or {}

    prompt = f"""당신은 과거 의사결정에서 학습 포인트를 뽑는 트레이딩 회고 코치입니다.
다음 의사결정과 결과를 보고, 다음번에 동일 종목을 분석할 때 적용할 수 있는 **교훈 한 줄(200자 이내)** 만 출력하세요.

[결정]
- action: {action}
- confidence: {conf:.0f}%
- position_pct: {pos:.1f}%
- agent_signals: {signals}
- reasoning: {reasoning}

[결과]
- realized_return_pct: {rr:+.2f}% (음수=손실)
- holding_days: {holding}

요구:
- 200자 이내
- "...해야 한다" / "...에 주의" 같은 행동 지향 문장
- 신호와 결과의 인과를 명확히 짚을 것
- 마크다운/JSON/접두어 없이 평문 한 줄
"""

    try:
        text = await create_response(
            system="당신은 트레이딩 회고 코치입니다. 평문 한 줄만 출력하세요.",
            user=prompt,
            fast=True,
        )
        text = (text or "").strip().strip("`").splitlines()[0] if text else ""
        return text[:_LESSON_MAX]
    except Exception:
        return ""


# ──────────────────────────────────────────────
# 인덱스 부트스트랩 (mongodb.py 에서 호출)
# ──────────────────────────────────────────────

async def ensure_memory_indexes(db: AsyncIOMotorDatabase) -> None:
    """analysis_memories 컬렉션 인덱스를 보장한다."""
    from pymongo import ASCENDING, DESCENDING

    await db[COLLECTION].create_index(
        [("user_id", ASCENDING), ("ticker", ASCENDING), ("created_at", DESCENDING)],
        name="idx_memories_user_ticker_time",
    )
    await db[COLLECTION].create_index(
        [
            ("user_id", ASCENDING),
            ("ticker", ASCENDING),
            ("outcome.status", ASCENDING),
            ("outcome.realized_return_pct", DESCENDING),
        ],
        name="idx_memories_user_ticker_outcome",
    )
    await db[COLLECTION].create_index(
        [("user_id", ASCENDING), ("decision_id", ASCENDING)],
        unique=True,
        name="uq_memories_user_decision",
    )


__all__ = [
    "record_decision",
    "get_recent_memories",
    "get_extreme_outcomes",
    "build_memory_block",
    "update_outcome",
    "ensure_memory_indexes",
    "COLLECTION",
]

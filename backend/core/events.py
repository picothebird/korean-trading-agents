import asyncio
import json
import time
from datetime import datetime
from typing import AsyncGenerator
from dataclasses import dataclass, field, asdict
from enum import Enum


class AgentRole(str, Enum):
    TECHNICAL_ANALYST = "technical_analyst"
    FUNDAMENTAL_ANALYST = "fundamental_analyst"
    SENTIMENT_ANALYST = "sentiment_analyst"
    MACRO_ANALYST = "macro_analyst"
    BULL_RESEARCHER = "bull_researcher"
    BEAR_RESEARCHER = "bear_researcher"
    RISK_MANAGER = "risk_manager"
    PORTFOLIO_MANAGER = "portfolio_manager"
    GURU_AGENT = "guru_agent"


class AgentStatus(str, Enum):
    IDLE = "idle"
    THINKING = "thinking"
    ANALYZING = "analyzing"
    DEBATING = "debating"
    DECIDING = "deciding"
    DONE = "done"


@dataclass
class AgentThought:
    agent_id: str
    role: AgentRole
    status: AgentStatus
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: dict = field(default_factory=dict)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self))}\n\n"


@dataclass
class TradeDecision:
    action: str  # BUY / SELL / HOLD
    ticker: str
    confidence: float  # 0~1
    reasoning: str
    agents_summary: dict
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self))}\n\n"


# 전역 이벤트 큐 (에이전트 → 프론트엔드 스트리밍)
_thought_queues: dict[str, asyncio.Queue] = {}
_queue_created_at: dict[str, float] = {}

# 큐 자동 청소 정책: 1시간 동안 사용되지 않으면 강제 정리 (SSE 연결 누수 방지)
_QUEUE_MAX_AGE_SEC = 3600.0
_QUEUE_REAPER_INTERVAL_SEC = 300.0  # 5분마다 검사

# MS-B: (session_id, role) → 마지막 emit 시각 (monotonic seconds).
_last_emit_ts: dict[tuple[str, str], float] = {}


def get_thought_queue(session_id: str) -> asyncio.Queue:
    if session_id not in _thought_queues:
        _thought_queues[session_id] = asyncio.Queue()
        _queue_created_at[session_id] = time.monotonic()
    return _thought_queues[session_id]


async def reap_stale_queues() -> int:
    """오래된 큐 강제 정리. 백그라운드 task가 주기적으로 호출."""
    now = time.monotonic()
    stale = [sid for sid, ts in list(_queue_created_at.items()) if now - ts > _QUEUE_MAX_AGE_SEC]
    for sid in stale:
        clear_thought_queue(sid)
    return len(stale)


async def queue_reaper_loop() -> None:
    """앱 lifespan에서 띄우는 백그라운드 reaper."""
    while True:
        try:
            await asyncio.sleep(_QUEUE_REAPER_INTERVAL_SEC)
            await reap_stale_queues()
        except asyncio.CancelledError:
            raise
        except Exception:
            # reaper 자체 예외로 죽지 않도록 swallow
            pass


def clear_thought_queue(session_id: str) -> None:
    """세션 큐를 강제 정리한다.

    stream_thoughts를 사용하지 않는 백그라운드 분석 루프에서
    큐 객체가 누적되는 것을 방지하기 위한 유틸리티.
    """
    _thought_queues.pop(session_id, None)
    _queue_created_at.pop(session_id, None)
    # 해당 세션의 duration tracking 키도 함께 청소
    for k in [k for k in _last_emit_ts.keys() if k[0] == session_id]:
        _last_emit_ts.pop(k, None)


async def emit_thought(session_id: str, thought: AgentThought):
    # MS-A.A10: metadata.signal 표준화 — 프론트엔드가 일관된 키로 의미 신호를 받도록
    # 우선순위: 호출자가 직접 metadata["signal"]을 설정했으면 존중.
    # 미설정 시 (role, status, metadata.signal_raw) 기반으로 도출.
    _ensure_signal(thought)
    # MS-B: duration_ms 채우기 — 같은 (session, role)의 직전 emit 이후 경과 시간
    _ensure_duration(session_id, thought)
    # MS-D: data_sources / model / latency_ms 표준화 (있을 때만)
    _normalize_provenance(thought)
    queue = get_thought_queue(session_id)
    await queue.put(thought)


def _normalize_provenance(thought: AgentThought) -> None:
    """MS-D D9 — provenance 메타데이터 표준화.

    - `data_sources`: list[str] 로 통일. 별칭 `sources` 도 인식.
    - `model`: str (예: "gpt-4o", "claude-opus-4"). 별칭 `model_id` 인식.
    - `latency_ms`: int. 별칭 `elapsed_ms`, `processing_ms` 인식.

    값이 없거나 변환 불가하면 키를 만들지 않는다 (UI 측 optional render).
    """
    md = thought.metadata
    if not isinstance(md, dict):
        return

    # data_sources 정규화
    if "data_sources" not in md:
        alias = md.get("sources")
        if isinstance(alias, (list, tuple)):
            md["data_sources"] = [str(x) for x in alias if x]
        elif isinstance(alias, str) and alias.strip():
            md["data_sources"] = [alias.strip()]
    elif isinstance(md.get("data_sources"), str):
        md["data_sources"] = [md["data_sources"]]

    # model 정규화
    if "model" not in md:
        alt = md.get("model_id") or md.get("llm_model")
        if isinstance(alt, str) and alt.strip():
            md["model"] = alt.strip()

    # latency_ms 정규화
    if "latency_ms" not in md:
        for key in ("elapsed_ms", "processing_ms", "duration_ms_llm"):
            v = md.get(key)
            if isinstance(v, (int, float)) and v >= 0:
                md["latency_ms"] = int(v)
                break


def _ensure_duration(session_id: str, thought: AgentThought) -> None:
    """이 에이전트가 직전 발화 이후 걸린 시간(ms)을 metadata.duration_ms에 채운다."""
    if not isinstance(thought.metadata, dict):
        return
    if "duration_ms" in thought.metadata:
        return  # 호출자가 직접 지정한 값 존중
    role_str = thought.role.value if isinstance(thought.role, AgentRole) else str(thought.role)
    key = (session_id, role_str)
    now = time.monotonic()
    last = _last_emit_ts.get(key)
    if last is not None:
        thought.metadata["duration_ms"] = int((now - last) * 1000)
    _last_emit_ts[key] = now


def _ensure_signal(thought: AgentThought) -> None:
    """thought.metadata['signal'] ∈ {'bull','bear','risk','done'} 보장.
    없으면 가능할 때만 채우고, 도출 불가 시 키를 생성하지 않는다."""
    md = thought.metadata
    if not isinstance(md, dict):
        return
    if md.get("signal") in ("bull", "bear", "risk", "done"):
        return

    role = thought.role.value if isinstance(thought.role, AgentRole) else str(thought.role)
    status = thought.status.value if isinstance(thought.status, AgentStatus) else str(thought.status)

    # bull/bear researcher → 항상 자기 진영
    if role == "bull_researcher":
        md["signal"] = "bull"
        return
    if role == "bear_researcher":
        md["signal"] = "bear"
        return
    # risk_manager → risk
    if role == "risk_manager":
        md["signal"] = "risk"
        return
    # portfolio_manager / guru_agent의 done 상태 → done
    if role in ("portfolio_manager", "guru_agent") and status == "done":
        md["signal"] = "done"
        return

    # 분석가: result에 signal=BUY/SELL/HOLD가 있으면 매핑
    raw = md.get("signal_raw") or md.get("trade_signal")
    if isinstance(raw, str):
        u = raw.upper()
        if u == "BUY":
            md["signal"] = "bull"
        elif u == "SELL":
            md["signal"] = "bear"
        elif u == "HOLD":
            # HOLD는 신호로 표시하지 않음 — 키 생략
            pass


async def stream_thoughts(session_id: str) -> AsyncGenerator[str, None]:
    queue = get_thought_queue(session_id)
    try:
        while True:
            thought = await asyncio.wait_for(queue.get(), timeout=60.0)
            if thought is None:
                break
            yield thought.to_sse()
    except asyncio.TimeoutError:
        yield "data: {\"type\": \"timeout\"}\n\n"
    finally:
        _thought_queues.pop(session_id, None)
        _queue_created_at.pop(session_id, None)

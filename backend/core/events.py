import asyncio
import json
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


def get_thought_queue(session_id: str) -> asyncio.Queue:
    if session_id not in _thought_queues:
        _thought_queues[session_id] = asyncio.Queue()
    return _thought_queues[session_id]


def clear_thought_queue(session_id: str) -> None:
    """세션 큐를 강제 정리한다.

    stream_thoughts를 사용하지 않는 백그라운드 분석 루프에서
    큐 객체가 누적되는 것을 방지하기 위한 유틸리티.
    """
    _thought_queues.pop(session_id, None)


async def emit_thought(session_id: str, thought: AgentThought):
    queue = get_thought_queue(session_id)
    await queue.put(thought)


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

"""
FastAPI 백엔드 서버
- SSE: 에이전트 실시간 사고 스트리밍
- REST: 분석 결과, 백테스트, 종목 정보
- WebSocket: 선택적 실시간 연결
"""
import asyncio
import sys
import os

# 프로젝트 루트를 sys.path에 추가
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.config import settings
from backend.core.events import stream_thoughts, AgentThought, AgentRole, AgentStatus, emit_thought
from agents.orchestrator.orchestrator import run_analysis
from backtesting.backtest import run_simple_backtest, format_result_summary
from data.market.fetcher import get_stock_info, get_technical_indicators


# ── 앱 시작 ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Korean Trading Agents API 서버 시작")
    yield
    print("👋 서버 종료")


app = FastAPI(
    title="Korean Trading Agents API",
    description="다중 AI 에이전트 한국 주식 자동매매 시스템",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 스키마 ───────────────────────────────────────────────
class AnalysisRequest(BaseModel):
    ticker: str
    session_id: str | None = None


class BacktestRequest(BaseModel):
    ticker: str
    start_date: str = "2023-01-01"
    end_date: str = "2024-12-31"
    initial_capital: float = 10_000_000


# ── 실행 중인 세션 저장 (간단한 인메모리) ─────────────────
_active_sessions: dict[str, dict] = {}


# ── 라우터 ───────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/stock/{ticker}")
async def get_stock(ticker: str):
    """종목 기본 정보 + 기술 지표"""
    try:
        info = get_stock_info(ticker)
        indicators = get_technical_indicators(ticker)
        return {"info": info, "indicators": indicators}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze/start")
async def start_analysis(req: AnalysisRequest, background_tasks: BackgroundTasks):
    """에이전트 분석 시작 (비동기) - session_id 반환"""
    session_id = req.session_id or str(uuid4())
    _active_sessions[session_id] = {
        "ticker": req.ticker,
        "status": "running",
        "decision": None,
    }

    async def run():
        try:
            decision = await run_analysis(req.ticker, session_id)
            _active_sessions[session_id]["decision"] = {
                "action": decision.action,
                "ticker": decision.ticker,
                "confidence": decision.confidence,
                "reasoning": decision.reasoning,
                "agents_summary": decision.agents_summary,
                "timestamp": decision.timestamp,
            }
            _active_sessions[session_id]["status"] = "done"
        except Exception as e:
            _active_sessions[session_id]["status"] = "error"
            _active_sessions[session_id]["error"] = str(e)
            # 스트림 종료
            from backend.core.events import get_thought_queue
            q = get_thought_queue(session_id)
            await q.put(None)

    background_tasks.add_task(run)
    return {"session_id": session_id, "status": "started"}


@app.get("/api/analyze/stream/{session_id}")
async def stream_analysis(session_id: str):
    """에이전트 사고 과정 SSE 스트리밍"""
    async def event_stream():
        # 헬스체크 이벤트
        yield "data: {\"type\": \"connected\", \"session_id\": \"" + session_id + "\"}\n\n"
        
        async for chunk in stream_thoughts(session_id):
            yield chunk
        
        # 최종 결정 전송
        session = _active_sessions.get(session_id, {})
        if session.get("decision"):
            import json
            yield f"data: {json.dumps({'type': 'final_decision', **session['decision']})}\n\n"
        
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/analyze/result/{session_id}")
async def get_result(session_id: str):
    """분석 완료 결과 조회"""
    session = _active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션 없음")
    return session


@app.post("/api/backtest")
async def backtest(req: BacktestRequest):
    """백테스트 실행"""
    try:
        result = run_simple_backtest(
            ticker=req.ticker,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
        )
        return {
            "ticker": result.ticker,
            "period": f"{result.start_date} ~ {result.end_date}",
            "metrics": {
                "total_return": result.total_return,
                "annualized_return": result.annualized_return,
                "sharpe_ratio": result.sharpe_ratio,
                "max_drawdown": result.max_drawdown,
                "win_rate": result.win_rate,
                "total_trades": result.total_trades,
                "profit_factor": result.profit_factor,
                "calmar_ratio": result.calmar_ratio,
                "benchmark_return": result.benchmark_return,
                "alpha": result.alpha,
            },
            "trades": result.trades,
            "equity_curve": result.equity_curve,
            "summary": format_result_summary(result),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/market/indices")
async def market_indices():
    """시장 지수 현황"""
    from data.market.fetcher import get_market_index
    try:
        indices = get_market_index(days=5)
        result = {}
        for name, df in indices.items():
            if not df.empty and "Close" in df.columns:
                latest = float(df["Close"].iloc[-1])
                prev = float(df["Close"].iloc[-2]) if len(df) > 1 else latest
                result[name] = {
                    "current": latest,
                    "change": latest - prev,
                    "change_pct": (latest - prev) / prev * 100,
                }
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)

"""
FastAPI 백엔드 서버
- SSE: 에이전트 실시간 사고 스트리밍
- REST: 분석 결과, 백테스트, 종목 정보
- WebSocket: 선택적 실시간 연결
"""
import asyncio
import sys
import os
import math

# 프로젝트 루트를 sys.path에 추가
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal

from backend.core.config import settings
from backend.core.events import stream_thoughts, AgentThought, AgentRole, AgentStatus, emit_thought
from backend.core import user_settings as _us
from agents.orchestrator.orchestrator import run_analysis
from backtesting.backtest import run_simple_backtest, run_agent_backtest, format_result_summary
from data.market.fetcher import get_stock_info, get_technical_indicators, search_stocks


# ── 앱 시작 ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # user_settings.json 이 있으면 스타트업 시 적용
    _us.apply_to_settings(settings)
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


class SettingsUpdateRequest(BaseModel):
    openai_api_key: str = ""            # 빈 문자열이면 기존 유지
    default_llm_model: str = "gpt-5.4"
    fast_llm_model: str = "gpt-5.4-mini"
    reasoning_effort: Literal["high", "medium", "low"] = "high"
    max_debate_rounds: int = Field(default=2, ge=1, le=8)
    kis_mock: bool = True
    kis_app_key: str = ""
    kis_app_secret: str = ""
    kis_account_no: str = ""


class KisOrderRequest(BaseModel):
    ticker: str
    side: str                  # "buy" | "sell"
    qty: int
    price: int
    order_type: str = "00"    # "00": 지정가, "01": 시장가


class AgentBacktestRequest(BaseModel):
    ticker: str
    start_date: str = "2023-01-01"
    end_date: str = "2024-12-31"
    initial_capital: float = 10_000_000
    session_id: str | None = None


# ── 실행 중인 세션 저장 (간단한 인메모리) ─────────────────
_active_sessions: dict[str, dict] = {}
_backtest_sessions: dict[str, dict] = {}  # 에이전트 백테스트 세션


def _serialize_backtest_result(result) -> dict:
    """BacktestResult 공통 직렬화 (REST/SSE 동일 포맷 보장)."""
    return {
        "ticker": result.ticker,
        "start_date": result.start_date,
        "end_date": result.end_date,
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


# ── 라우터 ───────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/stock/search")
async def search_stock_api(q: str = Query(..., min_length=1, max_length=30)):
    """종목명 또는 코드로 검색 (자동완성용)"""
    try:
        return search_stocks(q.strip(), limit=10)
    except BaseException:
        return []


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
        elif session.get("error"):
            import json
            yield f"data: {json.dumps({'type': 'error', 'message': session['error']})}\n\n"
        
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
        return _serialize_backtest_result(result)
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
                change = latest - prev
                change_pct = (change / prev * 100) if prev else 0.0
                if not all(math.isfinite(v) for v in (latest, change, change_pct)):
                    continue
                result[name] = {
                    "current": latest,
                    "change": change,
                    "change_pct": change_pct,
                }
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── AI 에이전트 백테스트 ─────────────────────────────────────────
@app.post("/api/backtest/agent/start")
async def start_agent_backtest(req: AgentBacktestRequest, background_tasks: BackgroundTasks):
    """AI 에이전트 백테스트 시작 (비동기 SSE 스트리밍)"""
    session_id = req.session_id or str(uuid4())
    _backtest_sessions[session_id] = {
        "ticker": req.ticker,
        "status": "running",
        "result": None,
        "error": None,
    }

    async def run():
        try:
            result = await run_agent_backtest(
                ticker=req.ticker,
                start_date=req.start_date,
                end_date=req.end_date,
                initial_capital=req.initial_capital,
                session_id=session_id,
            )
            _backtest_sessions[session_id]["result"] = _serialize_backtest_result(result)
            _backtest_sessions[session_id]["status"] = "done"
        except Exception as e:
            _backtest_sessions[session_id]["status"] = "error"
            _backtest_sessions[session_id]["error"] = str(e)
        finally:
            from backend.core.events import get_thought_queue
            q = get_thought_queue(session_id)
            await q.put(None)  # 스트림 종료 시그널

    background_tasks.add_task(run)
    return {"session_id": session_id, "status": "started"}


@app.get("/api/backtest/agent/stream/{session_id}")
async def stream_agent_backtest(session_id: str):
    """AI 에이전트 백테스트 진행 SSE 스트리밍"""
    async def event_stream():
        import json as _json
        yield f"data: {{\"type\": \"connected\", \"session_id\": \"{session_id}\"}}\n\n"

        async for chunk in stream_thoughts(session_id):
            yield chunk

        session = _backtest_sessions.get(session_id, {})
        if session.get("result"):
            yield f"data: {_json.dumps({'type': 'backtest_result', **session['result']})}\n\n"
        elif session.get("error"):
            yield f"data: {_json.dumps({'type': 'error', 'message': session['error']})}\n\n"

        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/backtest/agent/result/{session_id}")
async def get_agent_backtest_result(session_id: str):
    """에이전트 백테스트 결과 조회"""
    session = _backtest_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션 없음")
    return session


# ── 설정 API ────────────────────────────────────────────
@app.get("/api/settings")
async def get_settings_api():
    """현재 설정 조회 (API 키는 마스킹)"""
    key = settings.openai_api_key
    if key and len(key) > 8:
        masked = f"{key[:7]}...{key[-4:]}"
    elif key:
        masked = "설정됨"
    else:
        masked = ""
    return {
        "openai_api_key_set": bool(key),
        "openai_api_key_preview": masked,
        "default_llm_model": settings.default_llm_model,
        "fast_llm_model": settings.fast_llm_model,
        "reasoning_effort": settings.reasoning_effort,
        "max_debate_rounds": settings.max_debate_rounds,
        "kis_mock": settings.kis_mock,
        "kis_app_key_set": bool(settings.kis_app_key),
        "kis_app_secret_set": bool(settings.kis_app_secret),
        "kis_account_no": settings.kis_account_no,
    }


@app.post("/api/settings")
async def update_settings_api(req: SettingsUpdateRequest):
    """설정 저장 (메모리 즉시 반영 + user_settings.json 영구 저장)"""
    from backend.core.llm import reset_client

    if req.openai_api_key:
        object.__setattr__(settings, "openai_api_key", req.openai_api_key)
        reset_client()  # 키 변경 시 SDK 클라이언트 재생성

    object.__setattr__(settings, "default_llm_model", req.default_llm_model)
    object.__setattr__(settings, "fast_llm_model", req.fast_llm_model)
    object.__setattr__(settings, "reasoning_effort", req.reasoning_effort)
    object.__setattr__(settings, "max_debate_rounds", req.max_debate_rounds)
    object.__setattr__(settings, "kis_mock", req.kis_mock)

    # KIS 자격증명이 변경된 경우 토큰 캐시 무효화
    kis_changed = False
    if req.kis_app_key and req.kis_app_key != settings.kis_app_key:
        object.__setattr__(settings, "kis_app_key", req.kis_app_key)
        kis_changed = True
    if req.kis_app_secret and req.kis_app_secret != settings.kis_app_secret:
        object.__setattr__(settings, "kis_app_secret", req.kis_app_secret)
        kis_changed = True
    if req.kis_account_no and req.kis_account_no != settings.kis_account_no:
        object.__setattr__(settings, "kis_account_no", req.kis_account_no)
    if kis_changed:
        from data.kis.client import invalidate_token
        invalidate_token()

    _us.save({
        "openai_api_key": req.openai_api_key or None,  # 빈 문자열이면 저장 안 함
        "default_llm_model": req.default_llm_model,
        "fast_llm_model": req.fast_llm_model,
        "reasoning_effort": req.reasoning_effort,
        "max_debate_rounds": req.max_debate_rounds,
        "kis_mock": req.kis_mock,
        "kis_app_key": req.kis_app_key or None,
        "kis_app_secret": req.kis_app_secret or None,
        "kis_account_no": req.kis_account_no or None,
    })
    return {"ok": True}


# ── KIS OpenAPI ─────────────────────────────────────────────────
@app.get("/api/kis/status")
async def kis_status():
    """KIS API 연결 상태 확인"""
    try:
        from data.kis.trading import get_connection_status
        return await get_connection_status()
    except Exception as e:
        return {"connected": False, "is_mock": settings.kis_mock, "error": str(e)}


@app.get("/api/kis/balance")
async def kis_balance():
    """주식 잔고 조회"""
    try:
        from data.kis.trading import get_balance
        return await get_balance()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/kis/price/{ticker}")
async def kis_price(ticker: str):
    """국내주식 현재가 조회"""
    try:
        from data.kis.trading import get_current_price
        return await get_current_price(ticker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/kis/order")
async def kis_order(req: KisOrderRequest):
    """주식 현금 주문 (매수/매도)"""
    if req.side not in ("buy", "sell"):
        raise HTTPException(status_code=422, detail="side는 'buy' 또는 'sell'이어야 합니다")
    if req.qty <= 0:
        raise HTTPException(status_code=422, detail="수량은 1 이상이어야 합니다")
    if req.order_type not in ("00", "01"):
        raise HTTPException(status_code=422, detail="order_type은 '00'(지정가) 또는 '01'(시장가)")
    try:
        from data.kis.trading import place_order
        return await place_order(
            ticker=req.ticker,
            side=req.side,  # type: ignore[arg-type]
            qty=req.qty,
            price=req.price,
            order_type=req.order_type,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)

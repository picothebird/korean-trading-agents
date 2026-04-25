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
from backend.services.auto_trading import (
    auto_trading_supervisor,
    AutoLoopSettings,
    SupervisionLevel,
    ExecutionSessionMode,
)
from backend.services.portfolio_trading import (
    portfolio_supervisor,
    PortfolioLoopSettings,
    UniverseMarket,
    MonitoringProfile,
    ExecutionSessionMode as PortfolioExecutionSessionMode,
)
from agents.orchestrator.orchestrator import run_analysis
from backtesting.backtest import run_simple_backtest, run_agent_backtest, format_result_summary
from data.market.fetcher import get_stock_info, get_technical_indicators, search_stocks, get_price_history


# ── 앱 시작 ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # user_settings.json 이 있으면 스타트업 시 적용
    _us.apply_to_settings(settings)
    print("🚀 Korean Trading Agents API 서버 시작")
    yield
    await auto_trading_supervisor.shutdown()
    await portfolio_supervisor.shutdown()
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
    decision_interval_days: int = Field(default=20, ge=1, le=120)


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
    guru_enabled: bool = False
    guru_debate_enabled: bool = True
    guru_require_user_confirmation: bool = False
    guru_risk_profile: Literal["defensive", "balanced", "aggressive"] = "balanced"
    guru_investment_principles: str = Field(default="", max_length=1200)
    guru_min_confidence_to_act: float = Field(default=0.72, ge=0.0, le=1.0)
    guru_max_risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "HIGH"
    guru_max_position_pct: float = Field(default=20.0, ge=1.0, le=100.0)


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
    decision_interval_days: int = Field(default=20, ge=1, le=120)
    session_id: str | None = None


class AutoLoopStartRequest(BaseModel):
    ticker: str
    interval_min: int = Field(default=15, ge=1, le=1440)
    min_confidence: float = Field(default=0.72, ge=0.0, le=1.0)
    order_qty: int = Field(default=1, ge=1, le=1_000_000)
    paper_trade: bool = True
    fee_bps: float = Field(default=1.5, ge=0.0, le=500.0)
    slippage_bps: float = Field(default=3.0, ge=0.0, le=200.0)
    tax_bps: float = Field(default=18.0, ge=0.0, le=1000.0)
    max_position_pct: float = Field(default=25.0, ge=1.0, le=100.0)
    supervision_level: Literal["strict", "balanced", "aggressive"] = "balanced"
    execution_session_mode: Literal["regular_only", "regular_and_after_hours"] = "regular_only"
    initial_cash: float = Field(default=10_000_000, ge=10_000)


class PortfolioLoopStartRequest(BaseModel):
    name: str = Field(default="portfolio", min_length=1, max_length=80)
    seed_tickers: list[str] = Field(default_factory=list, max_length=60)
    preferred_tickers: list[str] = Field(default_factory=list, max_length=60)
    excluded_tickers: list[str] = Field(default_factory=list, max_length=200)
    interest_keywords: list[str] = Field(default_factory=list, max_length=20)
    monitoring_profile: Literal["balanced", "momentum", "defensive"] = "balanced"
    market_scan_enabled: bool = True
    universe_market: Literal["ALL", "KOSPI", "KOSDAQ"] = "ALL"
    universe_limit: int = Field(default=60, ge=10, le=200)
    candidate_count: int = Field(default=8, ge=1, le=30)
    max_positions: int = Field(default=5, ge=1, le=20)
    max_parallel_analyses: int = Field(default=3, ge=1, le=8)
    cycle_interval_min: int = Field(default=20, ge=1, le=1440)
    min_confidence: float = Field(default=0.70, ge=0.0, le=1.0)
    max_single_position_pct: float = Field(default=25.0, ge=1.0, le=100.0)
    rebalance_threshold_pct: float = Field(default=1.5, ge=0.0, le=20.0)
    paper_trade: bool = True
    initial_cash: float = Field(default=20_000_000, ge=10_000)
    fee_bps: float = Field(default=1.5, ge=0.0, le=500.0)
    slippage_bps: float = Field(default=3.0, ge=0.0, le=500.0)
    tax_bps: float = Field(default=18.0, ge=0.0, le=1000.0)
    execution_session_mode: Literal["regular_only", "regular_and_after_hours"] = "regular_only"


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
        "prediction_trace": getattr(result, "prediction_trace", []),
        "prediction_monitoring": getattr(result, "prediction_monitoring", {}),
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


@app.get("/api/stock/{ticker}/chart")
async def get_stock_chart(
    ticker: str,
    timeframe: str = Query(default="6m", pattern="^(1m|3m|6m|1y|2y)$"),
):
    """차트 데이터 조회 (OHLCV + MA)"""
    try:
        days_map = {
            "1m": 35,
            "3m": 110,
            "6m": 220,
            "1y": 420,
            "2y": 800,
        }
        points = get_price_history(ticker, days=days_map.get(timeframe, 220))
        return {
            "ticker": ticker,
            "timeframe": timeframe,
            "points": points,
        }
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
            decision_interval_days=req.decision_interval_days,
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
                decision_interval_days=req.decision_interval_days,
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
        "guru_enabled": settings.guru_enabled,
        "guru_debate_enabled": settings.guru_debate_enabled,
        "guru_require_user_confirmation": settings.guru_require_user_confirmation,
        "guru_risk_profile": settings.guru_risk_profile,
        "guru_investment_principles": settings.guru_investment_principles,
        "guru_min_confidence_to_act": settings.guru_min_confidence_to_act,
        "guru_max_risk_level": settings.guru_max_risk_level,
        "guru_max_position_pct": settings.guru_max_position_pct,
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
    object.__setattr__(settings, "guru_enabled", req.guru_enabled)
    object.__setattr__(settings, "guru_debate_enabled", req.guru_debate_enabled)
    object.__setattr__(settings, "guru_require_user_confirmation", req.guru_require_user_confirmation)
    object.__setattr__(settings, "guru_risk_profile", req.guru_risk_profile)
    object.__setattr__(settings, "guru_investment_principles", req.guru_investment_principles)
    object.__setattr__(settings, "guru_min_confidence_to_act", req.guru_min_confidence_to_act)
    object.__setattr__(settings, "guru_max_risk_level", req.guru_max_risk_level)
    object.__setattr__(settings, "guru_max_position_pct", req.guru_max_position_pct)
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
        "guru_enabled": req.guru_enabled,
        "guru_debate_enabled": req.guru_debate_enabled,
        "guru_require_user_confirmation": req.guru_require_user_confirmation,
        "guru_risk_profile": req.guru_risk_profile,
        "guru_investment_principles": req.guru_investment_principles,
        "guru_min_confidence_to_act": req.guru_min_confidence_to_act,
        "guru_max_risk_level": req.guru_max_risk_level,
        "guru_max_position_pct": req.guru_max_position_pct,
        "kis_mock": req.kis_mock,
        "kis_app_key": req.kis_app_key or None,
        "kis_app_secret": req.kis_app_secret or None,
        "kis_account_no": req.kis_account_no or None,
    })
    return {"ok": True}


# ── 서버 상주 자동매매 루프 API ─────────────────────────
@app.post("/api/auto-loop/start")
async def start_auto_loop(req: AutoLoopStartRequest):
    """서버에서 지속 실행되는 자동 분석/주문 루프 시작"""
    settings_obj = AutoLoopSettings(
        ticker=req.ticker,
        interval_min=req.interval_min,
        min_confidence=req.min_confidence,
        order_qty=req.order_qty,
        paper_trade=req.paper_trade,
        fee_bps=req.fee_bps,
        slippage_bps=req.slippage_bps,
        tax_bps=req.tax_bps,
        max_position_pct=req.max_position_pct,
        supervision_level=SupervisionLevel(req.supervision_level),
        execution_session_mode=ExecutionSessionMode(req.execution_session_mode),
        initial_cash=req.initial_cash,
    )
    rt = await auto_trading_supervisor.start(settings_obj)
    return {
        "loop_id": rt.loop_id,
        "status": "running",
    }


@app.post("/api/auto-loop/stop/{loop_id}")
async def stop_auto_loop(loop_id: str):
    """자동매매 루프 중지"""
    ok = await auto_trading_supervisor.stop(loop_id)
    if not ok:
        raise HTTPException(status_code=404, detail="루프를 찾을 수 없습니다")
    return {"loop_id": loop_id, "status": "stopped"}


@app.get("/api/auto-loop/status/{loop_id}")
async def auto_loop_status(loop_id: str):
    """자동매매 루프 상태/로그/이력 조회"""
    status = await auto_trading_supervisor.status(loop_id)
    if status is None:
        raise HTTPException(status_code=404, detail="루프를 찾을 수 없습니다")
    return status


@app.get("/api/auto-loop/list")
async def auto_loop_list():
    """현재 생성된 자동매매 루프 목록"""
    loops = await auto_trading_supervisor.list_loops()
    return {"loops": loops}


# ── 포트폴리오 오케스트레이션 루프 API ─────────────────────────
@app.post("/api/portfolio-loop/start")
async def start_portfolio_loop(req: PortfolioLoopStartRequest):
    settings_obj = PortfolioLoopSettings(
        name=req.name,
        seed_tickers=req.seed_tickers,
        preferred_tickers=req.preferred_tickers,
        excluded_tickers=req.excluded_tickers,
        interest_keywords=req.interest_keywords,
        monitoring_profile=MonitoringProfile(req.monitoring_profile),
        market_scan_enabled=req.market_scan_enabled,
        universe_market=UniverseMarket(req.universe_market),
        universe_limit=req.universe_limit,
        candidate_count=req.candidate_count,
        max_positions=req.max_positions,
        max_parallel_analyses=req.max_parallel_analyses,
        cycle_interval_min=req.cycle_interval_min,
        min_confidence=req.min_confidence,
        max_single_position_pct=req.max_single_position_pct,
        rebalance_threshold_pct=req.rebalance_threshold_pct,
        paper_trade=req.paper_trade,
        initial_cash=req.initial_cash,
        fee_bps=req.fee_bps,
        slippage_bps=req.slippage_bps,
        tax_bps=req.tax_bps,
        execution_session_mode=PortfolioExecutionSessionMode(req.execution_session_mode),
    )
    rt = await portfolio_supervisor.start(settings_obj)
    return {
        "loop_id": rt.loop_id,
        "status": "running",
    }


@app.post("/api/portfolio-loop/stop/{loop_id}")
async def stop_portfolio_loop(loop_id: str):
    ok = await portfolio_supervisor.stop(loop_id)
    if not ok:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    return {"loop_id": loop_id, "status": "stopped"}


@app.get("/api/portfolio-loop/status/{loop_id}")
async def portfolio_loop_status(loop_id: str):
    status = await portfolio_supervisor.status(loop_id)
    if status is None:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    return status


@app.get("/api/portfolio-loop/list")
async def portfolio_loop_list():
    loops = await portfolio_supervisor.list_loops()
    return {"loops": loops}


@app.post("/api/portfolio-loop/scan/{loop_id}")
async def portfolio_loop_manual_scan(loop_id: str):
    """유저 요청 시 즉시 시장 스캔 수행"""
    try:
        status = await portfolio_supervisor.manual_scan(loop_id)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    if status is None:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    return status


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

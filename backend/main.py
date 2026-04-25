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

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal

from backend.api.user_system import router as user_system_router
from backend.core.config import settings
from backend.core.events import stream_thoughts, AgentThought, AgentRole, AgentStatus, emit_thought
from backend.core.mongodb import connect_to_mongo, close_mongo, get_mongo_health, get_mongo_database
from backend.core.order_approvals import (
    ORDER_APPROVAL_EXPIRED,
    ORDER_APPROVAL_PENDING,
    approve_order_approval,
    create_order_approval,
    get_order_approval,
    load_kis_runtime,
    reject_order_approval,
    serialize_approval,
)
from backend.core.runtime_sessions import (
    SESSION_TYPE_AGENT_BACKTEST,
    SESSION_TYPE_ANALYSIS,
    create_runtime_session,
    get_runtime_session,
    mark_runtime_session_done,
    mark_runtime_session_error,
    serialize_runtime_session,
)
from backend.core.user_access import install_user_activity_middleware, record_trade, require_user
from backend.core.user_runtime_settings import (
    build_public_settings,
    get_or_create_user_settings_doc,
    get_runtime_profile_for_user,
    runtime_profile_context,
    update_user_settings_doc,
)
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
    mongo_status = await connect_to_mongo()
    if mongo_status.get("connected"):
        print(f"🍃 MongoDB 연결 성공 ({mongo_status.get('database')})")
    elif mongo_status.get("configured"):
        print(f"⚠ MongoDB 연결 실패: {mongo_status.get('error')}")
    else:
        print("ℹ MongoDB 미설정 (MONGODB_URI가 비어 있음)")
    print("🚀 Korean Trading Agents API 서버 시작")
    yield
    await auto_trading_supervisor.shutdown()
    await portfolio_supervisor.shutdown()
    await close_mongo()
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

install_user_activity_middleware(app)
app.include_router(user_system_router)


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
    default_llm_model: str = "gpt-5"
    fast_llm_model: str = "gpt-5-mini"
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


class KisOrderApprovalCreateRequest(BaseModel):
    ticker: str
    side: str                  # "buy" | "sell"
    qty: int
    price: int
    order_type: str = "00"    # "00": 지정가, "01": 시장가
    context: str = ""         # optional UI context


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


_KIS_APPROVAL_TTL_MIN = 15
_KIS_APPROVAL_MAX_KEEP_HOURS = 24
_RUNTIME_SESSION_MAX_KEEP_HOURS = 24


def _validate_kis_order_request(side: str, qty: int, order_type: str) -> None:
    if side not in ("buy", "sell"):
        raise HTTPException(status_code=422, detail="side는 'buy' 또는 'sell'이어야 합니다")
    if qty <= 0:
        raise HTTPException(status_code=422, detail="수량은 1 이상이어야 합니다")
    if order_type not in ("00", "01"):
        raise HTTPException(status_code=422, detail="order_type은 '00'(지정가) 또는 '01'(시장가)")


def _build_kis_order_payload(
    ticker: str,
    side: str,
    qty: int,
    price: int,
    order_type: str,
) -> dict:
    return {
        "ticker": ticker.strip(),
        "side": side,
        "qty": int(qty),
        "price": 0 if order_type == "01" else int(price),
        "order_type": order_type,
    }


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


def _user_id_str(user: dict) -> str:
    return str(user.get("_id") or user.get("id") or "")


def _user_is_master(user: dict) -> bool:
    return str(user.get("role", "viewer") or "viewer").strip().lower() == "master"


async def _load_user_runtime_profile(request: Request) -> tuple[dict, dict]:
    user = await require_user(request)
    db = _require_mongo_db()

    profile = await get_runtime_profile_for_user(db, user)
    return user, profile


def _require_mongo_db():
    try:
        return get_mongo_database()
    except Exception:
        raise HTTPException(status_code=503, detail="MongoDB 연결이 필요합니다")


def _has_loop_access(loop_status: dict, user: dict) -> bool:
    if _user_is_master(user):
        return True
    return str(loop_status.get("owner_user_id", "") or "") == _user_id_str(user)


def _has_approval_access(approval_row: dict, user: dict) -> bool:
    if _user_is_master(user):
        return True
    return str(approval_row.get("owner_user_id", "") or "") == _user_id_str(user)


def _has_runtime_session_access(row: dict, user: dict) -> bool:
    if _user_is_master(user):
        return True
    return str(row.get("owner_user_id", "") or "") == _user_id_str(user)


# ── 라우터 ───────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/health/mongo")
async def mongo_health():
    """MongoDB 연결 상태 확인"""
    return await get_mongo_health()


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
async def start_analysis(req: AnalysisRequest, background_tasks: BackgroundTasks, request: Request):
    """에이전트 분석 시작 (비동기) - session_id 반환"""
    user, runtime_profile = await _load_user_runtime_profile(request)
    db = _require_mongo_db()

    session_id = req.session_id or str(uuid4())
    await create_runtime_session(
        db,
        session_id=session_id,
        session_type=SESSION_TYPE_ANALYSIS,
        owner_user_id=_user_id_str(user),
        ticker=req.ticker,
        max_keep_hours=_RUNTIME_SESSION_MAX_KEEP_HOURS,
    )
    profile_snapshot = dict(runtime_profile)

    async def run():
        try:
            with runtime_profile_context(profile_snapshot):
                decision = await run_analysis(req.ticker, session_id)
            decision_payload = {
                "action": decision.action,
                "ticker": decision.ticker,
                "confidence": decision.confidence,
                "reasoning": decision.reasoning,
                "agents_summary": decision.agents_summary,
                "timestamp": decision.timestamp,
            }

            await mark_runtime_session_done(
                db,
                session_id=session_id,
                session_type=SESSION_TYPE_ANALYSIS,
                decision=decision_payload,
            )
        except Exception as e:
            await mark_runtime_session_error(
                db,
                session_id=session_id,
                session_type=SESSION_TYPE_ANALYSIS,
                error=str(e),
            )
            # 스트림 종료
            from backend.core.events import get_thought_queue
            q = get_thought_queue(session_id)
            await q.put(None)

    background_tasks.add_task(run)
    return {"session_id": session_id, "status": "started"}


@app.get("/api/analyze/stream/{session_id}")
async def stream_analysis(session_id: str, request: Request):
    """에이전트 사고 과정 SSE 스트리밍"""
    user = await require_user(request)
    db = _require_mongo_db()
    session_meta = await get_runtime_session(db, session_id, SESSION_TYPE_ANALYSIS)
    if session_meta is None:
        raise HTTPException(status_code=404, detail="세션 없음")
    if not _has_runtime_session_access(session_meta, user):
        raise HTTPException(status_code=403, detail="해당 세션 접근 권한이 없습니다")

    async def event_stream():
        # 헬스체크 이벤트
        yield "data: {\"type\": \"connected\", \"session_id\": \"" + session_id + "\"}\n\n"
        
        async for chunk in stream_thoughts(session_id):
            yield chunk
        
        # 최종 결정 전송
        session = await get_runtime_session(db, session_id, SESSION_TYPE_ANALYSIS) or {}
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
async def get_result(session_id: str, request: Request):
    """분석 완료 결과 조회"""
    user = await require_user(request)
    db = _require_mongo_db()
    session = await get_runtime_session(db, session_id, SESSION_TYPE_ANALYSIS)
    if not session:
        raise HTTPException(status_code=404, detail="세션 없음")
    if not _has_runtime_session_access(session, user):
        raise HTTPException(status_code=403, detail="해당 세션 접근 권한이 없습니다")
    return serialize_runtime_session(session)


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
async def start_agent_backtest(req: AgentBacktestRequest, background_tasks: BackgroundTasks, request: Request):
    """AI 에이전트 백테스트 시작 (비동기 SSE 스트리밍)"""
    user, runtime_profile = await _load_user_runtime_profile(request)
    db = _require_mongo_db()

    session_id = req.session_id or str(uuid4())
    await create_runtime_session(
        db,
        session_id=session_id,
        session_type=SESSION_TYPE_AGENT_BACKTEST,
        owner_user_id=_user_id_str(user),
        ticker=req.ticker,
        max_keep_hours=_RUNTIME_SESSION_MAX_KEEP_HOURS,
    )
    profile_snapshot = dict(runtime_profile)

    async def run():
        try:
            with runtime_profile_context(profile_snapshot):
                result = await run_agent_backtest(
                    ticker=req.ticker,
                    start_date=req.start_date,
                    end_date=req.end_date,
                    initial_capital=req.initial_capital,
                    decision_interval_days=req.decision_interval_days,
                    session_id=session_id,
                )
            await mark_runtime_session_done(
                db,
                session_id=session_id,
                session_type=SESSION_TYPE_AGENT_BACKTEST,
                result=_serialize_backtest_result(result),
            )
        except Exception as e:
            await mark_runtime_session_error(
                db,
                session_id=session_id,
                session_type=SESSION_TYPE_AGENT_BACKTEST,
                error=str(e),
            )
        finally:
            from backend.core.events import get_thought_queue
            q = get_thought_queue(session_id)
            await q.put(None)  # 스트림 종료 시그널

    background_tasks.add_task(run)
    return {"session_id": session_id, "status": "started"}


@app.get("/api/backtest/agent/stream/{session_id}")
async def stream_agent_backtest(session_id: str, request: Request):
    """AI 에이전트 백테스트 진행 SSE 스트리밍"""
    user = await require_user(request)
    db = _require_mongo_db()
    session_meta = await get_runtime_session(db, session_id, SESSION_TYPE_AGENT_BACKTEST)
    if session_meta is None:
        raise HTTPException(status_code=404, detail="세션 없음")
    if not _has_runtime_session_access(session_meta, user):
        raise HTTPException(status_code=403, detail="해당 세션 접근 권한이 없습니다")

    async def event_stream():
        import json as _json
        yield f"data: {{\"type\": \"connected\", \"session_id\": \"{session_id}\"}}\n\n"

        async for chunk in stream_thoughts(session_id):
            yield chunk

        session = await get_runtime_session(db, session_id, SESSION_TYPE_AGENT_BACKTEST) or {}
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
async def get_agent_backtest_result(session_id: str, request: Request):
    """에이전트 백테스트 결과 조회"""
    user = await require_user(request)
    db = _require_mongo_db()
    session = await get_runtime_session(db, session_id, SESSION_TYPE_AGENT_BACKTEST)
    if not session:
        raise HTTPException(status_code=404, detail="세션 없음")
    if not _has_runtime_session_access(session, user):
        raise HTTPException(status_code=403, detail="해당 세션 접근 권한이 없습니다")
    return serialize_runtime_session(session)


# ── 설정 API ────────────────────────────────────────────
@app.get("/api/settings")
async def get_settings_api(request: Request):
    """현재 로그인 사용자의 설정 조회 (민감정보 마스킹)."""
    user = await require_user(request)
    db = _require_mongo_db()

    doc = await get_or_create_user_settings_doc(db, user)
    return build_public_settings(doc)


@app.post("/api/settings")
async def update_settings_api(req: SettingsUpdateRequest, request: Request):
    """현재 로그인 사용자의 설정 저장."""
    user = await require_user(request)
    db = _require_mongo_db()

    payload = req.model_dump(exclude_unset=True)
    doc = await update_user_settings_doc(db, user, payload)

    # 자격증명 변경 가능성이 있으므로 토큰 캐시를 보수적으로 초기화한다.
    from data.kis.client import invalidate_token

    invalidate_token()
    return {"ok": True, "settings": build_public_settings(doc)}


# ── 서버 상주 자동매매 루프 API ─────────────────────────
@app.post("/api/auto-loop/start")
async def start_auto_loop(req: AutoLoopStartRequest, request: Request):
    """서버에서 지속 실행되는 자동 분석/주문 루프 시작"""
    user, runtime_profile = await _load_user_runtime_profile(request)

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
        owner_user_id=_user_id_str(user),
        runtime_profile=dict(runtime_profile),
    )
    rt = await auto_trading_supervisor.start(settings_obj)
    return {
        "loop_id": rt.loop_id,
        "status": "running",
    }


@app.post("/api/auto-loop/stop/{loop_id}")
async def stop_auto_loop(loop_id: str, request: Request):
    """자동매매 루프 중지"""
    user = await require_user(request)
    status = await auto_trading_supervisor.status(loop_id)
    if status is None:
        raise HTTPException(status_code=404, detail="루프를 찾을 수 없습니다")
    if not _has_loop_access(status, user):
        raise HTTPException(status_code=403, detail="해당 루프를 중지할 권한이 없습니다")

    ok = await auto_trading_supervisor.stop(loop_id)
    if not ok:
        raise HTTPException(status_code=404, detail="루프를 찾을 수 없습니다")
    return {"loop_id": loop_id, "status": "stopped"}


@app.get("/api/auto-loop/status/{loop_id}")
async def auto_loop_status(loop_id: str, request: Request):
    """자동매매 루프 상태/로그/이력 조회"""
    user = await require_user(request)
    status = await auto_trading_supervisor.status(loop_id)
    if status is None:
        raise HTTPException(status_code=404, detail="루프를 찾을 수 없습니다")
    if not _has_loop_access(status, user):
        raise HTTPException(status_code=403, detail="해당 루프 조회 권한이 없습니다")
    return status


@app.get("/api/auto-loop/list")
async def auto_loop_list(request: Request):
    """현재 생성된 자동매매 루프 목록"""
    user = await require_user(request)
    loops = await auto_trading_supervisor.list_loops()
    if not _user_is_master(user):
        owner_id = _user_id_str(user)
        loops = [row for row in loops if str(row.get("owner_user_id", "") or "") == owner_id]
    return {"loops": loops}


# ── 포트폴리오 오케스트레이션 루프 API ─────────────────────────
@app.post("/api/portfolio-loop/start")
async def start_portfolio_loop(req: PortfolioLoopStartRequest, request: Request):
    user, runtime_profile = await _load_user_runtime_profile(request)

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
        owner_user_id=_user_id_str(user),
        runtime_profile=dict(runtime_profile),
    )
    rt = await portfolio_supervisor.start(settings_obj)
    return {
        "loop_id": rt.loop_id,
        "status": "running",
    }


@app.post("/api/portfolio-loop/stop/{loop_id}")
async def stop_portfolio_loop(loop_id: str, request: Request):
    user = await require_user(request)
    status = await portfolio_supervisor.status(loop_id)
    if status is None:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    if not _has_loop_access(status, user):
        raise HTTPException(status_code=403, detail="해당 포트폴리오 루프를 중지할 권한이 없습니다")

    ok = await portfolio_supervisor.stop(loop_id)
    if not ok:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    return {"loop_id": loop_id, "status": "stopped"}


@app.get("/api/portfolio-loop/status/{loop_id}")
async def portfolio_loop_status(loop_id: str, request: Request):
    user = await require_user(request)
    status = await portfolio_supervisor.status(loop_id)
    if status is None:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    if not _has_loop_access(status, user):
        raise HTTPException(status_code=403, detail="해당 포트폴리오 루프 조회 권한이 없습니다")
    return status


@app.get("/api/portfolio-loop/list")
async def portfolio_loop_list(request: Request):
    user = await require_user(request)
    loops = await portfolio_supervisor.list_loops()
    if not _user_is_master(user):
        owner_id = _user_id_str(user)
        loops = [row for row in loops if str(row.get("owner_user_id", "") or "") == owner_id]
    return {"loops": loops}


@app.post("/api/portfolio-loop/scan/{loop_id}")
async def portfolio_loop_manual_scan(loop_id: str, request: Request):
    """유저 요청 시 즉시 시장 스캔 수행"""
    user = await require_user(request)
    status = await portfolio_supervisor.status(loop_id)
    if status is None:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    if not _has_loop_access(status, user):
        raise HTTPException(status_code=403, detail="해당 포트폴리오 루프 스캔 권한이 없습니다")

    try:
        status = await portfolio_supervisor.manual_scan(loop_id)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    if status is None:
        raise HTTPException(status_code=404, detail="포트폴리오 루프를 찾을 수 없습니다")
    return status


# ── KIS OpenAPI ─────────────────────────────────────────────────
@app.get("/api/kis/status")
async def kis_status(request: Request):
    """KIS API 연결 상태 확인"""
    _, runtime_profile = await _load_user_runtime_profile(request)
    try:
        from data.kis.trading import get_connection_status
        with runtime_profile_context(runtime_profile):
            return await get_connection_status()
    except Exception as e:
        runtime_is_mock = bool(runtime_profile.get("kis_mock", True))
        return {"connected": False, "is_mock": runtime_is_mock, "error": str(e)}


@app.get("/api/kis/balance")
async def kis_balance(request: Request):
    """주식 잔고 조회"""
    _, runtime_profile = await _load_user_runtime_profile(request)
    try:
        from data.kis.trading import get_balance
        with runtime_profile_context(runtime_profile):
            return await get_balance()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/kis/price/{ticker}")
async def kis_price(ticker: str, request: Request):
    """국내주식 현재가 조회"""
    _, runtime_profile = await _load_user_runtime_profile(request)
    try:
        from data.kis.trading import get_current_price
        with runtime_profile_context(runtime_profile):
            return await get_current_price(ticker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/kis/order")
async def kis_order(req: KisOrderRequest, request: Request):
    """주식 현금 주문 (매수/매도)"""
    _, runtime_profile = await _load_user_runtime_profile(request)
    runtime_is_mock = bool(runtime_profile.get("kis_mock", True))
    runtime_require_confirm = bool(runtime_profile.get("guru_require_user_confirmation", False))

    _validate_kis_order_request(req.side, req.qty, req.order_type)
    if (not runtime_is_mock) and runtime_require_confirm:
        raise HTTPException(
            status_code=428,
            detail="GURU 승인 강제 옵션이 켜져 있습니다. /api/kis/order/approval/request 이후 approve/reject API를 사용하세요.",
        )

    payload = _build_kis_order_payload(
        ticker=req.ticker,
        side=req.side,
        qty=req.qty,
        price=req.price,
        order_type=req.order_type,
    )

    try:
        from data.kis.trading import place_order
        with runtime_profile_context(runtime_profile):
            order_result = await place_order(
                ticker=payload["ticker"],
                side=payload["side"],  # type: ignore[arg-type]
                qty=payload["qty"],
                price=payload["price"],
                order_type=payload["order_type"],
            )
        await record_trade(
            request=request,
            trade_type="kis_order",
            mode="simulated" if runtime_is_mock else "live",
            status="executed",
            ticker=payload["ticker"],
            side=payload["side"],
            qty=payload["qty"],
            price=payload["price"],
            order_type=payload["order_type"],
            source="kis_direct_order",
            meta={"order_no": order_result.get("order_no", "") if isinstance(order_result, dict) else ""},
        )
        return order_result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/kis/order/approval/request")
async def create_kis_order_approval(req: KisOrderApprovalCreateRequest, request: Request):
    """실전 주문 전 승인 대기 건 생성 (GURU 승인 강제 대응)"""
    user, runtime_profile = await _load_user_runtime_profile(request)
    db = _require_mongo_db()
    runtime_is_mock = bool(runtime_profile.get("kis_mock", True))
    runtime_require_confirm = bool(runtime_profile.get("guru_require_user_confirmation", False))

    _validate_kis_order_request(req.side, req.qty, req.order_type)

    payload = _build_kis_order_payload(
        ticker=req.ticker,
        side=req.side,
        qty=req.qty,
        price=req.price,
        order_type=req.order_type,
    )

    approval_id = str(uuid4())
    try:
        row = await create_order_approval(
            db,
            approval_id=approval_id,
            owner_user_id=_user_id_str(user),
            context=req.context,
            order_payload=payload,
            is_mock=runtime_is_mock,
            guru_require_user_confirmation=runtime_require_confirm,
            kis_runtime={
                "kis_mock": runtime_is_mock,
                "kis_app_key": str(runtime_profile.get("kis_app_key", "") or ""),
                "kis_app_secret": str(runtime_profile.get("kis_app_secret", "") or ""),
                "kis_account_no": str(runtime_profile.get("kis_account_no", "") or ""),
            },
            ttl_min=_KIS_APPROVAL_TTL_MIN,
            max_keep_hours=_KIS_APPROVAL_MAX_KEEP_HOURS,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="승인 요청 저장에 실패했습니다")

    await record_trade(
        request=request,
        trade_type="kis_order_approval",
        mode="simulated" if runtime_is_mock else "live",
        status="pending_approval",
        ticker=payload["ticker"],
        side=payload["side"],
        qty=payload["qty"],
        price=payload["price"],
        order_type=payload["order_type"],
        source="kis_approval_request",
        meta={"approval_id": approval_id},
    )

    public_row = serialize_approval(row)

    return {
        "approval_id": public_row["approval_id"],
        "status": public_row["status"],
        "created_at": public_row["created_at"],
        "expires_at": public_row["expires_at"],
        "order": public_row["order"],
        "is_mock": public_row["is_mock"],
        "guru_require_user_confirmation": public_row["guru_require_user_confirmation"],
    }


@app.get("/api/kis/order/approval/{approval_id}")
async def get_kis_order_approval(approval_id: str, request: Request):
    """주문 승인 대기 건 조회"""
    user = await require_user(request)
    db = _require_mongo_db()
    row = await get_order_approval(db, approval_id)
    if row is None:
        raise HTTPException(status_code=404, detail="승인 요청을 찾을 수 없습니다")
    if not _has_approval_access(row, user):
        raise HTTPException(status_code=403, detail="해당 승인 요청 접근 권한이 없습니다")

    public_row = serialize_approval(row)

    return {
        "approval_id": public_row.get("approval_id"),
        "status": public_row.get("status"),
        "created_at": public_row.get("created_at"),
        "expires_at": public_row.get("expires_at"),
        "resolved_at": public_row.get("resolved_at"),
        "order": public_row.get("order"),
        "is_mock": public_row.get("is_mock"),
        "guru_require_user_confirmation": public_row.get("guru_require_user_confirmation"),
    }


@app.post("/api/kis/order/approval/{approval_id}/approve")
async def approve_kis_order_approval(approval_id: str, request: Request):
    """승인 대기 건을 승인하고 실제 주문 실행"""
    user = await require_user(request)
    db = _require_mongo_db()
    row = await get_order_approval(db, approval_id)
    if row is None:
        raise HTTPException(status_code=404, detail="승인 요청을 찾을 수 없습니다")
    if not _has_approval_access(row, user):
        raise HTTPException(status_code=403, detail="해당 승인 요청 처리 권한이 없습니다")

    status = str(row.get("status", "") or "")
    if status != ORDER_APPROVAL_PENDING:
        if status == ORDER_APPROVAL_EXPIRED:
            raise HTTPException(status_code=410, detail="승인 요청 유효시간이 만료되었습니다")
        raise HTTPException(status_code=409, detail=f"이미 처리된 승인 요청입니다: {status}")

    payload = row.get("order", {})
    try:
        kis_runtime = load_kis_runtime(row)
    except Exception:
        raise HTTPException(status_code=500, detail="승인 런타임 복호화에 실패했습니다")

    try:
        from data.kis.trading import place_order
        with runtime_profile_context(kis_runtime):
            order_result = await place_order(
                ticker=str(payload.get("ticker", "")),
                side=str(payload.get("side", "buy")),  # type: ignore[arg-type]
                qty=int(payload.get("qty", 0) or 0),
                price=int(payload.get("price", 0) or 0),
                order_type=str(payload.get("order_type", "00")),
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    updated = await approve_order_approval(db, approval_id, order_result)
    if updated is None:
        latest = await get_order_approval(db, approval_id)
        latest_status = str((latest or {}).get("status", "unknown") or "unknown")
        raise HTTPException(status_code=409, detail=f"이미 처리된 승인 요청입니다: {latest_status}")

    await record_trade(
        request=request,
        trade_type="kis_order_approval",
        mode="simulated" if bool(updated.get("is_mock", True)) else "live",
        status="approved_executed",
        ticker=str(payload.get("ticker", "")),
        side=str(payload.get("side", "buy")),
        qty=int(payload.get("qty", 0) or 0),
        price=int(payload.get("price", 0) or 0),
        order_type=str(payload.get("order_type", "00")),
        source="kis_approval_approve",
        meta={
            "approval_id": approval_id,
            "order_no": order_result.get("order_no", "") if isinstance(order_result, dict) else "",
        },
    )

    public_row = serialize_approval(updated)

    return {
        "approval_id": approval_id,
        "status": public_row["status"],
        "resolved_at": public_row["resolved_at"],
        "order_result": order_result,
    }


@app.post("/api/kis/order/approval/{approval_id}/reject")
async def reject_kis_order_approval(approval_id: str, request: Request):
    """승인 대기 건 거절"""
    user = await require_user(request)
    db = _require_mongo_db()
    row = await get_order_approval(db, approval_id)
    if row is None:
        raise HTTPException(status_code=404, detail="승인 요청을 찾을 수 없습니다")
    if not _has_approval_access(row, user):
        raise HTTPException(status_code=403, detail="해당 승인 요청 처리 권한이 없습니다")

    status = str(row.get("status", "") or "")
    if status != ORDER_APPROVAL_PENDING:
        if status == ORDER_APPROVAL_EXPIRED:
            raise HTTPException(status_code=410, detail="승인 요청 유효시간이 만료되었습니다")
        raise HTTPException(status_code=409, detail=f"이미 처리된 승인 요청입니다: {status}")

    updated = await reject_order_approval(db, approval_id)
    if updated is None:
        latest = await get_order_approval(db, approval_id)
        latest_status = str((latest or {}).get("status", "unknown") or "unknown")
        raise HTTPException(status_code=409, detail=f"이미 처리된 승인 요청입니다: {latest_status}")

    payload = row.get("order", {})
    await record_trade(
        request=request,
        trade_type="kis_order_approval",
        mode="simulated" if bool(updated.get("is_mock", True)) else "live",
        status="rejected",
        ticker=str(payload.get("ticker", "")),
        side=str(payload.get("side", "buy")),
        qty=int(payload.get("qty", 0) or 0),
        price=int(payload.get("price", 0) or 0),
        order_type=str(payload.get("order_type", "00")),
        source="kis_approval_reject",
        meta={"approval_id": approval_id},
    )

    public_row = serialize_approval(updated)

    return {
        "approval_id": approval_id,
        "status": public_row["status"],
        "resolved_at": public_row["resolved_at"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)

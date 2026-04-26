"""
Server-resident multi-asset portfolio orchestration loop.

Flow:
- Market monitoring and candidate ranking
- Parallel per-symbol analysis (bounded concurrency)
- Portfolio target allocation and rebalance
- Paper/live execution path with shared cash/risk budget
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from agents.orchestrator.orchestrator import run_analysis
from backend.core.events import clear_thought_queue
from backend.core.user_runtime_settings import runtime_profile_context
from data.market.fetcher import get_market_universe, get_stock_info, get_technical_indicators
from data.market.market_meta import get_lot_size, is_vi_engaged
from data.market.krx_rules import (
    KrxSession,
    get_krx_session,
    is_tradable_session,
    normalize_share_qty,
    round_to_tick,
    session_slippage_multiplier,
)


KST = ZoneInfo("Asia/Seoul")


def _utc_now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _now_kst() -> datetime:
    return datetime.now(tz=KST)


def _looks_like_future_quote_time(hhmmss: str, now_kst: datetime | None = None) -> bool:
    s = str(hhmmss or "").strip()
    if len(s) != 6 or not s.isdigit():
        return False
    now = now_kst or _now_kst()
    return s > now.strftime("%H%M%S")


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _normalize_ticker(code: str) -> str:
    c = "".join(ch for ch in str(code or "") if ch.isdigit())
    return c.zfill(6) if c else ""


class UniverseMarket(str, Enum):
    ALL = "ALL"
    KOSPI = "KOSPI"
    KOSDAQ = "KOSDAQ"


class ExecutionSessionMode(str, Enum):
    REGULAR_ONLY = "regular_only"
    REGULAR_AND_AFTER_HOURS = "regular_and_after_hours"


class MonitoringProfile(str, Enum):
    BALANCED = "balanced"
    MOMENTUM = "momentum"
    DEFENSIVE = "defensive"


@dataclass
class PortfolioLoopSettings:
    name: str = "portfolio"
    seed_tickers: list[str] = field(default_factory=list)
    preferred_tickers: list[str] = field(default_factory=list)
    excluded_tickers: list[str] = field(default_factory=list)
    interest_keywords: list[str] = field(default_factory=list)
    monitoring_profile: MonitoringProfile = MonitoringProfile.BALANCED
    market_scan_enabled: bool = True
    universe_market: UniverseMarket = UniverseMarket.ALL
    universe_limit: int = 60
    candidate_count: int = 8
    max_positions: int = 5
    max_parallel_analyses: int = 3
    cycle_interval_min: int = 20
    min_confidence: float = 0.70
    max_single_position_pct: float = 25.0
    rebalance_threshold_pct: float = 1.5
    paper_trade: bool = True
    initial_cash: float = 20_000_000.0
    fee_bps: float = 1.5
    slippage_bps: float = 3.0
    tax_bps: float = 18.0
    execution_session_mode: ExecutionSessionMode = ExecutionSessionMode.REGULAR_ONLY
    owner_user_id: str = ""
    runtime_profile: dict[str, Any] | None = None
    # Critical M5: 부분체결 시뮬레이션
    simulate_partial_fills: bool = False
    # Critical M4: T+N 결제 (한국 일반주식 = 2)
    settlement_days: int = 2


@dataclass
class PortfolioLog:
    timestamp: str
    level: Literal["info", "success", "warn", "error"]
    message: str


@dataclass
class CandidateSnapshot:
    ticker: str
    name: str
    market: str
    score: float
    current_price: float
    change_pct: float
    rsi_14: float
    ma_gap_pct: float
    reason: str


@dataclass
class DecisionSnapshot:
    ticker: str
    action: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    risk_level: str
    requires_human_approval: bool
    reasoning: str
    timestamp: str


@dataclass
class AllocationSnapshot:
    ticker: str
    target_weight_pct: float
    current_weight_pct: float
    action: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    score: float


@dataclass
class PortfolioTradeRecord:
    timestamp: str
    ticker: str
    side: Literal["buy", "sell"]
    qty: int
    price: int
    status: Literal["simulated", "executed", "failed"]
    confidence: float
    reason: str


@dataclass
class PortfolioPosition:
    ticker: str
    shares: float = 0.0
    avg_buy_price: float = 0.0


@dataclass
class PortfolioAccount:
    cash: float
    positions: dict[str, PortfolioPosition] = field(default_factory=dict)
    realized_pnl: float = 0.0
    total_fees: float = 0.0
    total_taxes: float = 0.0
    # Critical M4: T+2 결제 대기 항목
    pending_settlements: list[dict] = field(default_factory=list)

    def available_cash(self) -> float:
        pending = sum(float(p.get("amount", 0.0)) for p in self.pending_settlements)
        return max(0.0, float(self.cash) - pending)

    def settle_due(self, today_iso: str) -> float:
        if not self.pending_settlements:
            return 0.0
        kept: list[dict] = []
        released = 0.0
        for p in self.pending_settlements:
            if str(p.get("settle_date", "")) <= today_iso:
                released += float(p.get("amount", 0.0))
            else:
                kept.append(p)
        self.pending_settlements = kept
        return released


@dataclass
class PortfolioLoopStats:
    cycle_count: int = 0
    scan_count: int = 0
    manual_scan_count: int = 0
    analysis_count: int = 0
    simulated_trades: int = 0
    executed_trades: int = 0
    failed_trades: int = 0
    skipped_cycles: int = 0


@dataclass
class PortfolioRuntime:
    loop_id: str
    settings: PortfolioLoopSettings
    created_at: str
    running: bool = True
    cycle_running: bool = False
    started_at: str | None = None
    stopped_at: str | None = None
    last_run_at: str | None = None
    last_scan_at: str | None = None
    next_run_at: str | None = None
    current_session: str = KrxSession.CLOSED.value
    stats: PortfolioLoopStats = field(default_factory=PortfolioLoopStats)
    logs: list[PortfolioLog] = field(default_factory=list)
    latest_candidates: list[CandidateSnapshot] = field(default_factory=list)
    latest_decisions: dict[str, DecisionSnapshot] = field(default_factory=dict)
    target_allocations: list[AllocationSnapshot] = field(default_factory=list)
    trade_history: list[PortfolioTradeRecord] = field(default_factory=list)
    latest_quotes: dict[str, int] = field(default_factory=dict)
    account: PortfolioAccount = field(default_factory=lambda: PortfolioAccount(cash=20_000_000.0))
    task: asyncio.Task | None = None
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


class PortfolioSupervisor:
    """Server-side supervisor for multi-asset portfolio loops."""

    def __init__(self) -> None:
        self._loops: dict[str, PortfolioRuntime] = {}
        self._lock = asyncio.Lock()

    async def shutdown(self) -> None:
        async with self._lock:
            loop_ids = list(self._loops.keys())
        for loop_id in loop_ids:
            await self.stop(loop_id)

    async def start(self, settings: PortfolioLoopSettings) -> PortfolioRuntime:
        # ── Critical C2: 동일 사용자·동일 포트폴리오명 활성 루프 중복 시작 차단 ──
        async with self._lock:
            for existing in self._loops.values():
                if (
                    existing.running
                    and existing.settings.owner_user_id == settings.owner_user_id
                    and existing.settings.owner_user_id
                    and existing.settings.name == settings.name
                ):
                    raise ValueError(
                        f"이미 동일 이름({settings.name})의 포트폴리오 루프가 실행 중입니다 (loop_id={existing.loop_id})."
                    )

        loop_id = str(uuid4())
        rt = PortfolioRuntime(
            loop_id=loop_id,
            settings=settings,
            created_at=_utc_now_iso(),
            started_at=_utc_now_iso(),
            account=PortfolioAccount(cash=float(settings.initial_cash)),
        )
        self._append_log(rt, "info", f"포트폴리오 루프 시작 · {settings.name}")

        async with self._lock:
            self._loops[loop_id] = rt
            rt.task = asyncio.create_task(self._run_loop(rt), name=f"portfolio-loop:{loop_id}")
        await self._persist_snapshot(rt, status="running")
        return rt

    async def stop(self, loop_id: str) -> bool:
        async with self._lock:
            rt = self._loops.get(loop_id)
        if rt is None:
            return False

        rt.running = False
        rt.stop_event.set()
        task = rt.task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass

        rt.stopped_at = _utc_now_iso()
        self._append_log(rt, "warn", "포트폴리오 루프 중지")
        await self._persist_snapshot(rt, status="stopped")
        return True

    async def status(self, loop_id: str) -> dict | None:
        async with self._lock:
            rt = self._loops.get(loop_id)
            if rt is None:
                return None
            return self._serialize_runtime(rt)

    async def list_loops(self) -> list[dict]:
        async with self._lock:
            return [self._serialize_runtime(rt) for rt in self._loops.values()]

    async def manual_scan(self, loop_id: str) -> dict | None:
        async with self._lock:
            rt = self._loops.get(loop_id)
        if rt is None:
            return None

        if rt.cycle_running:
            raise RuntimeError("사이클 실행 중에는 수동 스캔을 시작할 수 없습니다")

        universe = self._build_universe(rt.settings)
        if not universe:
            self._append_log(rt, "warn", "수동 스캔 실패: 유니버스가 비어 있습니다.")
            return self._serialize_runtime(rt)

        candidates = await self._rank_candidates(universe, rt.settings)
        rt.latest_candidates = candidates[: max(1, int(rt.settings.candidate_count))]
        rt.last_scan_at = _utc_now_iso()
        rt.stats.manual_scan_count += 1
        rt.stats.scan_count += len(rt.latest_candidates)
        self._append_log(rt, "info", f"수동 스캔 완료 · 후보 {len(rt.latest_candidates)}개")
        return self._serialize_runtime(rt)

    async def _run_loop(self, rt: PortfolioRuntime) -> None:
        await self._execute_cycle(rt)
        while rt.running:
            rt.next_run_at = (
                datetime.utcnow() + timedelta(minutes=max(1, int(rt.settings.cycle_interval_min)))
            ).replace(microsecond=0).isoformat() + "Z"
            try:
                await asyncio.wait_for(rt.stop_event.wait(), timeout=max(1, int(rt.settings.cycle_interval_min)) * 60)
            except asyncio.TimeoutError:
                pass
            if not rt.running:
                break
            await self._execute_cycle(rt)

    async def _execute_cycle(self, rt: PortfolioRuntime) -> None:
        if rt.cycle_running:
            rt.stats.skipped_cycles += 1
            self._append_log(rt, "warn", "이전 포트폴리오 사이클 실행 중으로 이번 사이클을 건너뜁니다.")
            return

        # ── Critical M3: KRX 휴장일/주말 가드 ──
        try:
            from data.market.krx_holidays import is_trading_day, now_kst
            today_kst = now_kst().date()
            if not is_trading_day(today_kst):
                rt.stats.skipped_cycles += 1
                self._append_log(
                    rt,
                    "info",
                    f"오늘({today_kst.isoformat()})은 KRX 휴장일/주말이라 포트폴리오 사이클을 건너뜁니다.",
                )
                return
        except Exception:
            pass

        rt.cycle_running = True
        rt.stats.cycle_count += 1
        rt.next_run_at = None

        try:
            with runtime_profile_context(rt.settings.runtime_profile):
                current_session = get_krx_session()
                rt.current_session = current_session.value
                include_after_hours = rt.settings.execution_session_mode == ExecutionSessionMode.REGULAR_AND_AFTER_HOURS

                if rt.settings.paper_trade:
                    if not is_tradable_session(current_session, include_after_hours=include_after_hours):
                        rt.stats.skipped_cycles += 1
                        self._append_log(rt, "info", f"세션({current_session.value})이 실행 대상이 아니어서 대기합니다.")
                        return
                else:
                    if current_session != KrxSession.REGULAR:
                        rt.stats.skipped_cycles += 1
                        self._append_log(rt, "warn", "실전 포트폴리오 루프는 정규장에서만 실행합니다.")
                        return

                self._append_log(rt, "info", f"포트폴리오 사이클 #{rt.stats.cycle_count} 시작")

                universe = self._build_universe(rt.settings)
                if not universe:
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "warn", "스캔 유니버스가 비어 이번 사이클을 보류합니다.")
                    return

                candidates = await self._rank_candidates(universe, rt.settings)
                rt.latest_candidates = candidates[: max(1, int(rt.settings.candidate_count))]
                rt.last_scan_at = _utc_now_iso()
                rt.stats.scan_count += len(rt.latest_candidates)

                targets = self._select_analysis_targets(rt, rt.latest_candidates)
                if not targets:
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "warn", "분석 대상 종목이 없어 사이클을 종료합니다.")
                    return

                decisions = await self._run_parallel_analyses(rt, targets)
                rt.latest_decisions = decisions
                rt.stats.analysis_count += len(decisions)

                quote_targets = sorted(set(targets + list(rt.account.positions.keys())))
                quotes = await self._fetch_quotes(rt, quote_targets)
                if not quotes:
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "warn", "유효 시세를 확보하지 못해 리밸런싱을 보류합니다.")
                    return

                rt.latest_quotes = {k: int(v.get("price") or 0) for k, v in quotes.items()}
                allocations = self._build_target_allocations(rt, decisions, rt.latest_candidates, quotes)
                rt.target_allocations = allocations

                orders = self._build_rebalance_orders(rt, allocations, quotes)
                if not orders["sells"] and not orders["buys"]:
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "info", "리밸런싱 임계값 이내로 주문이 필요하지 않습니다.")
                    return

                await self._execute_orders(rt, orders, quotes)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            rt.stats.failed_trades += 1
            self._append_log(rt, "error", f"포트폴리오 사이클 오류: {str(exc)[:180]}")
        finally:
            rt.cycle_running = False
            rt.last_run_at = _utc_now_iso()
            try:
                await self._persist_snapshot(rt)
            except Exception:
                pass

    def _build_universe(self, settings: PortfolioLoopSettings) -> list[dict]:
        universe_map: dict[str, dict] = {}
        excluded_set = {
            _normalize_ticker(t)
            for t in settings.excluded_tickers
            if _normalize_ticker(t)
        }

        for seed in settings.seed_tickers:
            ticker = _normalize_ticker(seed)
            if not ticker:
                continue
            if ticker in excluded_set:
                continue
            info = get_stock_info(ticker)
            universe_map[ticker] = {
                "code": ticker,
                "name": str(info.get("name", "") or ticker),
                "market": str(info.get("market", "") or ""),
                "sector": str(info.get("sector", "") or ""),
                "industry": str(info.get("industry", "") or ""),
            }

        if settings.market_scan_enabled:
            rows = get_market_universe(
                limit=max(10, int(settings.universe_limit)),
                market=settings.universe_market.value,
            )
            for row in rows:
                ticker = _normalize_ticker(str(row.get("code", "")))
                if not ticker:
                    continue
                if ticker in excluded_set:
                    continue
                if ticker in universe_map:
                    continue
                universe_map[ticker] = {
                    "code": ticker,
                    "name": str(row.get("name", "") or ticker),
                    "market": str(row.get("market", "") or ""),
                    "sector": str(row.get("sector", "") or ""),
                    "industry": str(row.get("industry", "") or ""),
                }

        return list(universe_map.values())[: max(10, int(settings.universe_limit))]

    def _monitoring_weights(self, profile: MonitoringProfile) -> dict[str, float]:
        if profile == MonitoringProfile.MOMENTUM:
            return {
                "trend": 1.3,
                "momentum": 1.5,
                "rsi": 0.8,
                "macd": 1.2,
                "liquidity": 1.1,
                "preference_boost": 1.0,
            }
        if profile == MonitoringProfile.DEFENSIVE:
            return {
                "trend": 0.9,
                "momentum": 0.6,
                "rsi": 1.3,
                "macd": 0.8,
                "liquidity": 1.4,
                "preference_boost": 1.1,
            }
        return {
            "trend": 1.0,
            "momentum": 1.0,
            "rsi": 1.0,
            "macd": 1.0,
            "liquidity": 1.0,
            "preference_boost": 1.0,
        }

    async def _rank_candidates(self, universe: list[dict], settings: PortfolioLoopSettings) -> list[CandidateSnapshot]:
        ranked: list[CandidateSnapshot] = []
        scan_limit = max(10, min(int(settings.universe_limit), 200))
        preferred_set = {
            _normalize_ticker(t)
            for t in settings.preferred_tickers
            if _normalize_ticker(t)
        }
        excluded_set = {
            _normalize_ticker(t)
            for t in settings.excluded_tickers
            if _normalize_ticker(t)
        }
        keywords = [k.strip().lower() for k in settings.interest_keywords if str(k).strip()]
        weights = self._monitoring_weights(settings.monitoring_profile)

        for row in universe[:scan_limit]:
            ticker = str(row.get("code", ""))
            if not ticker:
                continue
            if ticker in excluded_set:
                continue

            indicators = await asyncio.to_thread(get_technical_indicators, ticker, 180)
            if not isinstance(indicators, dict) or indicators.get("error"):
                continue

            current_price = float(indicators.get("current_price") or 0.0)
            if current_price <= 0:
                continue

            change_pct = float(indicators.get("change_pct") or 0.0)
            rsi = float(indicators.get("rsi_14") or 50.0)
            ma5 = indicators.get("ma5")
            ma20 = indicators.get("ma20")
            macd_hist = float(indicators.get("macd_hist") or 0.0)
            volume = float(indicators.get("volume") or 0.0)

            ma_gap = 0.0
            if ma5 and ma20 and float(ma20) != 0.0:
                ma_gap = (float(ma5) - float(ma20)) / float(ma20) * 100.0

            # Score = trend + momentum + oscillator + liquidity
            trend_score = _clamp(ma_gap, -3.0, 3.0)
            momentum_score = _clamp(change_pct / 2.0, -2.0, 2.0)
            if 45 <= rsi <= 70:
                rsi_score = 1.0
            elif 30 <= rsi < 45:
                rsi_score = 0.4
            elif rsi > 80:
                rsi_score = -1.0
            elif rsi < 20:
                rsi_score = -0.8
            else:
                rsi_score = 0.0
            macd_score = 0.8 if macd_hist > 0 else -0.5
            liq_score = _clamp(math.log10(volume + 1.0) / 3.0, 0.0, 1.5)

            weighted_base = (
                trend_score * weights["trend"]
                + momentum_score * weights["momentum"]
                + rsi_score * weights["rsi"]
                + macd_score * weights["macd"]
                + liq_score * weights["liquidity"]
            )

            name = str(row.get("name", "") or ticker)
            market = str(row.get("market", "") or "")
            sector = str(row.get("sector", "") or "")
            industry = str(row.get("industry", "") or "")

            if keywords and (not sector or not industry):
                info = get_stock_info(ticker)
                if not name or name == ticker:
                    name = str(info.get("name", "") or ticker)
                if not market:
                    market = str(info.get("market", "") or "")
                if not sector:
                    sector = str(info.get("sector", "") or "")
                if not industry:
                    industry = str(info.get("industry", "") or "")

            preference_boost = 0.0
            if ticker in preferred_set:
                preference_boost += 1.2

            if keywords:
                lookup_text = " ".join([name, sector, industry]).lower()
                keyword_hits = sum(1 for kw in keywords if kw in lookup_text)
                preference_boost += min(1.5, keyword_hits * 0.5)

            score = weighted_base + preference_boost * weights["preference_boost"]

            reason_tokens: list[str] = []
            if ma_gap > 0:
                reason_tokens.append("MA5>MA20")
            if macd_hist > 0:
                reason_tokens.append("MACD+")
            if change_pct > 0:
                reason_tokens.append("상승모멘텀")
            if 45 <= rsi <= 70:
                reason_tokens.append("RSI중립상승")
            if ticker in preferred_set:
                reason_tokens.append("선호종목가중")
            if keywords:
                lookup_text = " ".join([name, sector, industry]).lower()
                matched = [kw for kw in keywords if kw in lookup_text]
                if matched:
                    reason_tokens.append(f"관심키워드({','.join(matched[:2])})")
            if not reason_tokens:
                reason_tokens.append("관망/약세")

            ranked.append(
                CandidateSnapshot(
                    ticker=ticker,
                    name=name,
                    market=market,
                    score=round(score, 4),
                    current_price=round(current_price, 2),
                    change_pct=round(change_pct, 3),
                    rsi_14=round(rsi, 2),
                    ma_gap_pct=round(ma_gap, 3),
                    reason=", ".join(reason_tokens),
                )
            )

        ranked.sort(key=lambda x: x.score, reverse=True)
        return ranked

    def _select_analysis_targets(self, rt: PortfolioRuntime, candidates: list[CandidateSnapshot]) -> list[str]:
        picks: list[str] = []
        seen: set[str] = set()

        for c in candidates[: max(1, int(rt.settings.candidate_count))]:
            if c.ticker not in seen:
                seen.add(c.ticker)
                picks.append(c.ticker)

        for t in rt.settings.seed_tickers:
            ticker = _normalize_ticker(t)
            if ticker and ticker not in seen:
                seen.add(ticker)
                picks.append(ticker)

        for ticker in rt.account.positions.keys():
            if ticker not in seen:
                seen.add(ticker)
                picks.append(ticker)

        max_targets = max(int(rt.settings.candidate_count), int(rt.settings.max_positions) * 2)
        return picks[: max_targets]

    async def _run_parallel_analyses(self, rt: PortfolioRuntime, tickers: list[str]) -> dict[str, DecisionSnapshot]:
        results: dict[str, DecisionSnapshot] = {}
        sem = asyncio.Semaphore(max(1, int(rt.settings.max_parallel_analyses)))

        async def _worker(ticker: str) -> None:
            session_id = f"portfolio-{rt.loop_id}-{rt.stats.cycle_count}-{ticker}-{uuid4().hex[:6]}"
            async with sem:
                try:
                    decision = await asyncio.wait_for(run_analysis(ticker, session_id), timeout=240)
                    action = str(decision.action or "HOLD").upper()
                    if action not in {"BUY", "SELL", "HOLD"}:
                        action = "HOLD"

                    agents_summary = decision.agents_summary or {}
                    risk_level = str(agents_summary.get("risk_level", "UNKNOWN") or "UNKNOWN").upper()
                    requires_human = bool(agents_summary.get("requires_human_approval"))

                    results[ticker] = DecisionSnapshot(
                        ticker=ticker,
                        action=action,  # type: ignore[arg-type]
                        confidence=round(_clamp(float(decision.confidence or 0.0), 0.0, 1.0), 4),
                        risk_level=risk_level,
                        requires_human_approval=requires_human,
                        reasoning=str(decision.reasoning or "")[:300],
                        timestamp=str(decision.timestamp or datetime.now().isoformat()),
                    )
                except Exception as exc:
                    results[ticker] = DecisionSnapshot(
                        ticker=ticker,
                        action="HOLD",
                        confidence=0.0,
                        risk_level="ERROR",
                        requires_human_approval=False,
                        reasoning=f"analysis_error: {str(exc)[:120]}",
                        timestamp=datetime.now().isoformat(),
                    )
                finally:
                    clear_thought_queue(session_id)

        await asyncio.gather(*[_worker(t) for t in tickers])
        return results

    async def _fetch_quotes(self, rt: PortfolioRuntime, tickers: list[str]) -> dict[str, dict]:
        from data.kis.trading import get_current_price

        quotes: dict[str, dict] = {}
        sem = asyncio.Semaphore(6)

        async def _worker(ticker: str) -> None:
            async with sem:
                try:
                    q = await get_current_price(ticker)
                    price = int(q.get("current_price") or 0)
                    if price <= 0:
                        return

                    price_time = str(q.get("price_time", "") or "")
                    if _looks_like_future_quote_time(price_time):
                        self._append_log(rt, "warn", f"{ticker} 미래 시각 시세({price_time}) 감지로 해당 종목을 제외합니다.")
                        return

                    quotes[ticker] = {
                        "price": price,
                        "price_time": price_time,
                        "halt_yn": str(q.get("halt_yn", "") or "").upper(),
                        "warning_code": str(q.get("warning_code", "") or ""),
                        "upper_limit_price": int(q.get("upper_limit_price") or 0),
                        "lower_limit_price": int(q.get("lower_limit_price") or 0),
                    }
                except Exception:
                    return

        await asyncio.gather(*[_worker(t) for t in tickers])
        return quotes

    def _build_target_allocations(
        self,
        rt: PortfolioRuntime,
        decisions: dict[str, DecisionSnapshot],
        candidates: list[CandidateSnapshot],
        quotes: dict[str, dict],
    ) -> list[AllocationSnapshot]:
        candidate_scores = {c.ticker: c.score for c in candidates}

        equity, current_weights = self._compute_equity_and_weights(rt, quotes)
        if equity <= 0:
            return []

        raw_targets: dict[str, float] = {}
        for ticker, d in decisions.items():
            current_w = current_weights.get(ticker, 0.0)
            if d.action == "SELL":
                continue

            # Human-approval required signals are blocked in unattended portfolio mode.
            if d.requires_human_approval and d.action == "BUY":
                continue

            if d.action == "BUY" and d.confidence >= rt.settings.min_confidence:
                base_score = max(0.3, candidate_scores.get(ticker, 0.0) + 3.0)
                raw_targets[ticker] = base_score * max(0.25, d.confidence)
            elif d.action == "HOLD" and current_w > 0:
                raw_targets[ticker] = current_w
            elif d.action == "BUY" and current_w > 0:
                raw_targets[ticker] = current_w * 0.7

        # Keep some continuity when no fresh BUY setup exists.
        if not raw_targets and current_weights:
            for ticker, w in sorted(current_weights.items(), key=lambda x: x[1], reverse=True):
                if w <= 0:
                    continue
                raw_targets[ticker] = w

        ranked = sorted(raw_targets.items(), key=lambda x: x[1], reverse=True)
        ranked = ranked[: max(1, int(rt.settings.max_positions))]
        capped = self._cap_normalize(
            dict(ranked),
            cap=max(0.01, min(1.0, rt.settings.max_single_position_pct / 100.0)),
            budget=min(1.0, (rt.settings.max_single_position_pct / 100.0) * max(1, int(rt.settings.max_positions))),
        )

        all_tickers = set(current_weights.keys()) | set(capped.keys())
        out: list[AllocationSnapshot] = []
        for ticker in sorted(all_tickers):
            d = decisions.get(ticker)
            out.append(
                AllocationSnapshot(
                    ticker=ticker,
                    target_weight_pct=round(capped.get(ticker, 0.0) * 100.0, 3),
                    current_weight_pct=round(current_weights.get(ticker, 0.0) * 100.0, 3),
                    action=d.action if d else "HOLD",
                    confidence=round(d.confidence if d else 0.0, 4),
                    score=round(candidate_scores.get(ticker, 0.0), 4),
                )
            )

        out.sort(key=lambda x: x.target_weight_pct, reverse=True)
        return out

    def _compute_equity_and_weights(self, rt: PortfolioRuntime, quotes: dict[str, dict]) -> tuple[float, dict[str, float]]:
        market_value = 0.0
        values: dict[str, float] = {}
        for ticker, pos in rt.account.positions.items():
            quote = quotes.get(ticker)
            if quote is None:
                continue
            price = float(quote.get("price") or 0.0)
            if price <= 0:
                continue
            val = float(pos.shares) * price
            values[ticker] = val
            market_value += val

        equity = max(1.0, rt.account.cash + market_value)
        weights = {ticker: (val / equity) for ticker, val in values.items()}
        return equity, weights

    def _cap_normalize(self, raw: dict[str, float], cap: float, budget: float) -> dict[str, float]:
        if not raw:
            return {}

        positive = {k: float(v) for k, v in raw.items() if float(v) > 0}
        if not positive:
            return {}

        cap = _clamp(cap, 0.0, 1.0)
        remaining_budget = _clamp(budget, 0.0, 1.0)
        remaining = dict(positive)
        out: dict[str, float] = {}

        while remaining and remaining_budget > 1e-8:
            total = sum(remaining.values())
            if total <= 0:
                break

            newly_capped: list[str] = []
            for ticker, val in list(remaining.items()):
                tentative = remaining_budget * (val / total)
                if tentative > cap:
                    out[ticker] = cap
                    remaining_budget -= cap
                    newly_capped.append(ticker)

            if not newly_capped:
                total_rem = sum(remaining.values())
                if total_rem <= 0:
                    break
                for ticker, val in remaining.items():
                    out[ticker] = remaining_budget * (val / total_rem)
                remaining_budget = 0.0
                break

            for ticker in newly_capped:
                remaining.pop(ticker, None)

        return out

    def _build_rebalance_orders(self, rt: PortfolioRuntime, allocations: list[AllocationSnapshot], quotes: dict[str, dict]) -> dict[str, list[dict]]:
        equity, _ = self._compute_equity_and_weights(rt, quotes)
        if equity <= 0:
            return {"sells": [], "buys": []}

        target_map = {a.ticker: a.target_weight_pct / 100.0 for a in allocations}

        sells: list[dict] = []
        buys: list[dict] = []

        tickers = set(target_map.keys()) | set(rt.account.positions.keys())
        for ticker in tickers:
            quote = quotes.get(ticker)
            if quote is None:
                continue
            price = float(quote.get("price") or 0.0)
            if price <= 0:
                continue

            pos = rt.account.positions.get(ticker, PortfolioPosition(ticker=ticker))
            current_value = float(pos.shares) * price
            target_value = target_map.get(ticker, 0.0) * equity
            gap_value = target_value - current_value
            gap_pct = abs(gap_value) / equity * 100.0

            if gap_pct < rt.settings.rebalance_threshold_pct:
                continue

            if gap_value < 0:
                sell_qty = normalize_share_qty(min(float(pos.shares), abs(gap_value) / price), lot_size=get_lot_size(ticker))
                if sell_qty > 0:
                    sells.append({
                        "ticker": ticker,
                        "side": "sell",
                        "qty": int(sell_qty),
                        "price": int(price),
                        "reason": f"리밸런싱 축소 {gap_pct:.2f}%",
                    })
            else:
                buy_qty = normalize_share_qty(abs(gap_value) / price, lot_size=get_lot_size(ticker))
                if buy_qty > 0:
                    buys.append({
                        "ticker": ticker,
                        "side": "buy",
                        "qty": int(buy_qty),
                        "price": int(price),
                        "reason": f"리밸런싱 확대 {gap_pct:.2f}%",
                    })

        sells.sort(key=lambda x: x["qty"] * x["price"], reverse=True)
        buys.sort(key=lambda x: x["qty"] * x["price"], reverse=True)
        return {"sells": sells, "buys": buys}

    async def _execute_orders(self, rt: PortfolioRuntime, orders: dict[str, list[dict]], quotes: dict[str, dict]) -> None:
        for order in orders.get("sells", []):
            await self._execute_single_order(rt, order, quotes)
        for order in orders.get("buys", []):
            await self._execute_single_order(rt, order, quotes)

    async def _execute_single_order(self, rt: PortfolioRuntime, order: dict, quotes: dict[str, dict]) -> None:
        ticker = str(order.get("ticker", ""))
        side = str(order.get("side", ""))
        qty = int(order.get("qty") or 0)
        market_price = int(order.get("price") or 0)
        reason = str(order.get("reason", ""))

        if side not in {"buy", "sell"} or qty <= 0 or market_price <= 0:
            return

        decision = rt.latest_decisions.get(ticker)
        confidence = float(decision.confidence if decision else 0.0)

        quote = quotes.get(ticker, {})
        block_reason = self._market_block_reason(side, quote)
        if block_reason:
            rt.stats.skipped_cycles += 1
            self._append_log(rt, "warn", f"{ticker} 주문 차단: {block_reason}")
            return

        if rt.settings.paper_trade:
            ok = self._apply_account_fill(rt, ticker, side, qty, market_price, confidence, reason, status="simulated")
            if ok:
                rt.stats.simulated_trades += 1
            return

        from data.kis.trading import place_order

        try:
            await place_order(
                ticker=ticker,
                side=side,  # type: ignore[arg-type]
                qty=qty,
                price=0,
                order_type="01",
            )
            ok = self._apply_account_fill(rt, ticker, side, qty, market_price, confidence, reason, status="executed")
            if ok:
                rt.stats.executed_trades += 1
                self._append_log(rt, "success", f"실전 주문 요청 완료 · {ticker} {side} {qty}주")
        except Exception as exc:
            rt.stats.failed_trades += 1
            rt.trade_history.insert(
                0,
                PortfolioTradeRecord(
                    timestamp=datetime.utcnow().isoformat(),
                    ticker=ticker,
                    side="buy" if side == "buy" else "sell",
                    qty=qty,
                    price=market_price,
                    status="failed",
                    confidence=round(confidence, 4),
                    reason=f"실전 주문 실패: {str(exc)[:120]}",
                ),
            )
            rt.trade_history = rt.trade_history[:240]
            self._append_log(rt, "error", f"실전 주문 실패 · {ticker} · {str(exc)[:140]}")

    def _market_block_reason(self, side: str, quote: dict) -> str | None:
        halt_yn = str(quote.get("halt_yn", "") or "").upper()
        if halt_yn == "Y":
            return "거래정지 상태"

        # Critical M1: VI(변동성완화장치) 발동 종목 차단
        try:
            from data.market.market_meta import is_vi_engaged
            if is_vi_engaged(quote):
                return "VI 발동 종목"
        except Exception:
            pass

        warning_code = str(quote.get("warning_code", "") or "").strip()
        if warning_code not in {"", "0", "00"}:
            return f"시장경고코드({warning_code})"

        price = int(quote.get("price") or 0)
        upper = int(quote.get("upper_limit_price") or 0)
        lower = int(quote.get("lower_limit_price") or 0)
        if side == "buy" and upper > 0 and price >= upper:
            return "상한가 근처"
        if side == "sell" and lower > 0 and price <= lower:
            return "하한가 근처"

        return None

    def _apply_account_fill(
        self,
        rt: PortfolioRuntime,
        ticker: str,
        side: str,
        qty: int,
        market_price: int,
        confidence: float,
        reason: str,
        status: Literal["simulated", "executed"],
    ) -> bool:
        qty = normalize_share_qty(qty, lot_size=get_lot_size(ticker))
        if qty <= 0:
            return False

        # Critical M4: 결제 도래분 회수
        try:
            from data.market.krx_holidays import now_kst
            rt.account.settle_due(now_kst().date().isoformat())
        except Exception:
            pass

        # Critical M5: 부분체결 시뮬레이션
        if getattr(rt.settings, "simulate_partial_fills", False):
            try:
                from data.market.market_meta import simulate_partial_fill
                qty = simulate_partial_fill(qty, enable=True)
            except Exception:
                pass

        session = get_krx_session()
        slippage_bps = rt.settings.slippage_bps * session_slippage_multiplier(session)

        if side == "buy":
            fill_price = float(round_to_tick(market_price * (1 + slippage_bps / 10000.0), direction="up"))
        else:
            fill_price = float(round_to_tick(market_price * (1 - slippage_bps / 10000.0), direction="down"))

        if fill_price <= 0:
            return False

        gross = float(qty) * fill_price
        fee = gross * (rt.settings.fee_bps / 10000.0)
        tax = gross * (rt.settings.tax_bps / 10000.0) if side == "sell" else 0.0

        if side == "buy":
            total_cost = gross + fee
            if total_cost > rt.account.available_cash() + 1e-6:
                affordable_qty = normalize_share_qty(rt.account.available_cash() / max(1.0, fill_price * (1 + rt.settings.fee_bps / 10000.0)), lot_size=get_lot_size(ticker))
                qty = int(affordable_qty)
                if qty <= 0:
                    return False
                gross = float(qty) * fill_price
                fee = gross * (rt.settings.fee_bps / 10000.0)
                total_cost = gross + fee

            position = rt.account.positions.get(ticker)
            if position is None:
                position = PortfolioPosition(ticker=ticker, shares=0.0, avg_buy_price=0.0)
                rt.account.positions[ticker] = position

            prev_shares = float(position.shares)
            new_shares = prev_shares + float(qty)
            if new_shares > 0:
                position.avg_buy_price = ((position.avg_buy_price * prev_shares) + gross) / new_shares
            position.shares = new_shares
            rt.account.cash -= total_cost
        else:
            position = rt.account.positions.get(ticker)
            if position is None or position.shares <= 0:
                return False

            sell_qty = min(int(position.shares), int(qty))
            sell_qty = normalize_share_qty(sell_qty, lot_size=get_lot_size(ticker))
            if sell_qty <= 0:
                return False

            qty = sell_qty
            gross = float(qty) * fill_price
            fee = gross * (rt.settings.fee_bps / 10000.0)
            tax = gross * (rt.settings.tax_bps / 10000.0)
            net = gross - fee - tax

            cost_basis = float(qty) * float(position.avg_buy_price)
            rt.account.realized_pnl += net - cost_basis
            position.shares = max(0.0, float(position.shares) - float(qty))
            if position.shares <= 0:
                rt.account.positions.pop(ticker, None)
            rt.account.cash += net
            # Critical M4: 매도 대금 T+2 결제 등록
            try:
                from data.market.krx_holidays import now_kst
                from data.market.market_meta import settlement_trade_date
                today = now_kst().date()
                settle_days = int(getattr(rt.settings, "settlement_days", 2))
                settle = settlement_trade_date(today, days=settle_days)
                rt.account.pending_settlements.append({"amount": float(net), "settle_date": settle.isoformat()})
            except Exception:
                pass

        rt.account.total_fees += fee
        rt.account.total_taxes += tax

        self._append_trade(
            rt,
            ticker=ticker,
            side="buy" if side == "buy" else "sell",
            qty=qty,
            price=int(round(fill_price)),
            status=status,
            confidence=confidence,
            reason=f"{reason} · 세션 {session.value}",
        )
        self._append_log(
            rt,
            "success",
            f"{'모의' if status == 'simulated' else '실전'} {ticker} {'매수' if side == 'buy' else '매도'} {qty}주 @ {int(round(fill_price)):,}",
        )
        return True

    def _append_trade(
        self,
        rt: PortfolioRuntime,
        *,
        ticker: str,
        side: Literal["buy", "sell"],
        qty: int,
        price: int,
        status: Literal["simulated", "executed", "failed"],
        confidence: float,
        reason: str,
    ) -> None:
        rt.trade_history.insert(
            0,
            PortfolioTradeRecord(
                timestamp=datetime.utcnow().isoformat(),
                ticker=ticker,
                side=side,
                qty=int(qty),
                price=int(price),
                status=status,
                confidence=round(confidence, 4),
                reason=reason,
            ),
        )
        rt.trade_history = rt.trade_history[:240]

    async def _persist_snapshot(self, rt: PortfolioRuntime, *, status: str | None = None) -> None:
        """Critical C1: 포트폴리오 루프 상태를 trading_loops 컬렉션에 upsert."""
        try:
            from backend.core.mongodb import get_mongo_database
            db = get_mongo_database()
        except Exception:
            return
        try:
            snap = self._serialize_runtime(rt)
        except Exception:
            return
        snap["kind"] = "portfolio"
        snap["status"] = status or ("running" if rt.running else "stopped")
        snap["updated_at"] = datetime.utcnow()
        try:
            await db.trading_loops.update_one(
                {"loop_id": rt.loop_id},
                {"$set": snap},
                upsert=True,
            )
        except Exception:
            pass

    def _append_log(self, rt: PortfolioRuntime, level: Literal["info", "success", "warn", "error"], message: str) -> None:
        rt.logs.append(
            PortfolioLog(
                timestamp=datetime.now().strftime("%H:%M:%S"),
                level=level,
                message=message,
            )
        )
        rt.logs = rt.logs[-300:]

    def _serialize_runtime(self, rt: PortfolioRuntime) -> dict:
        quotes = rt.latest_quotes
        market_value = 0.0
        position_rows: list[dict] = []

        for ticker, pos in rt.account.positions.items():
            px = float(quotes.get(ticker) or pos.avg_buy_price or 0.0)
            val = float(pos.shares) * px
            market_value += val

            unrealized = (px - float(pos.avg_buy_price)) * float(pos.shares)
            position_rows.append(
                {
                    "ticker": ticker,
                    "shares": round(float(pos.shares), 4),
                    "avg_buy_price": round(float(pos.avg_buy_price), 4),
                    "market_price": round(px, 4),
                    "market_value": round(val, 2),
                    "unrealized_pnl": round(unrealized, 2),
                }
            )

        total_equity = rt.account.cash + market_value
        for row in position_rows:
            row["weight_pct"] = round((row["market_value"] / total_equity * 100.0) if total_equity > 0 else 0.0, 3)

        position_rows.sort(key=lambda x: x["market_value"], reverse=True)

        return {
            "loop_id": rt.loop_id,
            "owner_user_id": rt.settings.owner_user_id,
            "name": rt.settings.name,
            "running": rt.running,
            "cycle_running": rt.cycle_running,
            "created_at": rt.created_at,
            "started_at": rt.started_at,
            "stopped_at": rt.stopped_at,
            "last_run_at": rt.last_run_at,
            "last_scan_at": rt.last_scan_at,
            "next_run_at": rt.next_run_at,
            "current_session": rt.current_session,
            "settings": {
                "name": rt.settings.name,
                "seed_tickers": rt.settings.seed_tickers,
                "preferred_tickers": rt.settings.preferred_tickers,
                "excluded_tickers": rt.settings.excluded_tickers,
                "interest_keywords": rt.settings.interest_keywords,
                "monitoring_profile": rt.settings.monitoring_profile.value,
                "market_scan_enabled": rt.settings.market_scan_enabled,
                "universe_market": rt.settings.universe_market.value,
                "universe_limit": rt.settings.universe_limit,
                "candidate_count": rt.settings.candidate_count,
                "max_positions": rt.settings.max_positions,
                "max_parallel_analyses": rt.settings.max_parallel_analyses,
                "cycle_interval_min": rt.settings.cycle_interval_min,
                "min_confidence": rt.settings.min_confidence,
                "max_single_position_pct": rt.settings.max_single_position_pct,
                "rebalance_threshold_pct": rt.settings.rebalance_threshold_pct,
                "paper_trade": rt.settings.paper_trade,
                "initial_cash": rt.settings.initial_cash,
                "fee_bps": rt.settings.fee_bps,
                "slippage_bps": rt.settings.slippage_bps,
                "tax_bps": rt.settings.tax_bps,
                "execution_session_mode": rt.settings.execution_session_mode.value,
                "owner_user_id": rt.settings.owner_user_id,
            },
            "stats": {
                "cycle_count": rt.stats.cycle_count,
                "scan_count": rt.stats.scan_count,
                "manual_scan_count": rt.stats.manual_scan_count,
                "analysis_count": rt.stats.analysis_count,
                "simulated_trades": rt.stats.simulated_trades,
                "executed_trades": rt.stats.executed_trades,
                "failed_trades": rt.stats.failed_trades,
                "skipped_cycles": rt.stats.skipped_cycles,
            },
            "account": {
                "cash": round(rt.account.cash, 2),
                "market_value": round(market_value, 2),
                "total_equity": round(total_equity, 2),
                "realized_pnl": round(rt.account.realized_pnl, 2),
                "total_fees": round(rt.account.total_fees, 2),
                "total_taxes": round(rt.account.total_taxes, 2),
                "positions": position_rows,
            },
            "latest_candidates": [
                {
                    "ticker": c.ticker,
                    "name": c.name,
                    "market": c.market,
                    "score": c.score,
                    "current_price": c.current_price,
                    "change_pct": c.change_pct,
                    "rsi_14": c.rsi_14,
                    "ma_gap_pct": c.ma_gap_pct,
                    "reason": c.reason,
                }
                for c in rt.latest_candidates
            ],
            "latest_decisions": [
                {
                    "ticker": d.ticker,
                    "action": d.action,
                    "confidence": d.confidence,
                    "risk_level": d.risk_level,
                    "requires_human_approval": d.requires_human_approval,
                    "reasoning": d.reasoning,
                    "timestamp": d.timestamp,
                }
                for d in rt.latest_decisions.values()
            ],
            "target_allocations": [
                {
                    "ticker": a.ticker,
                    "target_weight_pct": a.target_weight_pct,
                    "current_weight_pct": a.current_weight_pct,
                    "action": a.action,
                    "confidence": a.confidence,
                    "score": a.score,
                }
                for a in rt.target_allocations
            ],
            "latest_quotes": rt.latest_quotes,
            "trade_history": [
                {
                    "timestamp": t.timestamp,
                    "ticker": t.ticker,
                    "side": t.side,
                    "qty": t.qty,
                    "price": t.price,
                    "status": t.status,
                    "confidence": t.confidence,
                    "reason": t.reason,
                }
                for t in rt.trade_history[:240]
            ],
            "logs": [
                {
                    "timestamp": l.timestamp,
                    "level": l.level,
                    "message": l.message,
                }
                for l in rt.logs[-300:]
            ],
        }


portfolio_supervisor = PortfolioSupervisor()

"""
서버 상주 자동매매 루프 서비스.

목표:
- 브라우저 탭 상태와 무관하게 주기적 분석/주문 루프 유지
- 모의/실전 공통 의사결정 파이프라인 제공
- 수수료/슬리피지/거래세/포지션 한도/감독 레벨 가드레일 반영
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, time
from enum import Enum
from typing import Any, Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from agents.orchestrator.orchestrator import run_analysis
from backend.core.user_runtime_settings import runtime_profile_context
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
    now_str = now.strftime("%H%M%S")
    return s > now_str


def _is_korean_market_open(now_kst: datetime | None = None) -> bool:
    dt = now_kst or _now_kst()
    if dt.weekday() >= 5:
        return False
    t = dt.time()
    return time(9, 0) <= t <= time(15, 30)


class SupervisionLevel(str, Enum):
    STRICT = "strict"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


class ExecutionSessionMode(str, Enum):
    REGULAR_ONLY = "regular_only"
    REGULAR_AND_AFTER_HOURS = "regular_and_after_hours"


@dataclass
class AutoLoopSettings:
    ticker: str
    interval_min: int = 15
    min_confidence: float = 0.72
    order_qty: int = 1
    paper_trade: bool = True
    fee_bps: float = 1.5
    slippage_bps: float = 3.0
    tax_bps: float = 18.0
    max_position_pct: float = 25.0
    supervision_level: SupervisionLevel = SupervisionLevel.BALANCED
    execution_session_mode: ExecutionSessionMode = ExecutionSessionMode.REGULAR_ONLY
    initial_cash: float = 10_000_000.0
    owner_user_id: str = ""
    runtime_profile: dict[str, Any] | None = None


@dataclass
class LoopLog:
    timestamp: str
    level: Literal["info", "success", "warn", "error"]
    message: str


@dataclass
class DecisionHistoryPoint:
    timestamp: str
    confidence: float
    actionScore: int
    action: Literal["BUY", "SELL", "HOLD"]


@dataclass
class AutoTradeRecord:
    timestamp: str
    ticker: str
    side: Literal["buy", "sell"]
    qty: int
    price: int
    status: Literal["simulated", "executed", "failed"]
    confidence: float
    reason: str


@dataclass
class PaperPortfolio:
    cash: float
    shares: float = 0.0
    avg_buy_price: float = 0.0
    realized_pnl: float = 0.0
    total_fees: float = 0.0
    total_taxes: float = 0.0


@dataclass
class LoopStats:
    cycle_count: int = 0
    simulated_trades: int = 0
    executed_trades: int = 0
    failed_trades: int = 0
    skipped_cycles: int = 0


@dataclass
class AutoLoopRuntime:
    loop_id: str
    settings: AutoLoopSettings
    created_at: str
    running: bool = True
    cycle_running: bool = False
    last_run_at: str | None = None
    next_run_at: str | None = None
    started_at: str | None = None
    stopped_at: str | None = None
    stats: LoopStats = field(default_factory=LoopStats)
    logs: list[LoopLog] = field(default_factory=list)
    decision_history: list[DecisionHistoryPoint] = field(default_factory=list)
    trade_history: list[AutoTradeRecord] = field(default_factory=list)
    latest_decision: dict | None = None
    latest_price: int = 0
    latest_price_time: str | None = None
    paper: PaperPortfolio | None = None
    task: asyncio.Task | None = None
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


class AutoTradingSupervisor:
    """주기 분석/거래 루프를 서버에서 관리한다."""

    def __init__(self):
        self._loops: dict[str, AutoLoopRuntime] = {}
        self._lock = asyncio.Lock()

    async def shutdown(self) -> None:
        async with self._lock:
            loop_ids = list(self._loops.keys())
        for loop_id in loop_ids:
            await self.stop(loop_id)

    async def start(self, settings: AutoLoopSettings) -> AutoLoopRuntime:
        # ── Critical C2: 동일 사용자·동일 종목 활성 루프 중복 시작 차단 ──
        async with self._lock:
            for existing in self._loops.values():
                if (
                    existing.running
                    and existing.settings.owner_user_id == settings.owner_user_id
                    and existing.settings.owner_user_id  # 빈 문자열 동시 매칭 방지
                    and existing.settings.ticker == settings.ticker
                ):
                    raise ValueError(
                        f"이미 동일 종목({settings.ticker})에 대한 자동 루프가 실행 중입니다 (loop_id={existing.loop_id})."
                    )

        loop_id = str(uuid4())
        rt = AutoLoopRuntime(
            loop_id=loop_id,
            settings=settings,
            created_at=_utc_now_iso(),
            started_at=_utc_now_iso(),
            paper=PaperPortfolio(cash=float(settings.initial_cash)) if settings.paper_trade else None,
        )
        self._append_log(rt, "info", f"자동 루프 시작 · {settings.ticker} · {settings.interval_min}분 간격")

        async with self._lock:
            self._loops[loop_id] = rt
            rt.task = asyncio.create_task(self._run_loop(rt), name=f"auto-loop:{loop_id}")

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
        self._append_log(rt, "warn", "자동 루프 중지")
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

    async def _run_loop(self, rt: AutoLoopRuntime) -> None:
        # 첫 사이클 즉시 실행
        await self._execute_cycle(rt)
        while rt.running:
            rt.next_run_at = (datetime.utcnow() + timedelta(minutes=rt.settings.interval_min)).replace(microsecond=0).isoformat() + "Z"
            try:
                await asyncio.wait_for(rt.stop_event.wait(), timeout=max(1, int(rt.settings.interval_min) * 60))
            except asyncio.TimeoutError:
                pass

            if not rt.running:
                break
            await self._execute_cycle(rt)

    async def _execute_cycle(self, rt: AutoLoopRuntime) -> None:
        if rt.cycle_running:
            rt.stats.skipped_cycles += 1
            self._append_log(rt, "warn", "이전 사이클이 아직 실행 중이라 이번 사이클은 건너뜁니다.")
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
                    f"오늘({today_kst.isoformat()})은 KRX 휴장일/주말이라 사이클을 건너뜁니다.",
                )
                return
        except Exception:
            # 휴장일 모듈 문제 시 가드 비활성 — 기존 세션 체크가 fallback
            pass

        rt.cycle_running = True
        rt.stats.cycle_count += 1
        rt.next_run_at = None

        try:
            self._append_log(rt, "info", f"자동 사이클 #{rt.stats.cycle_count} 시작")

            with runtime_profile_context(rt.settings.runtime_profile):
                decision_session = f"auto-loop-{rt.loop_id}-{rt.stats.cycle_count}-{uuid4().hex[:8]}"
                decision = await run_analysis(rt.settings.ticker, decision_session)
                rt.latest_decision = {
                    "action": decision.action,
                    "ticker": decision.ticker,
                    "confidence": decision.confidence,
                    "reasoning": decision.reasoning,
                    "agents_summary": decision.agents_summary,
                    "timestamp": decision.timestamp,
                }

                action = str(decision.action).upper()
                if action not in ("BUY", "SELL", "HOLD"):
                    action = "HOLD"
                confidence = float(decision.confidence)

                rt.decision_history.append(
                    DecisionHistoryPoint(
                        timestamp=datetime.now().strftime("%H:%M"),
                        confidence=round(confidence * 100, 1),
                        actionScore=1 if action == "BUY" else -1 if action == "SELL" else 0,
                        action=action,  # type: ignore[arg-type]
                    )
                )
                rt.decision_history = rt.decision_history[-80:]

                self._append_log(rt, "success", f"분석 완료 · {action} · 신뢰도 {(confidence * 100):.1f}%")

                if confidence < rt.settings.min_confidence:
                    rt.stats.skipped_cycles += 1
                    self._append_log(
                        rt,
                        "warn",
                        f"신뢰도 미달로 주문 보류 · {(confidence * 100):.1f}% < {(rt.settings.min_confidence * 100):.1f}%",
                    )
                    return

                if action == "HOLD":
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "info", "HOLD 판단으로 주문 없이 다음 사이클을 대기합니다.")
                    return

                current_session = get_krx_session()
                include_after_hours = rt.settings.execution_session_mode == ExecutionSessionMode.REGULAR_AND_AFTER_HOURS

                if rt.settings.paper_trade:
                    if not is_tradable_session(current_session, include_after_hours=include_after_hours):
                        rt.stats.skipped_cycles += 1
                        self._append_log(
                            rt,
                            "info",
                            f"현재 세션({current_session.value})은 실행 대상이 아니어서 주문을 보류합니다.",
                        )
                        return
                else:
                    if current_session != KrxSession.REGULAR:
                        rt.stats.skipped_cycles += 1
                        if include_after_hours:
                            self._append_log(rt, "warn", "실전 시간외 주문 라우팅은 아직 미지원입니다. 정규장까지 대기합니다.")
                        else:
                            self._append_log(rt, "warn", "정규장 모드로 설정되어 현재 세션에서는 주문하지 않습니다.")
                        return

                # 감독 레벨 기반 인간 승인 게이트
                requires_human = bool((decision.agents_summary or {}).get("requires_human_approval"))
                risk_level = str((decision.agents_summary or {}).get("risk_level", "")).upper()
                if self._should_block_by_supervision(rt.settings.supervision_level, requires_human, risk_level):
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "warn", "감독 레벨 규칙으로 주문이 보류되었습니다.")
                    return

                from data.kis.trading import get_current_price

                price_res = await get_current_price(rt.settings.ticker)
                market_price = int(price_res.get("current_price") or 0)
                price_time = str(price_res.get("price_time", "") or "")
                rt.latest_price = market_price
                rt.latest_price_time = price_time if price_time else None
                if market_price <= 0:
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "warn", "현재가 조회 실패로 주문을 건너뜁니다.")
                    return

                if _looks_like_future_quote_time(price_time):
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "warn", f"미래 시각 시세 감지({price_time})로 이번 사이클 주문을 보류합니다.")
                    return

                market_block_reason = self._should_block_by_market_state(rt.settings.supervision_level, action, price_res)
                if market_block_reason:
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "warn", market_block_reason)
                    return

                cash_available: float | None = None
                shares_owned: float | None = None
                if not rt.settings.paper_trade:
                    try:
                        from data.kis.trading import get_balance

                        bal = await get_balance()
                        cash_available = float(bal.get("cash") or 0.0)
                        holdings = bal.get("holdings") or []
                        for h in holdings:
                            if str(h.get("ticker", "")).strip() == rt.settings.ticker:
                                shares_owned = float(h.get("qty") or 0.0)
                                break
                    except Exception as e:
                        self._append_log(rt, "warn", f"실전 잔고 조회 실패(보수적 수량 적용): {str(e)[:80]}")

                plan = self._plan_trade(
                    rt,
                    action,
                    market_price,
                    cash_available=cash_available,
                    shares_owned=shares_owned,
                )
                if plan["qty"] <= 0:
                    rt.stats.skipped_cycles += 1
                    self._append_log(rt, "info", "포지션/현금 한도 내에서 추가 주문이 필요하지 않습니다.")
                    return

                side = plan["side"]
                qty = int(plan["qty"])

                if rt.settings.paper_trade:
                    self._apply_paper_trade(rt, side=side, qty=qty, market_price=market_price, confidence=confidence, reason=plan["reason"])
                    return

                await self._execute_live_trade(rt, side=side, qty=qty, market_price=market_price, confidence=confidence, reason=plan["reason"])
        except asyncio.CancelledError:
            raise
        except Exception as e:
            rt.stats.failed_trades += 1
            self._append_log(rt, "error", f"자동 루프 오류: {str(e)[:180]}")
        finally:
            rt.cycle_running = False
            rt.last_run_at = _utc_now_iso()

    def _should_block_by_supervision(self, level: SupervisionLevel, requires_human: bool, risk_level: str) -> bool:
        if level == SupervisionLevel.STRICT:
            return requires_human or risk_level in {"HIGH", "CRITICAL"}
        if level == SupervisionLevel.BALANCED:
            return requires_human and risk_level in {"HIGH", "CRITICAL"}
        return False

    def _supervision_multiplier(self, level: SupervisionLevel) -> float:
        if level == SupervisionLevel.STRICT:
            return 0.6
        if level == SupervisionLevel.BALANCED:
            return 1.0
        return 1.4

    def _should_block_by_market_state(self, level: SupervisionLevel, action: str, price_res: dict) -> str | None:
        halt_yn = str(price_res.get("halt_yn", "") or "").upper()
        if halt_yn == "Y":
            return "거래정지 상태로 주문을 차단합니다."

        warning_code = str(price_res.get("warning_code", "") or "").strip()
        if level == SupervisionLevel.STRICT and warning_code not in {"", "0", "00"}:
            return f"엄격 모드: 시장경고코드({warning_code}) 감지로 주문을 차단합니다."
        if level == SupervisionLevel.BALANCED and warning_code in {"02", "03"}:
            return f"균형 모드: 고위험 경고코드({warning_code}) 감지로 주문을 차단합니다."

        current_price = int(price_res.get("current_price") or 0)
        upper_limit = int(price_res.get("upper_limit_price") or 0)
        lower_limit = int(price_res.get("lower_limit_price") or 0)

        if action == "BUY" and upper_limit > 0 and current_price >= upper_limit:
            return "상한가 근처/도달 상태로 매수 주문을 차단합니다."
        if action == "SELL" and lower_limit > 0 and current_price <= lower_limit:
            return "하한가 근처/도달 상태로 매도 주문을 차단합니다."

        return None

    def _plan_trade(
        self,
        rt: AutoLoopRuntime,
        action: str,
        market_price: int,
        cash_available: float | None = None,
        shares_owned: float | None = None,
    ) -> dict:
        confidence = float((rt.latest_decision or {}).get("confidence", 0.5))
        confidence_weight = max(0.35, min(1.25, confidence / max(0.01, rt.settings.min_confidence)))
        supervision_weight = self._supervision_multiplier(rt.settings.supervision_level)

        desired_step_pct = min(25.0, max(3.0, 8.0 * confidence_weight * supervision_weight))

        live_cash = max(0.0, float(cash_available or 0.0))
        live_shares = max(0.0, float(shares_owned or 0.0))

        # 모의/실전 공통 포지션 산출
        if rt.paper is not None:
            cash = rt.paper.cash
            shares = rt.paper.shares
            current_value = shares * market_price
            equity = max(1.0, cash + current_value)
            current_pos_pct = current_value / equity * 100.0
        else:
            current_value = live_shares * market_price
            equity = max(1.0, live_cash + current_value)
            current_pos_pct = current_value / equity * 100.0

        max_pos = max(1.0, min(100.0, rt.settings.max_position_pct))

        if action == "BUY":
            target_pct = min(max_pos, current_pos_pct + desired_step_pct)
            delta_pct = max(0.0, target_pct - current_pos_pct)
            if rt.paper is not None:
                equity = max(1.0, rt.paper.cash + rt.paper.shares * market_price)
                budget = equity * (delta_pct / 100.0)
                effective_price = market_price * (1 + (rt.settings.fee_bps + rt.settings.slippage_bps) / 10000.0)
                qty = int(max(0.0, min(rt.paper.cash / max(1.0, effective_price), budget / max(1.0, effective_price))))
            else:
                equity = max(1.0, live_cash + live_shares * market_price)
                budget = equity * (delta_pct / 100.0)
                effective_price = market_price * (1 + (rt.settings.fee_bps + rt.settings.slippage_bps) / 10000.0)
                by_budget = int(max(0.0, min(live_cash / max(1.0, effective_price), budget / max(1.0, effective_price))))
                by_qty = int(max(1, rt.settings.order_qty * confidence_weight * supervision_weight))
                qty = min(by_budget, by_qty) if by_budget > 0 else 0
            qty = normalize_share_qty(qty, lot_size=1)
            return {
                "side": "buy",
                "qty": max(0, qty),
                "reason": f"목표비중 {target_pct:.1f}% (현재 {current_pos_pct:.1f}%)",
            }

        target_pct = max(0.0, current_pos_pct - desired_step_pct)
        delta_pct = max(0.0, current_pos_pct - target_pct)
        if rt.paper is not None:
            shares_to_sell = int(rt.paper.shares * (delta_pct / 100.0))
            qty = max(0, min(int(rt.paper.shares), shares_to_sell if shares_to_sell > 0 else int(rt.settings.order_qty)))
        else:
            shares_to_sell = int(live_shares * (delta_pct / 100.0))
            qty = max(0, min(int(live_shares), shares_to_sell if shares_to_sell > 0 else int(rt.settings.order_qty)))
        qty = normalize_share_qty(qty, lot_size=1)
        return {
            "side": "sell",
            "qty": max(0, qty),
            "reason": f"목표비중 {target_pct:.1f}% (현재 {current_pos_pct:.1f}%)",
        }

    def _apply_paper_trade(self, rt: AutoLoopRuntime, side: str, qty: int, market_price: int, confidence: float, reason: str) -> None:
        if rt.paper is None:
            return

        qty = normalize_share_qty(qty, lot_size=1)
        if qty <= 0:
            rt.stats.skipped_cycles += 1
            self._append_log(rt, "info", "호가/수량 규칙 반영 후 주문 수량이 0이어서 보류합니다.")
            return

        current_session = get_krx_session()
        slippage_bps = rt.settings.slippage_bps * session_slippage_multiplier(current_session)
        raw_fill_price = market_price * (1 + slippage_bps / 10000.0) if side == "buy" else market_price * (1 - slippage_bps / 10000.0)
        fill_price = float(round_to_tick(raw_fill_price, direction="up" if side == "buy" else "down"))
        if fill_price <= 0:
            rt.stats.skipped_cycles += 1
            self._append_log(rt, "warn", "유효 체결가 계산 실패로 주문을 보류합니다.")
            return

        gross = qty * fill_price
        fee = gross * (rt.settings.fee_bps / 10000.0)
        tax = gross * (rt.settings.tax_bps / 10000.0) if side == "sell" else 0.0

        if side == "buy":
            total_cost = gross + fee
            if total_cost > rt.paper.cash + 1e-6:
                rt.stats.skipped_cycles += 1
                self._append_log(rt, "warn", "모의 매수 보류 · 현금 부족")
                return
            prev_shares = rt.paper.shares
            new_shares = prev_shares + qty
            if new_shares > 0:
                rt.paper.avg_buy_price = ((rt.paper.avg_buy_price * prev_shares) + gross) / new_shares
            rt.paper.shares = new_shares
            rt.paper.cash -= total_cost
        else:
            sell_qty = normalize_share_qty(min(int(rt.paper.shares), qty), lot_size=1)
            if sell_qty <= 0:
                rt.stats.skipped_cycles += 1
                self._append_log(rt, "warn", "모의 매도 보류 · 보유 수량 없음")
                return
            gross = sell_qty * fill_price
            fee = gross * (rt.settings.fee_bps / 10000.0)
            tax = gross * (rt.settings.tax_bps / 10000.0)
            net = gross - fee - tax
            cost_basis = sell_qty * rt.paper.avg_buy_price
            rt.paper.realized_pnl += net - cost_basis
            rt.paper.shares -= sell_qty
            if rt.paper.shares <= 0:
                rt.paper.shares = 0.0
                rt.paper.avg_buy_price = 0.0
            rt.paper.cash += net
            qty = sell_qty

        rt.paper.total_fees += fee
        rt.paper.total_taxes += tax
        rt.stats.simulated_trades += 1

        rec = AutoTradeRecord(
            timestamp=datetime.utcnow().isoformat(),
            ticker=rt.settings.ticker,
            side="buy" if side == "buy" else "sell",
            qty=qty,
            price=int(round(fill_price)),
            status="simulated",
            confidence=confidence,
            reason=f"모의 주문 · {reason} · 세션 {current_session.value} · 수수료 {rt.settings.fee_bps:.1f}bps",
        )
        rt.trade_history.insert(0, rec)
        rt.trade_history = rt.trade_history[:120]

        self._append_log(
            rt,
            "success",
            f"모의 {'매수' if side == 'buy' else '매도'} {qty}주 · 체결가 {int(round(fill_price)):,}원",
        )

    async def _execute_live_trade(self, rt: AutoLoopRuntime, side: str, qty: int, market_price: int, confidence: float, reason: str) -> None:
        from data.kis.trading import place_order

        live_qty = normalize_share_qty(qty, lot_size=1)
        if live_qty <= 0:
            rt.stats.skipped_cycles += 1
            self._append_log(rt, "info", "호가/수량 규칙 반영 후 실전 주문 수량이 0이어서 보류합니다.")
            return

        try:
            await place_order(
                ticker=rt.settings.ticker,
                side="buy" if side == "buy" else "sell",
                qty=int(max(1, live_qty)),
                price=0,
                order_type="01",
            )
            rt.stats.executed_trades += 1

            rec = AutoTradeRecord(
                timestamp=datetime.utcnow().isoformat(),
                ticker=rt.settings.ticker,
                side="buy" if side == "buy" else "sell",
                qty=int(max(1, live_qty)),
                price=market_price,
                status="executed",
                confidence=confidence,
                reason=f"실전 시장가 주문 · {reason} · 시세시각 {rt.latest_price_time or '-'}",
            )
            rt.trade_history.insert(0, rec)
            rt.trade_history = rt.trade_history[:120]
            self._append_log(rt, "success", f"실전 {'매수' if side == 'buy' else '매도'} 주문 요청 완료 · {live_qty}주")
        except Exception as e:
            rt.stats.failed_trades += 1
            rec = AutoTradeRecord(
                timestamp=datetime.utcnow().isoformat(),
                ticker=rt.settings.ticker,
                side="buy" if side == "buy" else "sell",
                qty=int(max(1, live_qty)),
                price=market_price,
                status="failed",
                confidence=confidence,
                reason=f"실전 주문 실패: {str(e)[:120]}",
            )
            rt.trade_history.insert(0, rec)
            rt.trade_history = rt.trade_history[:120]
            self._append_log(rt, "error", f"실전 주문 실패 · {str(e)[:160]}")

    def _append_log(self, rt: AutoLoopRuntime, level: Literal["info", "success", "warn", "error"], message: str) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        rt.logs.append(LoopLog(timestamp=stamp, level=level, message=message))
        rt.logs = rt.logs[-180:]

    def _serialize_runtime(self, rt: AutoLoopRuntime) -> dict:
        paper = rt.paper
        latest_price = max(0, int(rt.latest_price))
        if paper is not None:
            market_value = paper.shares * latest_price
            total_equity = paper.cash + market_value
            unrealized = (latest_price - paper.avg_buy_price) * paper.shares if paper.shares > 0 else 0.0
            position_pct = (market_value / total_equity * 100.0) if total_equity > 0 else 0.0
            paper_state = {
                "cash": round(paper.cash, 2),
                "shares": round(paper.shares, 4),
                "avg_buy_price": round(paper.avg_buy_price, 2),
                "market_value": round(market_value, 2),
                "total_equity": round(total_equity, 2),
                "realized_pnl": round(paper.realized_pnl, 2),
                "unrealized_pnl": round(unrealized, 2),
                "position_pct": round(position_pct, 2),
                "total_fees": round(paper.total_fees, 2),
                "total_taxes": round(paper.total_taxes, 2),
            }
        else:
            paper_state = None

        return {
            "loop_id": rt.loop_id,
            "owner_user_id": rt.settings.owner_user_id,
            "ticker": rt.settings.ticker,
            "running": rt.running,
            "cycle_running": rt.cycle_running,
            "created_at": rt.created_at,
            "started_at": rt.started_at,
            "stopped_at": rt.stopped_at,
            "last_run_at": rt.last_run_at,
            "next_run_at": rt.next_run_at,
            "settings": {
                "ticker": rt.settings.ticker,
                "interval_min": rt.settings.interval_min,
                "min_confidence": rt.settings.min_confidence,
                "order_qty": rt.settings.order_qty,
                "paper_trade": rt.settings.paper_trade,
                "fee_bps": rt.settings.fee_bps,
                "slippage_bps": rt.settings.slippage_bps,
                "tax_bps": rt.settings.tax_bps,
                "max_position_pct": rt.settings.max_position_pct,
                "supervision_level": rt.settings.supervision_level.value,
                "execution_session_mode": rt.settings.execution_session_mode.value,
                "initial_cash": rt.settings.initial_cash,
                "owner_user_id": rt.settings.owner_user_id,
            },
            "stats": {
                "cycle_count": rt.stats.cycle_count,
                "simulated_trades": rt.stats.simulated_trades,
                "executed_trades": rt.stats.executed_trades,
                "failed_trades": rt.stats.failed_trades,
                "skipped_cycles": rt.stats.skipped_cycles,
            },
            "latest_price": latest_price,
            "latest_price_time": rt.latest_price_time,
            "current_session": get_krx_session().value,
            "latest_decision": rt.latest_decision,
            "paper_account": paper_state,
            "decision_history": [
                {
                    "timestamp": d.timestamp,
                    "confidence": d.confidence,
                    "actionScore": d.actionScore,
                    "action": d.action,
                }
                for d in rt.decision_history[-80:]
            ],
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
                for t in rt.trade_history[:120]
            ],
            "logs": [
                {
                    "timestamp": l.timestamp,
                    "level": l.level,
                    "message": l.message,
                }
                for l in rt.logs[-180:]
            ],
        }


auto_trading_supervisor = AutoTradingSupervisor()

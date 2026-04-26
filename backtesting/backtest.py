"""
백테스팅 및 성과 평가 모듈
- FinanceDataReader로 한국 주식 히스토리컬 데이터
- vectorbt 기반 빠른 백테스트
- quantstats 기반 성과 리포트
"""
import sys
import os
import asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Callable, Awaitable, Optional
import pandas as pd
import numpy as np
import FinanceDataReader as fdr
from data.market.krx_rules import normalize_share_qty, round_to_tick
from data.market.market_meta import cap_price_to_limit, get_lot_size


@dataclass
class BacktestResult:
    ticker: str
    start_date: str
    end_date: str
    total_return: float        # 총 수익률 %
    annualized_return: float   # 연간 수익률 %
    sharpe_ratio: float        # 샤프 비율
    max_drawdown: float        # 최대 낙폭 %
    win_rate: float            # 승률 %
    total_trades: int          # 총 거래 수
    profit_factor: float       # 손익비
    calmar_ratio: float        # 칼마 비율
    benchmark_return: float    # 벤치마크(KOSPI) 수익률 %
    alpha: float               # 초과 수익
    trades: list = field(default_factory=list)
    equity_curve: list = field(default_factory=list)
    prediction_trace: list = field(default_factory=list)
    prediction_monitoring: dict = field(default_factory=dict)


def run_simple_backtest(
    ticker: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 10_000_000,  # 1천만원
    transaction_cost: float = 0.0028,     # 매수 수수료 0.015% + 매도 거래세 0.18% + 수수료
    decision_interval_days: int = 1,
) -> BacktestResult:
    """
    단순 이동평균 교차 전략 백테스트 (데모용)
    - 매수: MA5 > MA20 (골든크로스)
    - 매도: MA5 < MA20 (데드크로스)
    - 롱 온리 (공매도 없음)
    
    실제 AI 에이전트 시그널로 교체 예정
    """
    df = fdr.DataReader(ticker, start_date, end_date)
    if df.empty or "Close" not in df.columns:
        raise ValueError(f"데이터 없음: {ticker} ({start_date} ~ {end_date})")

    close = df["Close"].astype(float).dropna()
    if len(close) < 25:
        raise ValueError("데이터 부족 (25일 이상 필요)")

    # 이동평균 계산
    ma5 = close.rolling(5).mean()
    ma20 = close.rolling(20).mean()

    # 명시적 포트폴리오 시뮬레이션 (share-based)
    cash = float(initial_capital)
    shares = 0.0
    in_position = False
    current_signal = "HOLD"
    pending_signal: str | None = None
    entry_price = 0.0
    entry_date = None
    trades = []
    equity_values = []

    interval = max(1, int(decision_interval_days))

    for i in range(len(close)):
        price = float(close.iloc[i])
        date_idx = close.index[i]

        # 전일 시그널을 금일 체결 (1일 지연) -> 동일봉 미래정보 누수 방지
        if pending_signal is not None:
            executed_signal = current_signal
            if pending_signal == "BUY" and not in_position and cash > 0:
                _prev_close = float(close.iloc[i - 1]) if i > 0 else float(price)
                _raw_buy = price * (1 + transaction_cost / 2)
                buy_price = float(round_to_tick(cap_price_to_limit(_raw_buy, _prev_close), direction="up"))
                buy_qty = normalize_share_qty(cash / max(1.0, buy_price), lot_size=get_lot_size(ticker))
                if buy_qty > 0:
                    shares = float(buy_qty)
                    cash -= buy_qty * buy_price
                    in_position = True
                    entry_price = buy_price
                    entry_date = date_idx
                    executed_signal = "BUY"
            elif pending_signal in ("SELL", "HOLD") and in_position and shares > 0:
                sell_qty = normalize_share_qty(shares, lot_size=get_lot_size(ticker))
                if sell_qty > 0:
                    _prev_close = float(close.iloc[i - 1]) if i > 0 else float(price)
                    _raw_sell = price * (1 - transaction_cost / 2)
                    sell_price = float(round_to_tick(cap_price_to_limit(_raw_sell, _prev_close), direction="down"))
                    proceeds = sell_qty * sell_price
                    ret_pct = (sell_price / entry_price - 1) * 100
                    trades.append({
                        "entry_date": str(entry_date.date()) if entry_date is not None else str(date_idx.date()),
                        "exit_date": str(date_idx.date()),
                        "entry_price": round(entry_price, 0),
                        "exit_price": round(sell_price, 0),
                        "return_pct": round(ret_pct, 2),
                        "result": "WIN" if ret_pct > 0 else "LOSS",
                    })
                    cash += proceeds
                    shares = max(0.0, shares - sell_qty)
                    in_position = shares > 0
                    executed_signal = pending_signal

            current_signal = executed_signal
            pending_signal = None

        # MA 계산 전 구간 건너뜀
        if pd.isna(ma5.iloc[i]) or pd.isna(ma20.iloc[i]):
            equity_values.append(cash + shares * price)
            continue

        # 판단 주기: 지정된 거래일 간격마다만 신호 판단
        if i % interval == 0:
            desired_signal = "BUY" if float(ma5.iloc[i]) > float(ma20.iloc[i]) else "SELL"
            if desired_signal != current_signal:
                pending_signal = desired_signal

        portfolio_value = cash + shares * price
        equity_values.append(portfolio_value)

    equity = pd.Series(equity_values, index=close.index[-len(equity_values):])

    # 벤치마크 (KOSPI)
    try:
        kospi = fdr.DataReader("KS11", start_date, end_date)["Close"].astype(float).dropna()
        bm_return = (float(kospi.iloc[-1]) / float(kospi.iloc[0]) - 1) * 100
    except Exception:
        bm_return = 0.0

    metrics = _compute_metrics(equity, trades, initial_capital, start_date, end_date, bm_return)

    return BacktestResult(
        ticker=ticker,
        start_date=start_date,
        end_date=end_date,
        **metrics,
        trades=trades[-20:],
        equity_curve=[
            {"date": str(equity.index[i].date()), "value": round(float(equity.iloc[i]), 0)}
            for i in range(0, len(equity), max(1, len(equity) // 100))  # 최대 100포인트
        ],
    )


def format_result_summary(result: BacktestResult) -> str:
    return f"""
📊 백테스트 결과: {result.ticker} ({result.start_date} ~ {result.end_date})
{'='*50}
💰 총 수익률:      {result.total_return:+.2f}%
📈 연간 수익률:    {result.annualized_return:+.2f}%
🏦 벤치마크(KOSPI): {result.benchmark_return:+.2f}%
⚡ 초과 수익(알파): {result.alpha:+.2f}%
{'='*50}
📐 샤프 비율:      {result.sharpe_ratio:.2f}
📉 최대 낙폭:      {result.max_drawdown:.2f}%
🎯 칼마 비율:      {result.calmar_ratio:.2f}
🎲 승률:          {result.win_rate:.1f}%
💎 손익비:        {result.profit_factor:.2f}
🔢 총 거래 수:    {result.total_trades}회
"""


# ── 성과 지표 공통 계산 ────────────────────────────────────────────
def _compute_metrics(
    equity: pd.Series,
    trades: list,
    initial_capital: float,
    start_date: str,
    end_date: str,
    bm_return: float = 0.0,
) -> dict:
    total_days = (
        datetime.strptime(end_date, "%Y-%m-%d") - datetime.strptime(start_date, "%Y-%m-%d")
    ).days
    years = max(total_days / 365, 0.01)

    final_equity = float(equity.iloc[-1])
    total_return = (final_equity / initial_capital - 1) * 100
    annualized_return = ((final_equity / initial_capital) ** (1 / years) - 1) * 100

    daily_returns = equity.pct_change().dropna()
    risk_free = 0.035
    excess_returns = daily_returns - risk_free / 252
    sharpe = (
        float(excess_returns.mean() / excess_returns.std() * np.sqrt(252))
        if float(excess_returns.std()) > 0 else 0.0
    )

    rolling_max = equity.cummax()
    drawdown = (equity - rolling_max) / rolling_max * 100
    max_dd = float(drawdown.min())

    calmar = annualized_return / abs(max_dd) if max_dd != 0 else 0.0

    wins = [t for t in trades if t["result"] == "WIN"]
    losses = [t for t in trades if t["result"] == "LOSS"]
    win_rate = len(wins) / len(trades) * 100 if trades else 0.0

    avg_win = float(np.mean([t["return_pct"] for t in wins])) if wins else 0.0
    avg_loss = abs(float(np.mean([t["return_pct"] for t in losses]))) if losses else 0.001
    profit_factor = avg_win / avg_loss if avg_loss > 0 else 0.0

    return dict(
        total_return=round(total_return, 2),
        annualized_return=round(annualized_return, 2),
        sharpe_ratio=round(sharpe, 2),
        max_drawdown=round(max_dd, 2),
        win_rate=round(win_rate, 2),
        total_trades=len(trades),
        profit_factor=round(profit_factor, 2),
        calmar_ratio=round(calmar, 2),
        benchmark_return=round(bm_return, 2),
        alpha=round(total_return - bm_return, 2),
    )


async def run_agent_backtest(
    ticker: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 10_000_000,
    transaction_cost: float = 0.0028,
    decision_interval_days: int = 20,
    session_id: str | None = None,
    on_progress: Callable[[str, int, int], Awaitable[None]] | None = None,
    cancel_check: Callable[[], None] | None = None,
) -> BacktestResult:
    """
    AI 에이전트(기술적 분석) 기반 백테스트.

    전략:
    - N 거래일마다 리밸런싱 (판단 주기 설정 가능)
    - 해당 날짜까지의 데이터만 기술 지표 계산 (look-ahead 없음)
    - gpt-5.4-mini로 BUY/SELL/HOLD 시그널 판단
    - 시그널 변경 시 다음 거래일 종가 기준 체결 (1일 지연)
    - 롱 온리 (공매도 없음)
    """
    from agents.analyst.analysts import get_signal_for_backtest
    from data.market.fetcher import get_technical_indicators
    from backend.core.events import emit_thought, AgentThought, AgentRole, AgentStatus

    # ── 가격 데이터 로드 ───────────────────────────────────────────
    # 지표 계산에 필요한 120일 워밍업 데이터를 포함해서 로드
    warmup_start = (
        datetime.strptime(start_date, "%Y-%m-%d") - timedelta(days=180)
    ).strftime("%Y-%m-%d")

    df_full = fdr.DataReader(ticker, warmup_start, end_date)
    if df_full.empty or "Close" not in df_full.columns:
        raise ValueError(f"데이터 없음: {ticker}")

    # 실제 시뮬레이션 구간만 추출
    df = df_full[df_full.index >= start_date]
    close = df["Close"].astype(float).dropna()
    if len(close) < 5:
        raise ValueError("시뮬레이션 기간 데이터 부족 (5일 이상 필요)")

    # ── 판단 주기 기반 리밸런싱 날짜 생성 ──────────────────────────
    interval = max(1, int(decision_interval_days))
    all_dates = [str(idx.date()) for idx in close.index]
    rebalance_dates = [all_dates[i] for i in range(0, len(all_dates), interval)]
    if all_dates and rebalance_dates[-1] != all_dates[-1]:
        rebalance_dates.append(all_dates[-1])

    total_steps = len(rebalance_dates)

    # ── 포트폴리오 시뮬레이션 ──────────────────────────────────────
    cash = float(initial_capital)
    shares = 0.0
    current_signal = "HOLD"
    pending_signal: str | None = None  # 다음 거래일에 체결할 시그널
    entry_price = 0.0
    entry_date = None
    trades: list[dict] = []
    equity_values: list[float] = []
    prediction_trace: list[dict] = []
    pending_prediction_evals: list[dict] = []

    rebalance_set = set(rebalance_dates)
    step = 0

    for i, (dt, price_val) in enumerate(zip(close.index, close)):
        if cancel_check is not None:
            cancel_check()
        price = float(price_val)
        date_str = str(dt.date())

        # 전일 pending 시그널 체결 (1일 지연)
        if pending_signal is not None:
            new_sig = pending_signal
            pending_signal = None
            executed_signal = current_signal

            if new_sig == "BUY" and current_signal != "BUY" and cash > 0:
                _prev_close = float(close.iloc[i - 1]) if i > 0 else float(price)
                buy_price = float(round_to_tick(cap_price_to_limit(price * (1 + transaction_cost / 2), _prev_close), direction="up"))
                buy_qty = normalize_share_qty(cash / max(1.0, buy_price), lot_size=get_lot_size(ticker))
                if buy_qty > 0:
                    shares = float(buy_qty)
                    cash -= buy_qty * buy_price
                    entry_price = buy_price
                    entry_date = dt
                    executed_signal = "BUY"

            elif new_sig in ("SELL", "HOLD") and current_signal == "BUY" and shares > 0:
                sell_qty = normalize_share_qty(shares, lot_size=get_lot_size(ticker))
                if sell_qty > 0:
                    _prev_close = float(close.iloc[i - 1]) if i > 0 else float(price)
                    sell_price = float(round_to_tick(cap_price_to_limit(price * (1 - transaction_cost / 2), _prev_close), direction="down"))
                    ret_pct = (sell_price / entry_price - 1) * 100
                    trades.append({
                        "entry_date": str(entry_date.date()) if entry_date else date_str,
                        "exit_date": date_str,
                        "entry_price": round(entry_price, 0),
                        "exit_price": round(sell_price, 0),
                        "return_pct": round(ret_pct, 2),
                        "result": "WIN" if ret_pct > 0 else "LOSS",
                        "signal": new_sig,
                    })
                    cash += sell_qty * sell_price
                    shares = max(0.0, shares - sell_qty)
                    executed_signal = new_sig

            current_signal = executed_signal

        # 이미 생성된 예측은 평가 시점 도달 후에만 채점 (future price 선참조 금지)
        if pending_prediction_evals:
            remain_pending: list[dict] = []
            for pending in pending_prediction_evals:
                if pending["eval_date"] != date_str:
                    remain_pending.append(pending)
                    continue

                trace_idx = pending["trace_index"]
                base_price = float(pending["base_price"])
                predicted_signal = str(pending["signal"])
                actual_return_pct = (price / base_price - 1) * 100 if base_price else 0.0

                if predicted_signal == "BUY":
                    hit = actual_return_pct > 0
                elif predicted_signal == "SELL":
                    hit = actual_return_pct < 0
                else:
                    hit = abs(actual_return_pct) <= 1.0

                prediction_trace[trace_idx]["actual_price"] = round(price, 2)
                prediction_trace[trace_idx]["actual_return_pct"] = round(actual_return_pct, 2)
                prediction_trace[trace_idx]["hit"] = bool(hit)

            pending_prediction_evals = remain_pending

        # 리밸런싱 날짜: AI 시그널 조회 → 다음 거래일 pending
        if date_str in rebalance_set:
            step += 1
            try:
                indicators = get_technical_indicators(ticker, as_of_date=date_str, days=120)
                sig_result = await get_signal_for_backtest(ticker, indicators)
                new_signal = sig_result["signal"]
                confidence = sig_result.get("confidence", 0.5)
                reason = sig_result.get("reason", "")
            except Exception as e:
                new_signal = current_signal
                confidence = 0.5
                reason = f"오류: {str(e)[:40]}"

            try:
                confidence_val = max(0.0, min(float(confidence), 1.0))
            except (TypeError, ValueError):
                confidence_val = 0.5

            # 백테스트 리밸런싱 단위에서 예측 vs 실제를 기록해 모니터링에 활용
            eval_date = rebalance_dates[step] if step < total_steps else str(close.index[-1].date())

            direction = 1 if new_signal == "BUY" else -1 if new_signal == "SELL" else 0
            predicted_return_pct = direction * max(0.5, confidence_val * 4.0)
            predicted_price = price * (1 + predicted_return_pct / 100)
            prediction_trace.append({
                "prediction_date": date_str,
                "eval_date": eval_date,
                "signal": new_signal,
                "confidence": round(confidence_val, 3),
                "price_at_prediction": round(price, 2),
                "predicted_price": round(predicted_price, 2),
                "actual_price": round(price, 2),
                "predicted_return_pct": round(predicted_return_pct, 2),
                "actual_return_pct": 0.0,
                "hit": False,
            })
            pending_prediction_evals.append({
                "trace_index": len(prediction_trace) - 1,
                "eval_date": eval_date,
                "base_price": price,
                "signal": new_signal,
            })

            # 진행 상황 SSE emit
            if session_id:
                emoji = "🟢" if new_signal == "BUY" else "🔴" if new_signal == "SELL" else "⚪"
                await emit_thought(session_id, AgentThought(
                    agent_id="backtest_agent",
                    role=AgentRole.TECHNICAL_ANALYST,
                    status=AgentStatus.ANALYZING,
                    content=f"{emoji} [{date_str}] {new_signal} (신뢰도 {confidence:.0%}) — {reason}",
                    metadata={
                        "date": date_str,
                        "signal": new_signal,
                        "confidence": confidence_val,
                        "step": step,
                        "total": total_steps,
                    },
                ))

            if on_progress:
                await on_progress(date_str, step, total_steps)

            if new_signal != current_signal:
                pending_signal = new_signal

        equity_values.append(cash + shares * price)

    # 마지막 날 포지션 강제 청산
    if shares > 0:
        price = float(close.iloc[-1])
        sell_qty = normalize_share_qty(shares, lot_size=get_lot_size(ticker))
        if sell_qty > 0:
            _prev_close = float(close.iloc[-2]) if len(close) > 1 else float(price)
            sell_price = float(round_to_tick(cap_price_to_limit(price * (1 - transaction_cost / 2), _prev_close), direction="down"))
            ret_pct = (sell_price / entry_price - 1) * 100
            trades.append({
                "entry_date": str(entry_date.date()) if entry_date else end_date,
                "exit_date": end_date,
                "entry_price": round(entry_price, 0),
                "exit_price": round(sell_price, 0),
                "return_pct": round(ret_pct, 2),
                "result": "WIN" if ret_pct > 0 else "LOSS",
                "signal": "FORCED_CLOSE",
            })
            cash += sell_qty * sell_price
            shares = max(0.0, shares - sell_qty)

    # 마지막 평가일을 넘기지 못한 예측은 종료일 가격으로 사후 평가
    if pending_prediction_evals:
        final_price = float(close.iloc[-1])
        final_date = str(close.index[-1].date())
        for pending in pending_prediction_evals:
            trace_idx = pending["trace_index"]
            base_price = float(pending["base_price"])
            predicted_signal = str(pending["signal"])
            actual_return_pct = (final_price / base_price - 1) * 100 if base_price else 0.0

            if predicted_signal == "BUY":
                hit = actual_return_pct > 0
            elif predicted_signal == "SELL":
                hit = actual_return_pct < 0
            else:
                hit = abs(actual_return_pct) <= 1.0

            prediction_trace[trace_idx]["eval_date"] = final_date
            prediction_trace[trace_idx]["actual_price"] = round(final_price, 2)
            prediction_trace[trace_idx]["actual_return_pct"] = round(actual_return_pct, 2)
            prediction_trace[trace_idx]["hit"] = bool(hit)

    equity = pd.Series(equity_values, index=close.index[-len(equity_values):])

    # 벤치마크 (KOSPI)
    try:
        kospi = fdr.DataReader("KS11", start_date, end_date)["Close"].astype(float).dropna()
        bm_return = (float(kospi.iloc[-1]) / float(kospi.iloc[0]) - 1) * 100
    except Exception:
        bm_return = 0.0

    metrics = _compute_metrics(equity, trades, initial_capital, start_date, end_date, bm_return)

    prediction_monitoring = {
        "prediction_count": 0,
        "hit_rate": 0.0,
        "avg_predicted_return_pct": 0.0,
        "avg_actual_return_pct": 0.0,
        "avg_abs_error_pct": 0.0,
    }
    if prediction_trace:
        prediction_count = len(prediction_trace)
        hit_rate = sum(1 for p in prediction_trace if p.get("hit")) / prediction_count * 100
        avg_pred = float(np.mean([p["predicted_return_pct"] for p in prediction_trace]))
        avg_actual = float(np.mean([p["actual_return_pct"] for p in prediction_trace]))
        avg_abs_error = float(np.mean([
            abs(p["predicted_return_pct"] - p["actual_return_pct"])
            for p in prediction_trace
        ]))
        prediction_monitoring = {
            "prediction_count": prediction_count,
            "hit_rate": round(hit_rate, 2),
            "avg_predicted_return_pct": round(avg_pred, 2),
            "avg_actual_return_pct": round(avg_actual, 2),
            "avg_abs_error_pct": round(avg_abs_error, 2),
        }

    return BacktestResult(
        ticker=ticker,
        start_date=start_date,
        end_date=end_date,
        **metrics,
        trades=trades[-20:],
        equity_curve=[
            {"date": str(equity.index[i].date()), "value": round(float(equity.iloc[i]), 0)}
            for i in range(0, len(equity), max(1, len(equity) // 100))
        ],
        prediction_trace=prediction_trace,
        prediction_monitoring=prediction_monitoring,
    )

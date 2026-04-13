"""
백테스팅 및 성과 평가 모듈
- FinanceDataReader로 한국 주식 히스토리컬 데이터
- vectorbt 기반 빠른 백테스트
- quantstats 기반 성과 리포트
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional
import pandas as pd
import numpy as np
import FinanceDataReader as fdr


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


def run_simple_backtest(
    ticker: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 10_000_000,  # 1천만원
    transaction_cost: float = 0.0028,     # 매수 수수료 0.015% + 매도 거래세 0.18% + 수수료
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
    entry_price = 0.0
    entry_date = None
    trades = []
    equity_values = []

    for i in range(len(close)):
        price = float(close.iloc[i])
        # MA 계산 전 구간 건너뜀
        if pd.isna(ma5.iloc[i]) or pd.isna(ma20.iloc[i]):
            equity_values.append(cash + shares * price)
            continue

        golden_cross = float(ma5.iloc[i]) > float(ma20.iloc[i])

        if golden_cross and not in_position and cash > 0:
            # 매수
            buy_price = price * (1 + transaction_cost / 2)
            shares = cash / buy_price
            cash = 0.0
            in_position = True
            entry_price = price
            entry_date = close.index[i]

        elif not golden_cross and in_position and shares > 0:
            # 매도
            sell_price = price * (1 - transaction_cost / 2)
            proceeds = shares * sell_price
            ret_pct = (sell_price / entry_price - 1) * 100
            trades.append({
                "entry_date": str(entry_date.date()),
                "exit_date": str(close.index[i].date()),
                "entry_price": round(entry_price, 0),
                "exit_price": round(price, 0),
                "return_pct": round(ret_pct, 2),
                "result": "WIN" if ret_pct > 0 else "LOSS",
            })
            cash = proceeds
            shares = 0.0
            in_position = False

        portfolio_value = cash + shares * price
        equity_values.append(portfolio_value)

    equity = pd.Series(equity_values, index=close.index[-len(equity_values):])

    # 벤치마크 (KOSPI)
    try:
        kospi = fdr.DataReader("KS11", start_date, end_date)["Close"].astype(float).dropna()
        bm_return = (float(kospi.iloc[-1]) / float(kospi.iloc[0]) - 1) * 100
    except Exception:
        bm_return = 0.0

    # 성과 지표 계산
    total_days = (datetime.strptime(end_date, "%Y-%m-%d") - datetime.strptime(start_date, "%Y-%m-%d")).days
    years = max(total_days / 365, 0.01)

    final_equity = float(equity.iloc[-1])
    total_return = (final_equity / initial_capital - 1) * 100
    annualized_return = ((final_equity / initial_capital) ** (1 / years) - 1) * 100

    # 일별 수익률 (로그 수익률 기반)
    daily_returns = equity.pct_change().dropna()
    risk_free = 0.035
    excess_returns = daily_returns - risk_free / 252
    sharpe = float(excess_returns.mean() / excess_returns.std() * np.sqrt(252)) if float(excess_returns.std()) > 0 else 0.0

    # 최대 낙폭
    rolling_max = equity.cummax()
    drawdown = (equity - rolling_max) / rolling_max * 100
    max_dd = float(drawdown.min())

    # 칼마 비율
    calmar = annualized_return / abs(max_dd) if max_dd != 0 else 0

    wins = [t for t in trades if t["result"] == "WIN"]
    losses = [t for t in trades if t["result"] == "LOSS"]
    win_rate = len(wins) / len(trades) * 100 if trades else 0

    avg_win = float(np.mean([t["return_pct"] for t in wins])) if wins else 0.0
    avg_loss = abs(float(np.mean([t["return_pct"] for t in losses]))) if losses else 0.001
    profit_factor = avg_win / avg_loss if avg_loss > 0 else 0

    return BacktestResult(
        ticker=ticker,
        start_date=start_date,
        end_date=end_date,
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

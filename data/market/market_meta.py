"""
KRX 시장 메타 헬퍼 — 가격 제한폭, lot_size, VI 인지, 결제일.

본 모듈은 외부 API 의존 없이 안전한 기본값을 제공한다.
실시간 정확도가 필요한 항목은 KIS/KRX 마스터 데이터로 보강할 것.
"""
from __future__ import annotations

from datetime import date
from typing import Any


# ─────────────────────────────────────────────────────────
# Critical M2 — 가격 제한폭 (±30% 일반 종목 기준)
# ─────────────────────────────────────────────────────────
DEFAULT_PRICE_LIMIT_PCT = 0.30  # 30%


def price_limit_band(prev_close: float, limit_pct: float = DEFAULT_PRICE_LIMIT_PCT) -> tuple[float, float]:
    """전일 종가 기준 상하한가 반환."""
    if prev_close <= 0:
        return 0.0, 0.0
    upper = prev_close * (1 + limit_pct)
    lower = prev_close * (1 - limit_pct)
    return lower, upper


def cap_price_to_limit(
    price: float,
    prev_close: float,
    limit_pct: float = DEFAULT_PRICE_LIMIT_PCT,
) -> float:
    """주문 가격이 가격제한폭을 초과하면 한계 안으로 캡."""
    if prev_close <= 0:
        return float(price)
    lower, upper = price_limit_band(prev_close, limit_pct)
    return float(min(max(price, lower), upper))


# ─────────────────────────────────────────────────────────
# Critical M6 — 종목별 매매 단위(lot_size)
# ─────────────────────────────────────────────────────────
# 한국 일반 주식(코스피·코스닥)은 1주 단위. ETF/ETN/리츠 등도 동일.
# 향후 KIS 종목 마스터에서 동적으로 채울 수 있도록 hook 분리.
_LOT_SIZE_OVERRIDES: dict[str, int] = {}


def get_lot_size(ticker: str) -> int:
    """티커별 매매 단위. 기본 1, override 가능."""
    t = (ticker or "").strip()
    if not t:
        return 1
    return int(_LOT_SIZE_OVERRIDES.get(t, 1))


def register_lot_size_override(ticker: str, lot_size: int) -> None:
    t = (ticker or "").strip()
    if t and lot_size >= 1:
        _LOT_SIZE_OVERRIDES[t] = int(lot_size)


# ─────────────────────────────────────────────────────────
# Critical M1 — VI (Volatility Interruption) 상태 감지
# ─────────────────────────────────────────────────────────
# KIS 현재가 응답에서 VI 관련 필드를 검사.
# - vi_cls_code: " "/"0" = 미발동, 그 외 = 발동
# - bstp_kor_isnm 또는 별도 필드는 종목별로 상이
# 보수적으로 vi_cls_code 가 비어있지 않거나 공백/'0' 이외이면 발동으로 간주.

_VI_FIELD_KEYS = ("vi_cls_code", "vi_clss_code", "vi_status", "vi_yn")


def is_vi_engaged(quote: Any) -> bool:
    """KIS 현재가 응답 dict 또는 임의 dict에서 VI 발동 여부 감지."""
    if not isinstance(quote, dict):
        return False
    for k in _VI_FIELD_KEYS:
        v = str(quote.get(k, "") or "").strip()
        if not v:
            continue
        if v in {"0", "00", "N", "n", " "}:
            continue
        # "1", "Y", "01" 등 모두 발동으로 간주
        return True
    return False


# ─────────────────────────────────────────────────────────
# Critical M4 — T+2 결제 모델 (PaperPortfolio에서 사용)
# ─────────────────────────────────────────────────────────
def settlement_trade_date(trade_date: date, days: int = 2) -> date:
    """매매일 기준 T+N 결제일(거래일 기준) 반환.

    krx_holidays.is_trading_day 활용.
    """
    from data.market.krx_holidays import is_trading_day, next_trading_day

    cur = trade_date
    advanced = 0
    while advanced < days:
        cur = next_trading_day(cur)
        if is_trading_day(cur):
            advanced += 1
    return cur


# ─────────────────────────────────────────────────────────
# Critical M5 — 부분체결 모델
# ─────────────────────────────────────────────────────────
def simulate_partial_fill(
    requested_qty: int,
    *,
    available_volume: int | None = None,
    enable: bool = False,
    min_ratio: float = 0.7,
) -> int:
    """부분체결 수량 시뮬레이션.

    - enable=False → 요청 수량 그대로 반환 (기본값)
    - available_volume 이 주어지면 min(requested, available)
    - 그 외 enable=True 면 min_ratio ~ 1.0 사이 비율로 체결
    """
    rq = max(0, int(requested_qty))
    if rq == 0:
        return 0
    if available_volume is not None:
        return int(min(rq, max(0, int(available_volume))))
    if not enable:
        return rq
    import random
    ratio = max(0.0, min(1.0, random.uniform(min_ratio, 1.0)))
    return max(1, int(rq * ratio))

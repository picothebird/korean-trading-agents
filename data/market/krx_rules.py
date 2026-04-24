"""
KRX cash equity market rules used by backtest and execution models.
"""

from __future__ import annotations

import math
from datetime import datetime, time
from enum import Enum
from zoneinfo import ZoneInfo


KST = ZoneInfo("Asia/Seoul")


class KrxSession(str, Enum):
    PRE_OPEN = "pre_open"
    REGULAR = "regular"
    AFTER_CLOSE = "after_close"
    SINGLE_PRICE = "single_price"
    CLOSED = "closed"


def get_tick_size(price: float) -> int:
    p = max(0.0, float(price))
    if p < 2_000:
        return 1
    if p < 5_000:
        return 5
    if p < 20_000:
        return 10
    if p < 50_000:
        return 50
    if p < 200_000:
        return 100
    if p < 500_000:
        return 500
    return 1_000


def round_to_tick(price: float, direction: str = "nearest") -> int:
    p = max(0.0, float(price))
    tick = get_tick_size(p)
    if direction == "up":
        return int(math.ceil(p / tick) * tick)
    if direction == "down":
        return int(math.floor(p / tick) * tick)
    return int(round(p / tick) * tick)


def normalize_share_qty(qty: float, lot_size: int = 1) -> int:
    lot = max(1, int(lot_size))
    raw = max(0, int(math.floor(float(qty))))
    return (raw // lot) * lot


def get_krx_session(now_kst: datetime | None = None) -> KrxSession:
    dt = now_kst or datetime.now(tz=KST)
    if dt.weekday() >= 5:
        return KrxSession.CLOSED

    t = dt.time()
    if time(8, 30) <= t < time(8, 40):
        return KrxSession.PRE_OPEN
    if time(9, 0) <= t <= time(15, 30):
        return KrxSession.REGULAR
    if time(15, 40) <= t < time(16, 0):
        return KrxSession.AFTER_CLOSE
    if time(16, 0) <= t <= time(18, 0):
        return KrxSession.SINGLE_PRICE
    return KrxSession.CLOSED


def is_tradable_session(session: KrxSession, include_after_hours: bool = False) -> bool:
    if session == KrxSession.REGULAR:
        return True
    if include_after_hours and session in (KrxSession.PRE_OPEN, KrxSession.AFTER_CLOSE, KrxSession.SINGLE_PRICE):
        return True
    return False


def session_slippage_multiplier(session: KrxSession) -> float:
    if session == KrxSession.REGULAR:
        return 1.0
    if session == KrxSession.PRE_OPEN:
        return 1.25
    if session == KrxSession.AFTER_CLOSE:
        return 1.4
    if session == KrxSession.SINGLE_PRICE:
        return 1.7
    return 1.0

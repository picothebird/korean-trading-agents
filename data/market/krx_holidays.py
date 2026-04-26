"""
KRX(한국거래소) 휴장일 / 반일장 / 정규장 시간 유틸.

- `is_trading_day(date)`: 주말 + 휴장일 제외
- `regular_session(date)`: 해당 거래일의 정규장 시작/종료 시각 (반일장 자동 반영)
- `next_trading_day(date)`: 다음 거래일

휴장일 데이터는 2025-01-01 ~ 2030-12-31 범위. 매년 KRX 공식 캘린더가 발표되면
`_HOLIDAYS` 딕셔너리에 추가하면 된다.
반일장(연말 마지막 거래일 등)은 `_HALF_SESSION_DATES` 에 별도로 명시한다.

NOTE: 임시공휴일/대선·총선일은 발표 시점에 추가 등록 필요. 누락되면 보수적으로
정상 거래일로 가정되므로 운영팀이 매년 12월에 갱신 절차를 가진다.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")

# YYYY-MM-DD 문자열로 보관 (date 비교 시 isoformat 사용)
_HOLIDAYS: set[str] = {
    # ── 2025 ──
    "2025-01-01",  # 신정
    "2025-01-28",  # 설 연휴 (대체)
    "2025-01-29",  # 설날
    "2025-01-30",  # 설 연휴
    "2025-03-03",  # 삼일절 대체
    "2025-05-05",  # 어린이날 / 부처님오신날
    "2025-05-06",  # 대체공휴일
    "2025-06-06",  # 현충일
    "2025-08-15",  # 광복절
    "2025-10-03",  # 개천절
    "2025-10-06",  # 추석 연휴
    "2025-10-07",  # 추석
    "2025-10-08",  # 추석 연휴
    "2025-10-09",  # 한글날
    "2025-12-25",  # 성탄절
    "2025-12-31",  # 연말 휴장
    # ── 2026 ──
    "2026-01-01",
    "2026-02-16",  # 설 연휴
    "2026-02-17",  # 설날
    "2026-02-18",  # 설 연휴
    "2026-03-02",  # 삼일절 대체
    "2026-05-05",
    "2026-05-25",  # 부처님오신날
    "2026-06-03",  # 지방선거
    "2026-08-17",  # 광복절 대체
    "2026-09-24",  # 추석 연휴
    "2026-09-25",  # 추석
    "2026-09-26",  # 추석 연휴 (토요일)
    "2026-10-05",  # 개천절 대체
    "2026-10-09",
    "2026-12-25",
    "2026-12-31",
    # ── 2027 ──
    "2027-01-01",
    "2027-02-08",
    "2027-02-09",
    "2027-03-01",
    "2027-05-05",
    "2027-05-13",  # 부처님오신날
    "2027-06-07",  # 현충일 대체
    "2027-08-16",  # 광복절 대체
    "2027-09-14",
    "2027-09-15",
    "2027-09-16",
    "2027-10-04",  # 개천절 대체
    "2027-10-11",  # 한글날 대체
    "2027-12-31",
    # ── 2028 ──
    "2028-01-03",  # 신정 대체
    "2028-01-26",
    "2028-01-27",
    "2028-01-28",
    "2028-03-01",
    "2028-05-02",  # 부처님오신날
    "2028-05-05",
    "2028-06-06",
    "2028-08-15",
    "2028-10-02",  # 개천절 대체
    "2028-10-03",
    "2028-10-04",  # 추석 연휴
    "2028-10-09",
    "2028-12-25",
    "2028-12-29",  # 연말 휴장
    # ── 2029 ──
    "2029-01-01",
    "2029-02-12",
    "2029-02-13",
    "2029-02-14",
    "2029-03-01",
    "2029-05-07",  # 어린이날 대체
    "2029-05-21",  # 부처님오신날
    "2029-06-06",
    "2029-08-15",
    "2029-09-21",
    "2029-09-22",
    "2029-09-23",
    "2029-10-03",
    "2029-10-09",
    "2029-12-25",
    "2029-12-31",
    # ── 2030 ──
    "2030-01-01",
    "2030-02-04",
    "2030-02-05",
    "2030-02-06",
    "2030-03-01",
    "2030-05-06",  # 어린이날 대체
    "2030-05-09",  # 부처님오신날
    "2030-06-06",
    "2030-08-15",
    "2030-09-11",
    "2030-09-12",
    "2030-09-13",
    "2030-10-03",
    "2030-10-09",
    "2030-12-25",
    "2030-12-31",
}

# 반일장: 정규장 종료를 14:00 KST로 단축 (연말 마지막 거래일 등)
# 일반적으로 KRX는 12월 30일/31일 중 하나를 휴장, 직전 거래일을 14:00 종료한다.
# 보수적으로 반일장 후보 일자만 등록하고 휴장 우선 적용한다.
_HALF_SESSION_DATES: set[str] = set()


@dataclass(frozen=True)
class Session:
    open_at: datetime
    close_at: datetime
    is_half_day: bool


def is_holiday(d: date) -> bool:
    return d.isoformat() in _HOLIDAYS


def is_weekend(d: date) -> bool:
    return d.weekday() >= 5  # 5=Sat, 6=Sun


def is_trading_day(d: date) -> bool:
    return not (is_weekend(d) or is_holiday(d))


def next_trading_day(d: date) -> date:
    nxt = d + timedelta(days=1)
    while not is_trading_day(nxt):
        nxt = nxt + timedelta(days=1)
    return nxt


def previous_trading_day(d: date) -> date:
    prev = d - timedelta(days=1)
    while not is_trading_day(prev):
        prev = prev - timedelta(days=1)
    return prev


def regular_session(d: date) -> Session | None:
    """해당 일의 정규장 세션. 비거래일이면 None."""
    if not is_trading_day(d):
        return None
    open_at = datetime.combine(d, time(9, 0), tzinfo=KST)
    is_half = d.isoformat() in _HALF_SESSION_DATES
    close_at = datetime.combine(
        d,
        time(14, 0) if is_half else time(15, 30),
        tzinfo=KST,
    )
    return Session(open_at=open_at, close_at=close_at, is_half_day=is_half)


def now_kst() -> datetime:
    return datetime.now(tz=KST)


def is_regular_session_open(now: datetime | None = None) -> bool:
    """현재 시각이 정규장 중인지."""
    n = (now.astimezone(KST) if now else now_kst())
    sess = regular_session(n.date())
    if sess is None:
        return False
    return sess.open_at <= n <= sess.close_at


def settlement_date(trade_date: date, days: int = 2) -> date:
    """T+N 결제일. 영업일 기준."""
    cur = trade_date
    for _ in range(days):
        cur = next_trading_day(cur)
    return cur

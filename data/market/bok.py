"""한국은행 ECOS Open API 클라이언트.

ECOS (Economic Statistics System) 는 한국은행이 무료로 제공하는 거시·금융·시장 통계 API.
이 모듈은 거시경제 분석가와 수급 분석에 필요한 핵심 시리즈를 fetch 한다.

API 문서: https://ecos.bok.or.kr/api/

URL 포맷:
    https://ecos.bok.or.kr/api/{서비스명}/{인증키}/{출력형식}/{언어}/{시작}/{종료}/...

사용 서비스:
- StatisticSearch    : 특정 통계표 + 항목 + 기간 데이터 조회
- KeyStatisticList   : 100대 통계지표 (당일/월별 핵심 지표)

검증된 통계 코드 (실제 API 호출로 구조 확인):
- 802Y001 (D, 일별 주식시장)
    * 0001000  KOSPI 지수
    * 0030000  외국인 순매수(유가증권시장, 단위: 억원)
    * 0089000  KOSDAQ 지수
    * 0113000  외국인 순매수(코스닥시장, 단위: 억원)
    * 0088000  거래대금(유가증권시장, 단위: 억원)
- 901Y055 (M, 월별 투자자별 매매)
    * S22CA  기관투자자 순매수 (단위: 백만원/천주)
    * S22CB  개인 순매수
    * S22CC  외국인 순매수
- 817Y002 (D, 일별 시장금리)
    * 010200000  국고채 3년
    * 010210000  국고채 10년
    * 010300000  회사채 3년 AA-
    * 010101000  콜금리(1일)
    * 010150000  KORIBOR(3개월)
- 901Y009 (M, 소비자물가지수) — 0=총지수
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any

import requests

logger = logging.getLogger(__name__)

ECOS_BASE = "https://ecos.bok.or.kr/api"
TIMEOUT = 10


def _api_key() -> str:
    return str(os.environ.get("BOK_API_KEY", "") or "").strip()


def _enabled() -> bool:
    return bool(_api_key())


def _request(service: str, *path_parts: str) -> dict[str, Any] | None:
    """ECOS API 호출. 실패/미설정 시 None."""
    key = _api_key()
    if not key:
        return None
    url = "/".join([ECOS_BASE, service, key, "json", "kr", *path_parts])
    try:
        r = requests.get(url, timeout=TIMEOUT)
        r.raise_for_status()
        body = r.json()
    except Exception as exc:  # pragma: no cover - network
        logger.warning("BOK API request failed: %s | url=%s", exc, url)
        return None
    # ECOS 에러 응답: {"RESULT": {"CODE": "...", "MESSAGE": "..."}}
    if isinstance(body, dict) and "RESULT" in body and len(body) == 1:
        logger.warning("BOK API error: %s", body["RESULT"])
        return None
    return body


def _safe_float(val: Any) -> float | None:
    try:
        if val is None or val == "":
            return None
        return float(val)
    except (TypeError, ValueError):
        return None


@lru_cache(maxsize=64)
def _statistic_search(stat_code: str, cycle: str, start: str, end: str, item_code: str, *, count: int = 100) -> list[dict]:
    """StatisticSearch 결과의 row 리스트 반환 (실패 시 [])."""
    body = _request(
        "StatisticSearch",
        "1", str(count),
        stat_code, cycle, start, end, item_code,
    )
    if not body:
        return []
    # 정상: {"StatisticSearch": {"list_total_count": N, "row": [...]}}
    block = body.get("StatisticSearch") if isinstance(body, dict) else None
    if not isinstance(block, dict):
        return []
    rows = block.get("row") or []
    return [r for r in rows if isinstance(r, dict)]


def get_foreign_net_buy_daily(days: int = 30) -> dict[str, Any]:
    """KOSPI/KOSDAQ 일별 외국인 순매수 (BOK 802Y001).

    Returns:
        {
          "enabled": bool,
          "KOSPI":  {"dates": ["20260424", ...], "values_eokwon": [-19495, ...], "unit": "억원"},
          "KOSDAQ": {...},
          "summary": {
              "kospi_5d_eokwon": float,    # 최근 5영업일 누적 (억원)
              "kospi_20d_eokwon": float,
              "kosdaq_5d_eokwon": float,
              "kosdaq_20d_eokwon": float,
              "kospi_last_eokwon": float,
              "kosdaq_last_eokwon": float,
          }
        }
    """
    if not _enabled():
        return {"enabled": False, "reason": "BOK_API_KEY 미설정"}

    today = datetime.now()
    end = today.strftime("%Y%m%d")
    start = (today - timedelta(days=max(days * 2, 14))).strftime("%Y%m%d")

    out: dict[str, Any] = {"enabled": True}
    summary: dict[str, float] = {}

    for label, item in (("KOSPI", "0030000"), ("KOSDAQ", "0113000")):
        rows = _statistic_search("802Y001", "D", start, end, item, count=days * 2)
        if not rows:
            out[label] = {"dates": [], "values_eokwon": [], "unit": "억원"}
            continue
        # TIME 오름차순 정렬
        rows = sorted(rows, key=lambda r: str(r.get("TIME", "")))
        dates = [str(r.get("TIME", "")) for r in rows]
        values = [_safe_float(r.get("DATA_VALUE")) or 0.0 for r in rows]
        out[label] = {"dates": dates, "values_eokwon": values, "unit": "억원"}
        if values:
            tail = values[-min(len(values), days):]
            summary[f"{label.lower()}_last_eokwon"] = round(values[-1], 1)
            summary[f"{label.lower()}_5d_eokwon"] = round(sum(values[-5:]), 1)
            summary[f"{label.lower()}_20d_eokwon"] = round(sum(values[-20:]), 1)
            summary[f"{label.lower()}_{days}d_eokwon"] = round(sum(tail), 1)

    out["summary"] = summary
    return out


def get_investor_net_buy_monthly(months: int = 6) -> dict[str, Any]:
    """월별 투자자별(기관/개인/외국인) KOSPI 순매수 (BOK 901Y055).

    Returns:
        {
          "enabled": bool,
          "months": ["202510", ...],
          "institution_eokwon": [...],   # 백만원→억원 환산
          "individual_eokwon": [...],
          "foreigner_eokwon": [...],
          "unit": "억원",
        }
    """
    if not _enabled():
        return {"enabled": False, "reason": "BOK_API_KEY 미설정"}

    today = datetime.now()
    # 최근 N개월 윈도우
    end_ym = today.strftime("%Y%m")
    start_dt = (today - timedelta(days=32 * months))
    start_ym = start_dt.strftime("%Y%m")

    series = {}
    label_map = {
        "S22CA": "institution_eokwon",
        "S22CB": "individual_eokwon",
        "S22CC": "foreigner_eokwon",
    }
    months_axis: list[str] = []

    for item, key in label_map.items():
        rows = _statistic_search("901Y055", "M", start_ym, end_ym, item, count=months * 4)
        if not rows:
            series[key] = []
            continue
        # 같은 TIME 에 단위(백만원/천주) 두 row 가 옴 → "백만원" 단위만 사용
        bucket: dict[str, float] = {}
        for r in rows:
            unit = str(r.get("UNIT_NAME", "")).strip()
            if "원" not in unit:  # 천주(주식수)는 스킵
                continue
            t = str(r.get("TIME", ""))
            v = _safe_float(r.get("DATA_VALUE"))
            if t and v is not None:
                # 백만원 → 억원 (÷100)
                bucket[t] = round(v / 100.0, 1)
        # 정렬
        ordered = sorted(bucket.items(), key=lambda kv: kv[0])
        if not months_axis:
            months_axis = [t for t, _ in ordered]
        # months_axis 기준 정렬 보정 (모든 시리즈 동일 length 보장)
        series[key] = [bucket.get(m) for m in months_axis] if months_axis else [v for _, v in ordered]

    return {
        "enabled": True,
        "months": months_axis,
        "unit": "억원",
        **series,
    }


def get_kr_rates_daily(days: int = 60) -> dict[str, Any]:
    """일별 한국 시장금리 (BOK 817Y002).

    Returns:
        {
          "enabled": bool,
          "KR3YT":   {"dates": [...], "values_pct": [...]},  # 국고채 3년
          "KR10YT":  {...},                                  # 국고채 10년
          "CORP3Y":  {...},                                  # 회사채 3년 AA-
          "CALL":    {...},                                  # 콜금리 1일
          "KORIBOR3M": {...},                                # KORIBOR 3개월
          "summary": {
              "kr3yt_last": float, "kr10yt_last": float,
              "kr_yield_curve_10y_minus_3y_bp": float,       # 장단기 스프레드 (bp)
              "credit_spread_bp": float,                     # 회사채-국고채 스프레드 (bp)
              "kr3yt_20d_change_bp": float,
          }
        }
    """
    if not _enabled():
        return {"enabled": False, "reason": "BOK_API_KEY 미설정"}

    today = datetime.now()
    end = today.strftime("%Y%m%d")
    start = (today - timedelta(days=max(days * 2, 30))).strftime("%Y%m%d")

    items = {
        "KR3YT": "010200000",
        "KR10YT": "010210000",
        "CORP3Y": "010300000",
        "CALL": "010101000",
        "KORIBOR3M": "010150000",
    }
    out: dict[str, Any] = {"enabled": True}
    last_vals: dict[str, float] = {}

    for label, item in items.items():
        rows = _statistic_search("817Y002", "D", start, end, item, count=days * 2)
        if not rows:
            out[label] = {"dates": [], "values_pct": []}
            continue
        rows = sorted(rows, key=lambda r: str(r.get("TIME", "")))
        dates = [str(r.get("TIME", "")) for r in rows]
        values = [_safe_float(r.get("DATA_VALUE")) for r in rows]
        out[label] = {"dates": dates, "values_pct": values}
        # last non-null
        for v in reversed(values):
            if v is not None:
                last_vals[label] = v
                break

    summary: dict[str, float | None] = {}
    if "KR3YT" in last_vals:
        summary["kr3yt_last"] = round(last_vals["KR3YT"], 3)
    if "KR10YT" in last_vals:
        summary["kr10yt_last"] = round(last_vals["KR10YT"], 3)
    if "KR3YT" in last_vals and "KR10YT" in last_vals:
        summary["kr_yield_curve_10y_minus_3y_bp"] = round((last_vals["KR10YT"] - last_vals["KR3YT"]) * 100, 1)
    if "KR3YT" in last_vals and "CORP3Y" in last_vals:
        summary["credit_spread_bp"] = round((last_vals["CORP3Y"] - last_vals["KR3YT"]) * 100, 1)
    # 20일 변화 bp (KR3YT)
    kr3 = out.get("KR3YT", {}).get("values_pct") or []
    kr3_clean = [v for v in kr3 if v is not None]
    if len(kr3_clean) >= 21:
        summary["kr3yt_20d_change_bp"] = round((kr3_clean[-1] - kr3_clean[-21]) * 100, 1)

    out["summary"] = summary
    return out


def get_key_indicators(top: int = 100) -> list[dict[str, Any]]:
    """100대 통계지표 (KeyStatisticList).

    각 항목: {CLASS_NAME, KEYSTAT_NAME, DATA_VALUE, CYCLE, UNIT_NAME}
    """
    if not _enabled():
        return []
    body = _request("KeyStatisticList", "1", str(top))
    if not body:
        return []
    block = body.get("KeyStatisticList") if isinstance(body, dict) else None
    if not isinstance(block, dict):
        return []
    return [r for r in (block.get("row") or []) if isinstance(r, dict)]


def get_macro_snapshot() -> dict[str, Any]:
    """거시경제 분석용 100대 지표 중 핵심만 추출.

    Returns:
        {
          "enabled": bool,
          "items": [{"name": ..., "value": ..., "unit": ..., "as_of": ..., "class": ...}, ...]
        }
    """
    if not _enabled():
        return {"enabled": False, "reason": "BOK_API_KEY 미설정", "items": []}
    rows = get_key_indicators(100)
    if not rows:
        return {"enabled": True, "items": []}

    # 거시경제 분석에 의미 있는 키워드만 필터
    KEEP_KEYWORDS = (
        "기준금리", "콜금리", "KORIBOR", "CD", "국고채", "회사채",
        "원/달러", "원/엔", "원/유로", "원/위안",
        "코스피", "코스닥", "주식거래대금", "투자자예탁금",
        "M1", "M2", "Lf",
        "소비자물가", "생산자물가", "수출물가", "수입물가",
        "경상수지", "GDP", "산업생산",
        "실업률", "취업자",
    )
    items: list[dict[str, Any]] = []
    for r in rows:
        name = str(r.get("KEYSTAT_NAME", "")).strip()
        if not any(kw in name for kw in KEEP_KEYWORDS):
            continue
        items.append({
            "name": name,
            "value": _safe_float(r.get("DATA_VALUE")),
            "unit": str(r.get("UNIT_NAME", "")).strip(),
            "as_of": str(r.get("CYCLE", "")).strip(),
            "class": str(r.get("CLASS_NAME", "")).strip(),
        })
    return {"enabled": True, "items": items}


def is_enabled() -> bool:
    return _enabled()

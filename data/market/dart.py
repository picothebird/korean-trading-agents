"""
OpenDART (전자공시시스템) 클라이언트.

목적
----
- 한국 상장사 펀더멘털 데이터(재무제표·주요 재무지표)와 최근 공시 이벤트를 수집한다.
- 모든 호출은 사용자 환경의 `DART_API_KEY` 가 있어야 동작한다. 없으면 빈 결과를 반환한다.
- LLM 분석 파이프라인의 `fundamental_analyst` / `sentiment_analyst` 가 본 모듈을 사용한다.

API 요약
--------
공식 문서: https://opendart.fss.or.kr/guide/main.do
- corpCode.xml : 종목 → corp_code 매핑 (zip)
- fnlttSinglAcntAll.json : 단일회사 전체 재무제표 (연간/반기/분기)
- list.json : 공시 검색 (기간·corp_code 필터)

품질 정책 (garbage in, garbage out 원칙)
---------------------------------------
- API 응답의 `status != "000"` 인 경우 빈 결과로 격리하고 사유를 포함한다.
- 숫자 필드는 한국 OpenDART 특성상 문자열로 오므로 `_to_int` 로 안전 변환한다.
- 회계 단위(원/백만원)는 `currency` 필드로 보존한다.
- 캐시: corp_code 매핑은 프로세스당 1회, 재무제표는 (corp_code, year, reprt_code) 조합으로 LRU.
"""
from __future__ import annotations

import io
import os
import re
import zipfile
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any
from xml.etree import ElementTree as ET

import httpx

_BASE = "https://opendart.fss.or.kr/api"
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# 보고서 코드 (OpenDART 표준)
REPRT_Q1 = "11013"   # 1분기
REPRT_HY = "11012"   # 반기
REPRT_Q3 = "11014"   # 3분기
REPRT_ANN = "11011"  # 사업보고서 (연간)

# 사업보고서 우선순위로 fallback 시도할 보고서 순서
_REPORT_FALLBACK_ORDER = (REPRT_ANN, REPRT_Q3, REPRT_HY, REPRT_Q1)


def _api_key() -> str:
    """DART API 키를 환경변수에서 가져온다. 비어있으면 빈 문자열."""
    return str(os.environ.get("DART_API_KEY", "") or "").strip()


def is_enabled() -> bool:
    """DART 통합이 활성화되어 있는지 (키 보유 여부)."""
    return bool(_api_key())


def _to_int(val: Any) -> int | None:
    """OpenDART 숫자 문자열(",-,공백 포함) 안전 변환."""
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace(" ", "")
    if not s or s in {"-", "N/A"}:
        return None
    # 음수 표기 (1,234) → -1234
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def _safe_div(num: float | None, den: float | None) -> float | None:
    if num is None or den is None or den == 0:
        return None
    return num / den


@lru_cache(maxsize=1)
def _load_corp_map() -> dict[str, str]:
    """OpenDART corpCode.xml 다운로드 후 (stock_code → corp_code) 매핑 반환.

    상장사만 추출 (stock_code 가 비어있지 않은 항목).
    """
    key = _api_key()
    if not key:
        return {}
    try:
        url = f"{_BASE}/corpCode.xml?crtfc_key={key}"
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.content
    except Exception:
        return {}

    mapping: dict[str, str] = {}
    try:
        # 응답이 zip(XML) 또는 평문 XML(에러시) 둘 다 가능
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                xml_name = next((n for n in zf.namelist() if n.lower().endswith(".xml")), None)
                if not xml_name:
                    return {}
                xml_bytes = zf.read(xml_name)
        except zipfile.BadZipFile:
            xml_bytes = data

        root = ET.fromstring(xml_bytes)
        for item in root.iter("list"):
            stock_code = (item.findtext("stock_code") or "").strip()
            corp_code = (item.findtext("corp_code") or "").strip()
            if stock_code and corp_code and stock_code != " ":
                mapping[stock_code] = corp_code
    except Exception:
        return {}
    return mapping


def get_corp_code(ticker: str) -> str | None:
    """KRX 6자리 티커 → DART corp_code 8자리. 키 없거나 매핑 실패 시 None."""
    t = (ticker or "").strip().zfill(6)
    return _load_corp_map().get(t)


# ──────────────────────────────────────────────
# 재무제표 (fnlttSinglAcntAll: 단일회사 전체 재무제표)
# ──────────────────────────────────────────────

# 표준 계정명 → 우리 키 매핑 (재무상태표·손익계산서 핵심)
# 한국 기업의 분기/반기 보고서에서 계정명이 다양하게 표기되므로 가능한 변형을 모두 포함.
# 매칭 시 좌우 공백·중점("ㆍ"·"·")·괄호 등을 정규화한 후 비교한다(_normalize_account_nm).
_ACCOUNT_MAP = {
    # 손익계산서 (CIS) — 매출액
    "매출액": "revenue",
    "영업수익": "revenue",
    "수익매출액": "revenue",
    "수익": "revenue",
    "매출": "revenue",
    # 영업이익 — 손실 표기 변형 포함
    "영업이익": "operating_income",
    "영업이익손실": "operating_income",
    "영업손익": "operating_income",
    # 당기/분기/반기 순이익 — 보고서 종류에 따라 표기 다름
    "당기순이익": "net_income",
    "당기순이익손실": "net_income",
    "당기순손익": "net_income",
    "당기연결순이익": "net_income",
    "분기순이익": "net_income",
    "분기순이익손실": "net_income",
    "분기연결순이익": "net_income",
    "반기순이익": "net_income",
    "반기순이익손실": "net_income",
    "반기연결순이익": "net_income",
    "당기순이익지배기업의소유주에게귀속되는당기순이익": "net_income",  # IFRS 분리 표기
    # 재무상태표 (BS)
    "자산총계": "total_assets",
    "자산의총계": "total_assets",
    "부채총계": "total_liabilities",
    "부채의총계": "total_liabilities",
    "자본총계": "total_equity",
    "자본의총계": "total_equity",
    "자본합계": "total_equity",
    "유동자산": "current_assets",
    "유동부채": "current_liabilities",
    # 현금흐름표 (CF)
    "영업활동현금흐름": "cfo",
    "영업활동으로인한현금흐름": "cfo",
    "영업활동순현금흐름": "cfo",
}


# IFRS / DART XBRL account_id 표준 태그 → 우리 키.
# account_nm 매칭 실패 시 폴백으로 사용. 표기 흔들림을 흡수하므로 가장 견고하다.
_ACCOUNT_ID_MAP = {
    # 매출
    "ifrs-full_Revenue": "revenue",
    "ifrs_Revenue": "revenue",
    "dart_Sales": "revenue",
    # 영업이익 (DART 확장 태그)
    "dart_OperatingIncomeLoss": "operating_income",
    # 순이익
    "ifrs-full_ProfitLoss": "net_income",
    "ifrs_ProfitLoss": "net_income",
    "ifrs-full_ProfitLossAttributableToOwnersOfParent": "net_income",
    # 자산/부채/자본
    "ifrs-full_Assets": "total_assets",
    "ifrs_Assets": "total_assets",
    "ifrs-full_Liabilities": "total_liabilities",
    "ifrs_Liabilities": "total_liabilities",
    "ifrs-full_Equity": "total_equity",
    "ifrs_Equity": "total_equity",
    "ifrs-full_CurrentAssets": "current_assets",
    "ifrs-full_CurrentLiabilities": "current_liabilities",
    # 현금흐름
    "ifrs-full_CashFlowsFromUsedInOperatingActivities": "cfo",
    "ifrs_CashFlowsFromUsedInOperatingActivities": "cfo",
}


_ACCOUNT_NM_NORMALIZE_RE = re.compile(r"[\s\(\)\[\]·ㆍ,.:：\-_/]")


def _normalize_account_nm(name: str) -> str:
    """계정명 비교용 정규화: 공백·괄호·중점 등 제거.

    예) "당기순이익(손실)" → "당기순이익손실"
        "영업활동으로 인한 현금흐름" → "영업활동으로인한현금흐름"
    """
    if not name:
        return ""
    return _ACCOUNT_NM_NORMALIZE_RE.sub("", name)


def _parse_fnllt_response(payload: dict) -> dict[str, int | None]:
    """단일회사 전체 재무제표 응답을 표준 키로 정규화.

    Returns: {revenue, operating_income, net_income, total_assets, ...}
    """
    out: dict[str, int | None] = {k: None for k in set(_ACCOUNT_MAP.values())}
    if not isinstance(payload, dict):
        return out
    if str(payload.get("status", "")) != "000":
        return out

    items = payload.get("list", []) or []
    # 우선순위: 연결재무제표(CFS) > 별도(OFS)
    fs_priority = {"CFS": 0, "OFS": 1}

    bucket: dict[str, list[tuple[int, int]]] = {k: [] for k in out}
    for it in items:
        if not isinstance(it, dict):
            continue
        # 1차: account_nm 정규화 매칭. 2차: account_id (IFRS XBRL 표준 태그) 매칭.
        account_nm = (it.get("account_nm") or "").strip()
        norm_nm = _normalize_account_nm(account_nm)
        key = _ACCOUNT_MAP.get(norm_nm) or _ACCOUNT_MAP.get(account_nm)
        if not key:
            account_id = (it.get("account_id") or "").strip()
            key = _ACCOUNT_ID_MAP.get(account_id)
        if not key:
            continue
        # 당기 금액 우선 (thstrm_amount)
        amount = _to_int(it.get("thstrm_amount"))
        if amount is None:
            continue
        prio = fs_priority.get(str(it.get("fs_div") or "").upper(), 9)
        bucket[key].append((prio, amount))

    for key, candidates in bucket.items():
        if not candidates:
            continue
        # 가장 우선순위 낮은 숫자(=CFS 우선) 채택
        candidates.sort(key=lambda x: x[0])
        out[key] = candidates[0][1]
    return out


@lru_cache(maxsize=256)
def _fetch_financial_statements(corp_code: str, year: int, reprt_code: str) -> dict[str, int | None]:
    """단일 (corp_code, year, reprt_code) 조합 재무제표를 가져온다."""
    key = _api_key()
    if not key or not corp_code:
        return {k: None for k in set(_ACCOUNT_MAP.values())}
    try:
        url = f"{_BASE}/fnlttSinglAcntAll.json"
        params = {
            "crtfc_key": key,
            "corp_code": corp_code,
            "bsns_year": str(year),
            "reprt_code": reprt_code,
            "fs_div": "CFS",  # 연결 우선
        }
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        result = _parse_fnllt_response(data)
        # CFS 가 비었으면 OFS 재시도
        if all(v is None for v in result.values()):
            params["fs_div"] = "OFS"
            with httpx.Client(timeout=_TIMEOUT) as client:
                resp2 = client.get(url, params=params)
                resp2.raise_for_status()
                data2 = resp2.json()
            result = _parse_fnllt_response(data2)
        return result
    except Exception:
        return {k: None for k in set(_ACCOUNT_MAP.values())}


def get_latest_financials(ticker: str) -> dict[str, Any]:
    """가장 최신의 사용 가능한 재무제표 + 주요 비율을 반환한다.

    전략:
    - 올해 사업보고서 → 작년 사업보고서 → 올해 3Q → 올해 반기 → 올해 1Q 순으로 시도
    - 첫 비공백 응답을 채택
    - 손익은 가장 최근 결산기 기준 12개월 환산이 어렵기 때문에 **원시 분기/반기 수치 그대로** 노출하고
      `period_label` 로 분기/반기/연간을 구분한다.

    Returns:
        {
          "ticker": str,
          "corp_code": str | None,
          "year": int | None,
          "report_code": str | None,
          "period_label": "연간" | "3분기누적" | "반기" | "1분기",
          "currency": "KRW",
          "raw": {revenue, operating_income, net_income, total_assets, ...},
          "ratios": {
            "operating_margin_pct": float | None,
            "net_margin_pct": float | None,
            "debt_to_equity_pct": float | None,
            "equity_ratio_pct": float | None,
            "current_ratio_pct": float | None,
            "roe_pct": float | None,
          },
          "available": bool,
          "source": "OpenDART fnlttSinglAcntAll",
          "error": str | None,
        }
    """
    base_result: dict[str, Any] = {
        "ticker": ticker,
        "corp_code": None,
        "year": None,
        "report_code": None,
        "period_label": None,
        "currency": "KRW",
        "raw": {},
        "ratios": {},
        "available": False,
        "source": "OpenDART fnlttSinglAcntAll",
        "error": None,
    }
    if not is_enabled():
        base_result["error"] = "DART_API_KEY 미설정"
        return base_result

    corp_code = get_corp_code(ticker)
    if not corp_code:
        base_result["error"] = "DART corp_code 매핑 실패"
        return base_result
    base_result["corp_code"] = corp_code

    this_year = datetime.now().year
    candidates: list[tuple[int, str]] = []
    # 올해 보고서 (분기 → 반기 → 3Q → 연간 순서로 최신 정보 탐색)
    for code in (REPRT_ANN, REPRT_Q3, REPRT_HY, REPRT_Q1):
        candidates.append((this_year, code))
    # 작년 사업보고서 (가장 견고)
    candidates.append((this_year - 1, REPRT_ANN))
    candidates.append((this_year - 1, REPRT_Q3))

    label_map = {
        REPRT_ANN: "연간",
        REPRT_Q3: "3분기누적",
        REPRT_HY: "반기",
        REPRT_Q1: "1분기",
    }

    for year, reprt_code in candidates:
        raw = _fetch_financial_statements(corp_code, year, reprt_code)
        if any(v is not None for v in raw.values()):
            base_result["year"] = year
            base_result["report_code"] = reprt_code
            base_result["period_label"] = label_map.get(reprt_code, "?")
            base_result["raw"] = raw
            base_result["available"] = True
            base_result["ratios"] = _compute_ratios(raw, reprt_code)
            return base_result

    base_result["error"] = "최근 2년치 모든 보고서에서 재무 데이터 미발견"
    return base_result


def _compute_ratios(raw: dict[str, int | None], reprt_code: str | None = None) -> dict[str, float | None]:
    """원시 재무 수치 → 핵심 비율(%).

    ROE 만 연환산(annualization) 적용:
    - 분기/반기 보고서의 net_income 은 부분기 누적치이므로 그대로 자본총계로 나누면 ROE 가 비현실적으로 작게 나온다.
    - 보고서 종류에 따라 연간 환산 계수를 곱한다 (1Q ×4, 반기 ×2, 3Q ×4/3, 연간 ×1).
    - 영업이익률·순이익률은 (이익/매출) 비율이므로 분자·분모 모두 같은 기간이라 환산 불필요.
    """
    revenue = raw.get("revenue")
    op_inc = raw.get("operating_income")
    net_inc = raw.get("net_income")
    total_assets = raw.get("total_assets")
    total_liab = raw.get("total_liabilities")
    total_equity = raw.get("total_equity")
    cur_assets = raw.get("current_assets")
    cur_liab = raw.get("current_liabilities")

    # 보고서별 ROE 연환산 계수.
    # 분기/반기 누적 순이익을 연간 추정치로 변환해 자본총계로 나눈다.
    annualize_factor = {
        REPRT_Q1: 4.0,
        REPRT_HY: 2.0,
        REPRT_Q3: 4.0 / 3.0,
        REPRT_ANN: 1.0,
    }.get(reprt_code or "", 1.0)
    net_inc_annualized = (
        int(net_inc * annualize_factor) if isinstance(net_inc, (int, float)) else None
    )

    def pct(num, den):
        v = _safe_div(num, den)
        return None if v is None else round(v * 100, 2)

    return {
        "operating_margin_pct": pct(op_inc, revenue),
        "net_margin_pct": pct(net_inc, revenue),
        "debt_to_equity_pct": pct(total_liab, total_equity),
        "equity_ratio_pct": pct(total_equity, total_assets),
        "current_ratio_pct": pct(cur_assets, cur_liab),
        "roe_pct": pct(net_inc_annualized, total_equity),
    }


def get_financials_history(ticker: str, n_periods: int = 6) -> list[dict[str, Any]]:
    """직전 N 분기/반기/연간 보고서 시계열 (가장 최신 → 과거 순).

    펀더멘털 추세(YoY/QoQ) 분석용. Piotroski (2000) F-Score 류 분석은 최소 4분기,
    가급적 8분기 이상의 시계열을 요구한다. 여기서는 기본 6개 (≈1.5년) 를 반환.

    Returns: list of {
      "year": int, "report_code": str, "period_label": str,
      "raw": {...}, "ratios": {...}, "available": bool
    }
    """
    if not is_enabled():
        return []
    corp_code = get_corp_code(ticker)
    if not corp_code:
        return []

    label_map = {
        REPRT_ANN: "연간",
        REPRT_Q3: "3분기누적",
        REPRT_HY: "반기",
        REPRT_Q1: "1분기",
    }

    this_year = datetime.now().year
    # 시간 역순 후보 (최신 → 과거 4년치)
    candidates: list[tuple[int, str]] = []
    for y in range(this_year, this_year - 4, -1):
        # 분기 보고서는 보통 분기 종료 후 45일 내 제출 → 최신부터 시도하면 비정상 응답이 빠르게 None 처리됨.
        for code in (REPRT_ANN, REPRT_Q3, REPRT_HY, REPRT_Q1):
            candidates.append((y, code))

    out: list[dict[str, Any]] = []
    for year, reprt_code in candidates:
        if len(out) >= n_periods:
            break
        raw = _fetch_financial_statements(corp_code, year, reprt_code)
        if not any(v is not None for v in raw.values()):
            continue
        out.append({
            "year": year,
            "report_code": reprt_code,
            "period_label": label_map.get(reprt_code, "?"),
            "raw": raw,
            "ratios": _compute_ratios(raw, reprt_code),
            "available": True,
        })
    return out


# ──────────────────────────────────────────────
# 공시 (list.json: 공시 검색)
# ──────────────────────────────────────────────

# 공시유형코드 (pblntf_ty) — 주요 카테고리만
_PBLNTF_TY = {
    "A": "정기공시",
    "B": "주요사항보고",
    "C": "발행공시",
    "D": "지분공시",
    "E": "기타공시",
    "F": "외부감사관련",
    "G": "펀드공시",
    "H": "자산유동화",
    "I": "거래소공시",
    "J": "공정위공시",
}


# list.json 응답에는 pblntf_ty 가 포함되지 않으므로 report_nm 텍스트로부터 카테고리를 추론.
# 키워드 → 카테고리. 첫 번째로 매칭된 항목 사용 (순서 중요: 더 구체적인 패턴 먼저).
_REPORT_NM_CATEGORY_RULES: tuple[tuple[str, str], ...] = (
    # 정기공시
    ("사업보고서", "정기공시"),
    ("반기보고서", "정기공시"),
    ("분기보고서", "정기공시"),
    # 주요사항보고
    ("주요사항보고", "주요사항보고"),
    ("유상증자", "주요사항보고"),
    ("무상증자", "주요사항보고"),
    ("감자결정", "주요사항보고"),
    ("자기주식취득", "주요사항보고"),
    ("자기주식처분", "주요사항보고"),
    ("자기주식소각", "주요사항보고"),
    ("합병결정", "주요사항보고"),
    ("분할결정", "주요사항보고"),
    ("회사채발행", "주요사항보고"),
    ("전환사채", "주요사항보고"),
    ("신주인수권부사채", "주요사항보고"),
    ("교환사채", "주요사항보고"),
    # 지분공시
    ("주식등의대량보유", "지분공시"),
    ("최대주주등소유주식변동", "지분공시"),
    ("임원ㆍ주요주주", "지분공시"),
    ("임원·주요주주", "지분공시"),
    ("임원,주요주주", "지분공시"),
    # 거래소·실적·IR
    ("영업(잠정)실적", "실적공시"),
    ("매출액 또는 손익구조", "실적공시"),
    ("기업설명회(IR)", "IR/설명회"),
    ("주주총회소집", "주주총회"),
    # 외부감사
    ("감사보고서", "외부감사"),
    ("감사의견", "외부감사"),
    # 발행공시
    ("증권신고서", "발행공시"),
    ("투자설명서", "발행공시"),
    ("일괄신고", "발행공시"),
)


def _classify_report_nm(report_nm: str) -> str:
    """report_nm 텍스트에서 공시 카테고리 추론."""
    s = report_nm or ""
    for kw, cat in _REPORT_NM_CATEGORY_RULES:
        if kw in s:
            return cat
    return "기타공시"


# ──────────────────────────────────────────────
# 내부자/주요주주 시그널 폴라리티 분류
# ──────────────────────────────────────────────
# DART list.json 만으로는 매수/매도 수량을 알 수 없으므로 보고서명 키워드 기반 휴리스틱.
# 의미:
#   "BULLISH_STRONG"  : 회사가 자기 주식을 직접 매입/소각 (주주가치 환원, 매우 강한 매수 신호)
#   "BULLISH_WEAK"    : 자기주식취득 신탁계약 등 간접 매수 신호
#   "BEARISH_WEAK"    : 자기주식처분 (단, 임직원 보상목적이면 중립이지만 안전하게 약매도)
#   "EVENT_INSIDER"   : 임원/주요주주 거래 발생 (방향성 모름 → 빈도/뉴스와 함께 해석)
#   "EVENT_5PCT"      : 5%룰(주식등의대량보유) 보고 (신규/변동/처분 모두 포함)
#   "EVENT_OWNERSHIP" : 최대주주 변동 (지배구조 이벤트, 매우 강한 신호이지만 방향 불분명)
#   "BULLISH_ISSUE_FREE" : 무상증자 (긍정 시그널)
#   "BEARISH_ISSUE_PAID" : 유상증자 (희석 우려 → 통상 단기 약세)
#   "BEARISH_CB"         : 전환사채/신주인수권부사채/교환사채 (희석 우려)
#   "NEUTRAL"            : 그 외 (정기공시, 단순 IR, 주주총회 소집 등)
_INSIDER_POLARITY_RULES: tuple[tuple[str, str], ...] = (
    ("자기주식소각", "BULLISH_STRONG"),
    ("자기주식취득결정", "BULLISH_STRONG"),
    ("자기주식취득결과", "BULLISH_STRONG"),
    ("자기주식취득", "BULLISH_WEAK"),  # 신탁계약 등 일반
    ("자기주식처분", "BEARISH_WEAK"),
    ("최대주주변경", "EVENT_OWNERSHIP"),
    ("최대주주등소유주식변동", "EVENT_OWNERSHIP"),
    ("주식등의대량보유", "EVENT_5PCT"),
    ("임원ㆍ주요주주특정증권", "EVENT_INSIDER"),
    ("임원·주요주주특정증권", "EVENT_INSIDER"),
    ("임원,주요주주특정증권", "EVENT_INSIDER"),
    ("무상증자", "BULLISH_ISSUE_FREE"),
    ("유상증자", "BEARISH_ISSUE_PAID"),
    ("전환사채", "BEARISH_CB"),
    ("신주인수권부사채", "BEARISH_CB"),
    ("교환사채", "BEARISH_CB"),
)


def _classify_insider_polarity(report_nm: str) -> str:
    """보고서명에서 내부자/주요주주 폴라리티 추론. 해당 없으면 'NEUTRAL'."""
    s = report_nm or ""
    for kw, pol in _INSIDER_POLARITY_RULES:
        if kw in s:
            return pol
    return "NEUTRAL"


# 한국어 라벨 (LLM 프롬프트/UI 노출용)
INSIDER_POLARITY_LABELS: dict[str, str] = {
    "BULLISH_STRONG": "강한매수신호(자사주매입/소각)",
    "BULLISH_WEAK": "약한매수신호(자사주관련)",
    "BEARISH_WEAK": "약한매도신호(자사주처분)",
    "EVENT_INSIDER": "내부자거래발생(방향미상)",
    "EVENT_5PCT": "대량보유보고(5%룰)",
    "EVENT_OWNERSHIP": "지배구조이벤트(최대주주변동)",
    "BULLISH_ISSUE_FREE": "무상증자(긍정)",
    "BEARISH_ISSUE_PAID": "유상증자(희석우려)",
    "BEARISH_CB": "메자닌발행(희석우려)",
    "NEUTRAL": "중립",
}


def get_recent_disclosures(ticker: str, days: int = 30, limit: int = 30) -> list[dict[str, Any]]:
    """최근 N일 공시 이벤트 목록.

    Returns:
        [
          {
            "rcept_no": str,           # 접수번호 (PK)
            "report_nm": str,          # 보고서명 (예: "주요사항보고서(자기주식취득결정)")
            "rcept_dt": "YYYY-MM-DD",  # 접수일
            "flr_nm": str,             # 공시 제출인
            "category": str,           # 공시유형 (정기공시/주요사항보고/...)
            "url": str,                # 공시 원문 뷰어 URL
          },
          ...
        ]
    빈 리스트 = 키 없음/공시 없음/오류 (조용한 격리).
    """
    if not is_enabled():
        return []
    corp_code = get_corp_code(ticker)
    if not corp_code:
        return []

    end_dt = datetime.now()
    bgn_dt = end_dt - timedelta(days=max(1, int(days)))
    try:
        url = f"{_BASE}/list.json"
        params = {
            "crtfc_key": _api_key(),
            "corp_code": corp_code,
            "bgn_de": bgn_dt.strftime("%Y%m%d"),
            "end_de": end_dt.strftime("%Y%m%d"),
            "page_no": "1",
            "page_count": str(max(1, min(100, int(limit)))),
        }
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    if str(data.get("status", "")) != "000":
        return []

    out: list[dict[str, Any]] = []
    for it in (data.get("list") or [])[:limit]:
        if not isinstance(it, dict):
            continue
        rcept_no = str(it.get("rcept_no") or "")
        rcept_dt_raw = str(it.get("rcept_dt") or "")
        # YYYYMMDD → YYYY-MM-DD
        rcept_dt = (
            f"{rcept_dt_raw[:4]}-{rcept_dt_raw[4:6]}-{rcept_dt_raw[6:8]}"
            if len(rcept_dt_raw) == 8 else rcept_dt_raw
        )
        ty_code = str(it.get("pblntf_ty") or "").strip().upper()
        report_nm = str(it.get("report_nm") or "").strip()
        # list.json 응답에 pblntf_ty 가 없는 경우(현재 정상 케이스) report_nm 으로 폴백 분류.
        category = (
            _PBLNTF_TY.get(ty_code)
            if ty_code and ty_code in _PBLNTF_TY
            else _classify_report_nm(report_nm)
        )
        out.append({
            "rcept_no": rcept_no,
            "report_nm": report_nm,
            "rcept_dt": rcept_dt,
            "flr_nm": str(it.get("flr_nm") or "").strip(),
            "category": category,
            "insider_polarity": _classify_insider_polarity(report_nm),
            "url": (
                f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}"
                if rcept_no else ""
            ),
        })
    return out


# ──────────────────────────────────────────────
# 헬스 체크
# ──────────────────────────────────────────────

def healthcheck() -> dict[str, Any]:
    """DART 연결 상태 진단 (CLI/디버그용)."""
    if not is_enabled():
        return {"enabled": False, "reason": "DART_API_KEY 미설정"}
    mapping = _load_corp_map()
    return {
        "enabled": True,
        "corp_count": len(mapping),
        "sample_samsung_corp_code": mapping.get("005930"),
    }


__all__ = [
    "is_enabled",
    "get_corp_code",
    "get_latest_financials",
    "get_financials_history",
    "get_recent_disclosures",
    "healthcheck",
    "REPRT_ANN", "REPRT_HY", "REPRT_Q1", "REPRT_Q3",
]

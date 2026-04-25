"""
KIS OpenAPI 주요 매매 기능
- get_connection_status()  - API 연결 상태 확인
- get_current_price(ticker) - 현재가 조회
- get_balance()             - 주식 잔고 조회
- place_order(...)          - 주식 현금 주문 (매수/매도)
"""

import logging
from typing import Literal

from backend.core.config import settings
from backend.core.user_runtime_settings import get_runtime_setting

logger = logging.getLogger(__name__)


def _parse_account(account_no: str) -> tuple[str, str]:
    """
    계좌번호 파싱
    'XXXXXXXX-YY' → (cano 8자리, prod 2자리)
    'XXXXXXXXXXYY' → (앞 8자리, 뒤 2자리)
    """
    account_no = account_no.strip()
    if "-" in account_no:
        parts = account_no.split("-", 1)
        return parts[0][:8], (parts[1][:2] if len(parts) > 1 else "01")
    elif len(account_no) >= 10:
        return account_no[:8], account_no[8:10]
    else:
        return account_no, "01"


def _kis_params() -> dict:
    """런타임 컨텍스트(없으면 전역 설정)에서 KIS 인증 파라미터 추출"""

    app_key = str(get_runtime_setting("kis_app_key", settings.kis_app_key, use_global_when_unset=True) or "").strip()
    app_secret = str(get_runtime_setting("kis_app_secret", settings.kis_app_secret, use_global_when_unset=True) or "").strip()
    is_mock = bool(get_runtime_setting("kis_mock", settings.kis_mock, use_global_when_unset=True))

    return {
        "app_key": app_key,
        "app_secret": app_secret,
        "is_mock": is_mock,
    }


def _kis_account_no() -> str:
    return str(get_runtime_setting("kis_account_no", settings.kis_account_no, use_global_when_unset=True) or "").strip()


def _has_credentials() -> tuple[bool, str]:
    """KIS 자격증명 유효성 확인"""
    params = _kis_params()
    if not params["app_key"]:
        return False, "KIS_APP_KEY가 설정되지 않았습니다"
    if not params["app_secret"]:
        return False, "KIS_APP_SECRET가 설정되지 않았습니다"
    if not _kis_account_no():
        return False, "KIS_ACCOUNT_NO가 설정되지 않았습니다"
    return True, ""


async def get_connection_status() -> dict:
    """KIS API 연결 상태 확인 (토큰 발급 테스트)"""
    ok, err = _has_credentials()
    params = _kis_params()
    if not ok:
        return {"connected": False, "is_mock": params["is_mock"], "error": err}

    try:
        from data.kis.client import get_access_token
        token = await get_access_token(params["app_key"], params["app_secret"], params["is_mock"])
        return {
            "connected": True,
            "is_mock": params["is_mock"],
            "token_preview": token[:10] + "...",
        }
    except Exception as e:
        return {"connected": False, "is_mock": params["is_mock"], "error": str(e)}


async def get_current_price(ticker: str) -> dict:
    """
    국내주식 현재가 조회
    TR: FHKST01010100 (실전/모의 동일)
    """
    from data.kis.client import call_api
    p = _kis_params()

    data = await call_api(
        api_url="/uapi/domestic-stock/v1/quotations/inquire-price",
        tr_id="FHKST01010100",
        params={
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ticker,
        },
        **p,
        method="GET",
    )

    o = data.get("output", {})

    def _int(key: str) -> int:
        v = o.get(key, "0") or "0"
        return int(str(v).replace(",", "").split(".")[0])

    def _float(key: str) -> float:
        v = o.get(key, "0") or "0"
        try:
            return float(str(v).replace(",", ""))
        except ValueError:
            return 0.0

    return {
        "ticker": ticker,
        "current_price": _int("stck_prpr"),
        "price_time": str(o.get("stck_cntg_hour", "") or ""),
        "change": _int("prdy_vrss"),
        "change_pct": _float("prdy_ctrt"),
        "volume": _int("acml_vol"),
        "high": _int("stck_hgpr"),
        "low": _int("stck_lwpr"),
        "open": _int("stck_oprc"),
        "base_price": _int("stck_sdpr"),
        "upper_limit_price": _int("stck_mxpr"),
        "lower_limit_price": _int("stck_llam"),
        "halt_yn": str(o.get("trht_yn", "") or ""),
        "warning_code": str(o.get("mrkt_warn_cls_code", "") or ""),
        "market_cap": o.get("hts_avls", ""),
        "per": o.get("per", ""),
        "pbr": o.get("pbr", ""),
        "name": o.get("rprs_mrkt_kor_name", ""),
    }


async def get_balance() -> dict:
    """
    주식 잔고 조회
    TR: TTTC8434R (실전) / VTTC8434R (모의, 자동 변환)
    """
    from data.kis.client import call_api

    ok, err = _has_credentials()
    if not ok:
        raise Exception(err)

    p = _kis_params()
    cano, prod = _parse_account(_kis_account_no())

    data = await call_api(
        api_url="/uapi/domestic-stock/v1/trading/inquire-balance",
        tr_id="TTTC8434R",
        params={
            "CANO": cano,
            "ACNT_PRDT_CD": prod,
            "AFHR_FLPR_YN": "N",
            "OFL_YN": "",
            "INQR_DVSN": "01",
            "UNPR_DVSN": "01",
            "FUND_STTL_ICLD_YN": "N",
            "FNCG_AMT_AUTO_RDPT_YN": "N",
            "PRCS_DVSN": "00",
            "CTX_AREA_FK100": "",
            "CTX_AREA_NK100": "",
        },
        **p,
        method="GET",
    )

    # output1: 보유종목 배열
    holdings = []
    for item in (data.get("output1") or []):
        qty = int(str(item.get("hldg_qty", "0") or "0").replace(",", ""))
        if qty <= 0:
            continue

        def _item_int(key: str) -> int:
            v = item.get(key, "0") or "0"
            return int(str(v).replace(",", "").split(".")[0])

        def _item_float(key: str) -> float:
            v = item.get(key, "0") or "0"
            try:
                return float(str(v).replace(",", ""))
            except ValueError:
                return 0.0

        holdings.append({
            "ticker": item.get("pdno", ""),
            "name": item.get("prdt_name", ""),
            "qty": qty,
            "avg_price": _item_int("pchs_avg_pric"),
            "current_price": _item_int("prpr"),
            "eval_amount": _item_int("evlu_amt"),
            "profit_loss": _item_int("evlu_pfls_amt"),
            "profit_loss_pct": _item_float("evlu_pfls_rt"),
            "purchase_amount": _item_int("pchs_amt"),
        })

    # output2: 계좌 요약 (단일 객체 or 1-item 배열)
    summary = data.get("output2") or {}
    if isinstance(summary, list):
        summary = summary[0] if summary else {}

    def _sum_int(key: str) -> int:
        v = summary.get(key, "0") or "0"
        return int(str(v).replace(",", "").split(".")[0])

    def _sum_float(key: str) -> float:
        v = summary.get(key, "0") or "0"
        try:
            return float(str(v).replace(",", ""))
        except ValueError:
            return 0.0

    return {
        "holdings": holdings,
        "cash": _sum_int("dnca_tot_amt"),
        "total_eval": _sum_int("tot_evlu_amt"),
        "total_purchase": _sum_int("pchs_amt_smtl_amt"),
        "total_profit_loss": _sum_int("evlu_pfls_smtl_amt"),
        "total_profit_loss_pct": _sum_float("asst_icdc_rt"),
        "is_mock": p["is_mock"],
    }


async def place_order(
    ticker: str,
    side: Literal["buy", "sell"],
    qty: int,
    price: int,
    order_type: str = "00",  # "00": 지정가, "01": 시장가
) -> dict:
    """
    주식 현금 주문 (매수/매도)
    TR: TTTC0802U (매수) / TTTC0801U (매도) — 모의 자동 변환
    """
    from data.kis.client import call_api

    ok, err = _has_credentials()
    if not ok:
        raise Exception(err)

    p = _kis_params()
    cano, prod = _parse_account(_kis_account_no())

    # 시장가 주문은 가격 0
    actual_price = "0" if order_type == "01" else str(price)
    tr_id = "TTTC0802U" if side == "buy" else "TTTC0801U"

    # 매도 시 SLL_TYPE 필요
    body: dict = {
        "CANO": cano,
        "ACNT_PRDT_CD": prod,
        "PDNO": ticker,
        "ORD_DVSN": order_type,
        "ORD_QTY": str(qty),
        "ORD_UNPR": actual_price,
        "EXCG_ID_DVSN_CD": "KRX",
    }
    if side == "sell":
        body["SLL_TYPE"] = "01"  # 일반 매도

    data = await call_api(
        api_url="/uapi/domestic-stock/v1/trading/order-cash",
        tr_id=tr_id,
        params=body,
        **p,
        method="POST",
    )

    o = data.get("output", {})
    return {
        "order_no": o.get("odno", ""),
        "order_time": o.get("ord_tmd", ""),
        "side": side,
        "ticker": ticker,
        "qty": qty,
        "price": price,
        "order_type_label": "지정가" if order_type == "00" else "시장가",
        "is_mock": p["is_mock"],
    }

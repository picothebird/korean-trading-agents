"""
KIS OpenAPI REST 클라이언트
- 접근토큰 발급 + 메모리 캐시 (만료 10분 전 자동 재발급)
- 실전/모의 자동 URL 전환
- GET/POST 공통 async 호출 (tr_id 모의 자동 변환 T→V)
"""

import logging
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

# ── Base URLs ────────────────────────────────────────────────────
PROD_URL = "https://openapi.koreainvestment.com:9443"
MOCK_URL = "https://openapivts.koreainvestment.com:29443"

# ── Token cache (in-memory, 프로세스 단위) ────────────────────────
_token_cache: dict = {
    "access_token": None,
    "expires_at": None,
    "is_mock": None,
}


def _base_url(is_mock: bool) -> str:
    return MOCK_URL if is_mock else PROD_URL


def _needs_token(is_mock: bool) -> bool:
    if _token_cache["access_token"] is None:
        return True
    if _token_cache["is_mock"] != is_mock:
        return True
    if _token_cache["expires_at"] is None:
        return True
    # 만료 10분 전 재발급
    return datetime.now() >= _token_cache["expires_at"] - timedelta(minutes=10)


async def get_access_token(app_key: str, app_secret: str, is_mock: bool) -> str:
    """접근토큰 발급 (캐시 활용)"""
    if not _needs_token(is_mock):
        return _token_cache["access_token"]  # type: ignore[return-value]

    url = f"{_base_url(is_mock)}/oauth2/tokenP"
    payload = {
        "grant_type": "client_credentials",
        "appkey": app_key,
        "appsecret": app_secret,
    }
    headers = {"Content-Type": "application/json", "Accept": "text/plain"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=headers)

    if resp.status_code != 200:
        raise Exception(f"KIS 토큰 발급 실패 [{resp.status_code}]: {resp.text[:300]}")

    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise Exception(f"KIS 토큰 응답에 access_token 없음: {list(data.keys())}")

    expired_str = data.get("access_token_token_expired", "")
    try:
        expires_at = datetime.strptime(expired_str, "%Y-%m-%d %H:%M:%S") if expired_str else datetime.now() + timedelta(hours=23)
    except ValueError:
        expires_at = datetime.now() + timedelta(hours=23)

    _token_cache.update({"access_token": token, "expires_at": expires_at, "is_mock": is_mock})
    logger.info("KIS 접근토큰 발급 완료 (만료: %s, 모의: %s)", expired_str, is_mock)
    return token


def invalidate_token() -> None:
    """토큰 캐시 초기화 (앱키 변경 시 호출)"""
    _token_cache.update({"access_token": None, "expires_at": None, "is_mock": None})


def _resolve_tr_id(tr_id: str, is_mock: bool) -> str:
    """모의투자 TR ID 자동 변환: T/J/C → V"""
    if is_mock and tr_id and tr_id[0] in ("T", "J", "C"):
        return "V" + tr_id[1:]
    return tr_id


async def call_api(
    api_url: str,
    tr_id: str,
    params: dict,
    app_key: str,
    app_secret: str,
    is_mock: bool,
    method: str = "GET",
    tr_cont: str = "",
) -> dict:
    """
    KIS REST API 공통 호출
    - rt_cd != "0" 이면 Exception
    - Returns: 응답 JSON dict 전체
    """
    token = await get_access_token(app_key, app_secret, is_mock)
    resolved_tr_id = _resolve_tr_id(tr_id, is_mock)

    headers = {
        "Content-Type": "application/json",
        "Accept": "text/plain",
        "authorization": f"Bearer {token}",
        "appkey": app_key,
        "appsecret": app_secret,
        "tr_id": resolved_tr_id,
        "tr_cont": tr_cont,
        "custtype": "P",
    }

    url = f"{_base_url(is_mock)}{api_url}"

    async with httpx.AsyncClient(timeout=15) as client:
        if method.upper() == "POST":
            resp = await client.post(url, headers=headers, json=params)
        else:
            resp = await client.get(url, headers=headers, params=params)

    if resp.status_code != 200:
        raise Exception(f"KIS API HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    rt_cd = data.get("rt_cd")
    if rt_cd != "0":
        msg = data.get("msg1") or data.get("msg_cd") or "Unknown error"
        raise Exception(f"KIS API 오류 [{data.get('msg_cd', '?')}]: {msg}")

    return data

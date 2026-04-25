"""
KIS OpenAPI REST 클라이언트
- 접근토큰 발급 + 메모리 캐시 (만료 10분 전 자동 재발급)
- 실전/모의 자동 URL 전환
- GET/POST 공통 async 호출 (tr_id 모의 자동 변환 T→V)
"""

import logging
from datetime import datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Base URLs ────────────────────────────────────────────────────
PROD_URL = "https://openapi.koreainvestment.com:9443"
MOCK_URL = "https://openapivts.koreainvestment.com:29443"

# ── Token cache (in-memory, 프로세스 단위) ────────────────────────
_token_cache: dict[tuple[str, str, bool], dict[str, Any]] = {}


def _base_url(is_mock: bool) -> str:
    return MOCK_URL if is_mock else PROD_URL


def _cache_key(app_key: str, app_secret: str, is_mock: bool) -> tuple[str, str, bool]:
    return (str(app_key), str(app_secret), bool(is_mock))


def _needs_token(app_key: str, app_secret: str, is_mock: bool) -> bool:
    row = _token_cache.get(_cache_key(app_key, app_secret, is_mock))
    if row is None:
        return True

    if row.get("access_token") is None:
        return True

    expires_at = row.get("expires_at")
    if not isinstance(expires_at, datetime):
        return True

    # 만료 10분 전 재발급
    return datetime.now() >= expires_at - timedelta(minutes=10)


async def get_access_token(app_key: str, app_secret: str, is_mock: bool) -> str:
    """접근토큰 발급 (캐시 활용)"""
    key = _cache_key(app_key, app_secret, is_mock)
    if not _needs_token(app_key, app_secret, is_mock):
        return str(_token_cache[key].get("access_token") or "")

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

    _token_cache[key] = {
        "access_token": token,
        "expires_at": expires_at,
    }
    logger.info("KIS 접근토큰 발급 완료 (만료: %s, 모의: %s)", expired_str, is_mock)
    return token


def invalidate_token(app_key: str | None = None, app_secret: str | None = None, is_mock: bool | None = None) -> None:
    """토큰 캐시 초기화 (앱키 변경 시 호출)"""
    global _token_cache

    if app_key is None and app_secret is None and is_mock is None:
        _token_cache = {}
        return

    to_remove: list[tuple[str, str, bool]] = []
    for key in _token_cache.keys():
        k_app_key, k_app_secret, k_mock = key
        if app_key is not None and str(app_key) != k_app_key:
            continue
        if app_secret is not None and str(app_secret) != k_app_secret:
            continue
        if is_mock is not None and bool(is_mock) != bool(k_mock):
            continue
        to_remove.append(key)

    for key in to_remove:
        _token_cache.pop(key, None)


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

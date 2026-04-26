"""
공용 rate limiter.

main.py 와 라우터들이 동일한 인스턴스를 공유하기 위해 별도 모듈로 분리.
Circular import를 피하기 위해 settings 외 다른 backend 모듈에 의존하지 않는다.
"""
from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.core.config import settings


def _rate_key(request: Request) -> str:
    user = getattr(request.state, "current_user", None)
    if isinstance(user, dict) and user.get("_id") is not None:
        return f"user:{str(user['_id'])}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_rate_key, default_limits=[])


def login_rate() -> str:
    return f"{settings.rate_limit_login_per_min}/minute"


def register_rate() -> str:
    return f"{settings.rate_limit_register_per_min}/minute"


def order_rate() -> str:
    return f"{settings.rate_limit_order_per_min}/minute"


def analysis_rate() -> str:
    return f"{settings.rate_limit_analysis_per_min}/minute"

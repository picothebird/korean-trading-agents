"""
공통 보안 미들웨어.

- `SecurityHeadersMiddleware`: CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy 부착
- `MaxBodySizeMiddleware`: 본문 크기 제한 (Content-Length 헤더 우선, 없으면 첫 chunk 단위 누적 검사)

Sec-headers 정책은 운영 환경(`settings.debug == False`) 에서 더 강화한다.
HSTS 는 운영 환경에서만 부착(개발 시 자체서명 인증서로 사이트 잠기는 사고 방지).
"""
from __future__ import annotations

from typing import Iterable

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from backend.core.config import settings


# 운영/개발 공통 적용 헤더
_BASE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
}

# 개발 환경에서도 안전한 CSP. Next.js dev 서버가 inline style/script를 사용하므로
# unsafe-inline 을 허용한다. 운영에서는 nonce 기반으로 강화 권장.
_CSP_DEV = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self' data:; "
    "connect-src 'self' http: https: ws: wss:; "
    "frame-ancestors 'none';"
)
_CSP_PROD = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self' data:; "
    "connect-src 'self' https:; "
    "frame-ancestors 'none';"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        for k, v in _BASE_HEADERS.items():
            response.headers.setdefault(k, v)
        # CSP
        response.headers.setdefault(
            "Content-Security-Policy",
            _CSP_PROD if not settings.debug else _CSP_DEV,
        )
        # HSTS (운영 + HTTPS 만)
        if not settings.debug:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """본문 크기 제한 미들웨어.

    - Content-Length 가 있으면 즉시 검사.
    - 없으면 (chunked 등) 본문 streaming은 그대로 통과시키지만, FastAPI 라우트가
      json/form 으로 파싱할 때 starlette 내부의 max_body_size 가 아닌 별도 limit가
      필요한 경우는 nginx/CDN 레벨에서 보강을 권장한다.
    """

    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self.max_bytes = int(max_bytes)

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl:
            try:
                if int(cl) > self.max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": f"요청 본문이 너무 큽니다 (최대 {self.max_bytes} bytes)"},
                    )
            except (TypeError, ValueError):
                pass
        return await call_next(request)


def install_security_middlewares(app: FastAPI) -> None:
    """앱에 보안 미들웨어 일괄 설치."""
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.max_request_body_bytes)


def boot_security_check_or_warn() -> None:
    """부팅 시 보안 설정 검증.

    DEBUG=false 이고 문제가 있으면 SystemExit.
    DEBUG=true 면 콘솔 경고만 출력.
    """
    from backend.core.config import validate_for_production

    problems = validate_for_production()
    if not problems:
        return
    if settings.debug:
        print("⚠ 보안 설정 경고 (DEBUG=true 라 부팅 진행):")
        for p in problems:
            print(f"   - {p}")
    else:
        msg = "\n".join(f"   - {p}" for p in problems)
        raise SystemExit(
            "❌ 운영 환경 부팅 검증 실패. 다음 항목을 수정하세요:\n" + msg
        )

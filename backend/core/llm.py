"""
OpenAI Responses API 클라이언트
- default_llm_model (gpt-5.4)      : reasoning effort=high (심층 분석)
- fast_llm_model   (gpt-5.4-mini)  : 빠른 호출, reasoning 미사용

참고: https://developers.openai.com/api/reference/resources/responses/methods/create
"""
from openai import AsyncOpenAI
from backend.core.config import settings

_client: AsyncOpenAI | None = None

# Reasoning 파라미터를 지원하는 모델 접두어 (gpt-5* 및 o-series)
_REASONING_PREFIXES = ("gpt-5", "o1", "o2", "o3", "o4", "o-")


def _supports_reasoning(model: str) -> bool:
    """모델이 reasoning 파라미터를 지원하는지 여부."""
    return any(model.startswith(p) for p in _REASONING_PREFIXES)


def reset_client() -> None:
    """API 키 변경 후 클라이언트 재생성을 위해 호출."""
    global _client
    _client = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def create_response(
    system: str,
    user: str,
    fast: bool = False,
) -> str:
    """
    OpenAI Responses API (POST /v1/responses) 로 텍스트 생성.

    fast=False → settings.default_llm_model, reasoning effort=settings.reasoning_effort
    fast=True  → settings.fast_llm_model, reasoning 미사용
    """
    client = _get_client()
    model = settings.fast_llm_model if fast else settings.default_llm_model

    kwargs: dict = {
        "model": model,
        "instructions": system,
        "input": user,
    }
    if not fast and _supports_reasoning(model):
        kwargs["reasoning"] = {"effort": settings.reasoning_effort}

    response = await client.responses.create(**kwargs)
    return response.output_text

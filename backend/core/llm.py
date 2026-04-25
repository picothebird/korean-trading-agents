"""
OpenAI Responses API 클라이언트
- default_llm_model (gpt-5)       : reasoning effort=high (심층 분석)
- fast_llm_model   (gpt-5-mini)   : 빠른 호출, reasoning 미사용

참고: https://developers.openai.com/api/reference/resources/responses/methods/create
"""
from openai import AsyncOpenAI
from backend.core.config import settings
from backend.core.user_runtime_settings import get_runtime_setting

_clients: dict[str, AsyncOpenAI] = {}

# Reasoning 파라미터를 지원하는 모델 접두어 (gpt-5* 및 o-series)
_REASONING_PREFIXES = ("gpt-5", "o1", "o2", "o3", "o4", "o-")


def _supports_reasoning(model: str) -> bool:
    """모델이 reasoning 파라미터를 지원하는지 여부."""
    return any(model.startswith(p) for p in _REASONING_PREFIXES)


def reset_client(api_key: str | None = None) -> None:
    """캐시된 OpenAI 클라이언트를 초기화한다."""
    global _clients
    if api_key:
        _clients.pop(api_key, None)
        return
    _clients = {}


def _get_client(api_key: str) -> AsyncOpenAI:
    global _clients
    if not api_key:
        raise ValueError("OpenAI API 키가 설정되지 않았습니다. /api/settings에서 본인 키를 먼저 저장하세요.")

    cached = _clients.get(api_key)
    if cached is not None:
        return cached

    client = AsyncOpenAI(api_key=api_key)
    _clients[api_key] = client
    return client


async def create_response(
    system: str,
    user: str,
    fast: bool = False,
) -> str:
    """
    OpenAI Responses API (POST /v1/responses) 로 텍스트 생성.

    fast=False → default_llm_model, reasoning effort=reasoning_effort
    fast=True  → fast_llm_model, reasoning 미사용
    """
    api_key = str(get_runtime_setting("openai_api_key", "", use_global_when_unset=True) or "").strip()
    client = _get_client(api_key)

    default_model = str(
        get_runtime_setting("default_llm_model", settings.default_llm_model, use_global_when_unset=True)
        or settings.default_llm_model
    )
    fast_model = str(
        get_runtime_setting("fast_llm_model", settings.fast_llm_model, use_global_when_unset=True)
        or settings.fast_llm_model
    )
    model = fast_model if fast else default_model

    reasoning_effort = str(
        get_runtime_setting("reasoning_effort", settings.reasoning_effort, use_global_when_unset=True)
        or settings.reasoning_effort
    ).lower()
    if reasoning_effort not in {"high", "medium", "low"}:
        reasoning_effort = "high"

    kwargs: dict = {
        "model": model,
        "instructions": system,
        "input": user,
    }
    if not fast and _supports_reasoning(model):
        kwargs["reasoning"] = {"effort": reasoning_effort}

    response = await client.responses.create(**kwargs)
    return response.output_text

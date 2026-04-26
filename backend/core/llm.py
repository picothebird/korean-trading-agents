"""
OpenAI Responses API 클라이언트 (단일 모델 통합).

모든 에이전트가 동일한 default_llm_model 하나를 사용합니다.
- fast=False : reasoning effort=reasoning_effort (심층 분석)
- fast=True  : 동일 모델, reasoning 미사용 (빠른 호출 컨텍스트 호환용)

참고: https://developers.openai.com/api/reference/resources/responses/methods/create
"""
import json
from typing import TypeVar, cast

from openai import AsyncOpenAI
from pydantic import BaseModel

from backend.core.config import settings
from backend.core.user_runtime_settings import get_runtime_setting

_clients: dict[str, AsyncOpenAI] = {}

# Reasoning 파라미터를 지원하는 모델 접두어 (gpt-5* 및 o-series)
_REASONING_PREFIXES = ("gpt-5", "o1", "o2", "o3", "o4", "o-")


def _supports_reasoning(model: str) -> bool:
    """모델이 reasoning 파라미터를 지원하는지 여부."""
    return any(model.startswith(p) for p in _REASONING_PREFIXES)


def _normalize_model(raw: str | None) -> str:
    """사용자 입력 모델 ID를 표준화 (소문자 + gpt- 접두어)."""
    v = str(raw or "").strip().lower()
    if not v:
        return ""
    if v.startswith("gpt-") or v.startswith("o") or "/" in v:
        return v
    return f"gpt-{v}"


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
    단일 모델(default_llm_model)을 사용하며, fast=True 인 경우에만 reasoning 을 비활성화한다.
    """
    api_key = str(get_runtime_setting("openai_api_key", "", use_global_when_unset=True) or "").strip()
    client = _get_client(api_key)

    raw_model = (
        get_runtime_setting("default_llm_model", settings.default_llm_model, use_global_when_unset=True)
        or settings.default_llm_model
    )
    model = _normalize_model(raw_model) or _normalize_model(settings.default_llm_model) or "gpt-5.5"

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


T = TypeVar("T", bound=BaseModel)


def _strict_schema(model_cls: type[BaseModel]) -> dict:
    """Pydantic 모델의 JSON Schema 를 OpenAI strict 모드 호환 형태로 변환.

    OpenAI Structured Outputs strict=True 요구사항:
    - 모든 객체에 additionalProperties:false
    - 모든 속성을 required 에 포함 (Optional 도 포함; null 은 union 으로 표현)
    - $defs 내부 객체에도 동일하게 적용
    """
    schema = model_cls.model_json_schema()

    def _walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object" or "properties" in node:
                node.setdefault("additionalProperties", False)
                props = node.get("properties") or {}
                if props:
                    node["required"] = list(props.keys())
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(schema)
    return schema


async def create_structured_response(
    system: str,
    user: str,
    schema_model: type[T],
    fast: bool = False,
) -> T:
    """OpenAI Responses API + Structured Outputs (json_schema, strict=True) 로 Pydantic 응답 생성.

    스키마 위반/모델 거절 시 Pydantic 검증 실패가 발생할 수 있으므로 호출 측에서 try/except 후
    fallback 인스턴스를 사용한다.
    """
    api_key = str(get_runtime_setting("openai_api_key", "", use_global_when_unset=True) or "").strip()
    client = _get_client(api_key)

    raw_model = (
        get_runtime_setting("default_llm_model", settings.default_llm_model, use_global_when_unset=True)
        or settings.default_llm_model
    )
    model = _normalize_model(raw_model) or _normalize_model(settings.default_llm_model) or "gpt-5.5"

    reasoning_effort = str(
        get_runtime_setting("reasoning_effort", settings.reasoning_effort, use_global_when_unset=True)
        or settings.reasoning_effort
    ).lower()
    if reasoning_effort not in {"high", "medium", "low"}:
        reasoning_effort = "high"

    schema = _strict_schema(schema_model)
    schema_name = schema_model.__name__

    kwargs: dict = {
        "model": model,
        "instructions": system,
        "input": user,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "schema": schema,
                "strict": True,
            }
        },
    }
    if not fast and _supports_reasoning(model):
        kwargs["reasoning"] = {"effort": reasoning_effort}

    response = await client.responses.create(**kwargs)
    raw = response.output_text or ""
    data = json.loads(raw)
    return cast(T, schema_model.model_validate(data))

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field

# 프로젝트 루트 = backend의 부모 디렉토리 기준
_ROOT = Path(__file__).parent.parent.parent
_ENV_FILE = _ROOT / ".env"


class Settings(BaseSettings):
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")

    # KIS API
    kis_app_key: str = Field(default="", alias="KIS_APP_KEY")
    kis_app_secret: str = Field(default="", alias="KIS_APP_SECRET")
    kis_account_no: str = Field(default="", alias="KIS_ACCOUNT_NO")
    kis_mock: bool = Field(default=True, alias="KIS_MOCK")

    # LLM 설정
    default_llm_model: str = "gpt-5.4"
    fast_llm_model: str = "gpt-5.4-mini"
    reasoning_effort: str = "high"   # "high" | "medium" | "low" (gpt-5/o-series 전용)
    max_debate_rounds: int = 2

    # GURU 최종 결정 커스터마이징
    guru_enabled: bool = False
    guru_debate_enabled: bool = True
    guru_require_user_confirmation: bool = False
    guru_risk_profile: str = "balanced"  # defensive | balanced | aggressive
    guru_investment_principles: str = ""
    guru_min_confidence_to_act: float = 0.72
    guru_max_risk_level: str = "HIGH"  # LOW | MEDIUM | HIGH | CRITICAL
    guru_max_position_pct: float = 20.0

    # 서버
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "populate_by_name": True,
        "extra": "ignore",
    }


settings = Settings()

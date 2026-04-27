"""
애플리케이션 설정.

- `Settings` 객체는 부팅 시 1회만 만들고 모듈 전역 `settings` 로 공유한다.
- 운영 환경(`DEBUG=false`) 에서는 `validate_for_production()` 로 보안 키/CORS 설정을
  강제 검증해 dev 기본값으로 배포되는 사고를 방지한다.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings
from pydantic import Field

# 프로젝트 루트 = backend의 부모 디렉토리 기준
_ROOT = Path(__file__).parent.parent.parent
_ENV_FILE = _ROOT / ".env"


class Settings(BaseSettings):
    # ── 보안 / 암호화 ──────────────────────────────────────
    app_secret_key: str = Field(default="dev-secret-change-me", alias="APP_SECRET_KEY")
    data_encryption_key: str = Field(default="", alias="DATA_ENCRYPTION_KEY")

    # ── 외부 API ───────────────────────────────────────────
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")

    # KIS API
    kis_app_key: str = Field(default="", alias="KIS_APP_KEY")
    kis_app_secret: str = Field(default="", alias="KIS_APP_SECRET")
    kis_account_no: str = Field(default="", alias="KIS_ACCOUNT_NO")
    kis_mock: bool = Field(default=True, alias="KIS_MOCK")

    # ── MongoDB ────────────────────────────────────────────
    mongodb_uri: str = Field(default="", alias="MONGODB_URI")
    mongodb_db_name: str = Field(default="korean_trading_agents", alias="MONGODB_DB_NAME")
    mongodb_connect_timeout_ms: int = Field(default=5000, alias="MONGODB_CONNECT_TIMEOUT_MS")

    # ── CORS / DoS / 보관 정책 ────────────────────────────
    allowed_origins_raw: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="ALLOWED_ORIGINS",
    )
    max_request_body_bytes: int = Field(default=1_048_576, alias="MAX_REQUEST_BODY_BYTES")
    activity_log_retention_days: int = Field(default=90, alias="ACTIVITY_LOG_RETENTION_DAYS")
    user_trade_retention_days: int = Field(default=365, alias="USER_TRADE_RETENTION_DAYS")

    # ── Rate limit (per-minute) ───────────────────────────
    rate_limit_login_per_min: int = Field(default=5, alias="RATE_LIMIT_LOGIN_PER_MIN")
    rate_limit_register_per_min: int = Field(default=3, alias="RATE_LIMIT_REGISTER_PER_MIN")
    rate_limit_order_per_min: int = Field(default=10, alias="RATE_LIMIT_ORDER_PER_MIN")
    rate_limit_analysis_per_min: int = Field(default=5, alias="RATE_LIMIT_ANALYSIS_PER_MIN")

    # ── 계정 잠금 ──────────────────────────────────────────
    login_max_failed_attempts: int = Field(default=5, alias="LOGIN_MAX_FAILED_ATTEMPTS")
    login_lockout_minutes: int = Field(default=15, alias="LOGIN_LOCKOUT_MINUTES")

    # ── LLM 설정 (단일 모델 통합) ──────────────────────────
    default_llm_model: str = "gpt-5.5"
    # 호환성용 (사용되지 않음). 단일 모델로 통합된 이후 default_llm_model 만 활용된다.
    fast_llm_model: str = "gpt-5.5"
    reasoning_effort: str = "high"   # "high" | "medium" | "low" (gpt-5/o-series 전용)
    max_debate_rounds: int = 2

    # ── GURU 최종 결정 커스터마이징 ────────────────────────
    guru_enabled: bool = False
    guru_debate_enabled: bool = True
    guru_require_user_confirmation: bool = False
    guru_risk_profile: str = "balanced"  # defensive | balanced | aggressive
    guru_investment_principles: str = ""
    guru_min_confidence_to_act: float = 0.72
    guru_max_risk_level: str = "HIGH"  # LOW | MEDIUM | HIGH | CRITICAL
    guru_max_position_pct: float = 20.0

    # ── 서버 ──────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = Field(default=True, alias="DEBUG")

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "populate_by_name": True,
        "extra": "ignore",
    }

    # ── 헬퍼 ──────────────────────────────────────────────
    @property
    def allowed_origins(self) -> List[str]:
        """콤마 구분된 ALLOWED_ORIGINS를 리스트로 파싱."""
        raw = (self.allowed_origins_raw or "").strip()
        if not raw:
            return []
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()


def _is_dev_secret(value: str) -> bool:
    v = (value or "").strip().lower()
    return (
        not v
        or v.startswith("dev-")
        or v.startswith("change_this")
        or v.startswith("change-this")
        or v in {"secret", "test", "dev"}
    )


def validate_for_production() -> list[str]:
    """프로덕션 부팅 검증.

    `DEBUG=false` 인 경우 호출자가 결과를 SystemExit 으로 처리한다.
    DEBUG=true 환경에서도 경고 출력 용도로 호출 가능.
    """
    problems: list[str] = []

    if _is_dev_secret(settings.app_secret_key):
        problems.append(
            "APP_SECRET_KEY가 dev/기본값/빈 값입니다. 32바이트 이상의 랜덤 시크릿을 지정하세요."
        )
    if len(settings.app_secret_key.strip()) < 32:
        problems.append("APP_SECRET_KEY 길이가 32자 미만입니다.")

    if not settings.data_encryption_key.strip():
        problems.append(
            "DATA_ENCRYPTION_KEY가 비어 있습니다. 운영 환경에서는 APP_SECRET_KEY 폴백을 허용하지 않습니다."
        )

    if not settings.mongodb_uri.strip():
        problems.append("MONGODB_URI가 비어 있습니다.")

    origins = settings.allowed_origins
    if not origins:
        problems.append("ALLOWED_ORIGINS가 비어 있습니다.")
    elif any("localhost" in o or "127.0.0.1" in o for o in origins):
        problems.append(
            "ALLOWED_ORIGINS에 localhost/127.0.0.1 이 포함되어 있습니다 (운영 환경 부적합)."
        )

    # OPENAI_API_KEY 는 본 배포에서 사용자별 키 모델(MongoDB user_settings)을 사용하므로
    # 서버 전역 키가 비어 있는 것을 정상으로 본다. (frontend 설정 화면에서 각 사용자가 입력)

    return problems

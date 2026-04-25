"""
사용자 런타임 설정 — user_settings.json 에 저장/로드.
.env 보다 우선 적용 (런타임 오버라이드용).
"""
import json
from pathlib import Path

_FILE = Path(__file__).parent.parent.parent / "user_settings.json"
_SECRET_KEYS = {"openai_api_key", "kis_app_key", "kis_app_secret", "kis_account_no"}


def load() -> dict:
    """저장된 설정 반환. 파일 없으면 빈 dict."""
    if _FILE.exists():
        try:
            return json.loads(_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save(data: dict) -> None:
    """기존 설정에 data 를 병합(덮어쓰기)해서 저장."""
    current = load()
    # None은 저장하지 않고, 빈 문자열은 민감정보 키에서만 건너뜀.
    for k, v in data.items():
        if v is None:
            continue
        if isinstance(v, str) and v == "" and k in _SECRET_KEYS:
            continue
        current[k] = v
    _FILE.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")


def apply_to_settings(settings_obj) -> None:
    """로드된 설정을 pydantic Settings 인스턴스에 런타임 적용."""
    cfg = load()
    for key, val in cfg.items():
        if val is None:
            continue
        if isinstance(val, str) and val == "" and key in _SECRET_KEYS:
            continue
        if hasattr(settings_obj, key):
            try:
                object.__setattr__(settings_obj, key, val)
            except Exception:
                pass

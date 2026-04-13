"""
서버 실행 진입점 - 프로젝트 루트에서 실행

사용법:
  # 시스템 Python (기존):
  python run_server.py

  # 가상환경 (권장):
  .venv/Scripts/python.exe run_server.py    # Windows
  .venv/bin/python run_server.py            # macOS/Linux

  # 또는 start.bat (Windows) / start.sh (macOS) 사용
"""
import sys
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

# 프로젝트 루트를 경로에 추가 (모든 모듈 검색 가능)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# 환경 변수 파일 확인
env_path = os.path.join(ROOT, ".env")
if not os.path.exists(env_path):
    print(f"⚠️  .env 파일이 없습니다: {env_path}")
    print("   .env.example을 복사하고 API 키를 입력하세요")
    sys.exit(1)

import uvicorn

if __name__ == "__main__":
    print(f"🐍 Python: {sys.executable}")
    is_venv = hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix)
    print(f"{'✓ 가상환경' if is_venv else '⚠️  시스템 Python'} 사용 중")
    print(f"🚀 서버 시작: http://localhost:8000")

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[
            os.path.join(ROOT, "backend"),
            os.path.join(ROOT, "agents"),
            os.path.join(ROOT, "data"),
        ],
    )


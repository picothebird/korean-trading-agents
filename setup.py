#!/usr/bin/env python3
"""
Korean Trading Agents - Environment Setup Script
다른 머신에서 동일한 환경을 재현하기 위한 설정 스크립트

Usage:
    python setup.py            # 전체 설정
    python setup.py --check    # 환경 점검만
    python setup.py --venv     # 가상환경만 생성
"""
import os
import sys
import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
VENV_DIR = ROOT / ".venv"
VENV_PYTHON = VENV_DIR / "Scripts" / "python.exe" if sys.platform == "win32" else VENV_DIR / "bin" / "python"
VENV_PIP = VENV_DIR / "Scripts" / "pip.exe" if sys.platform == "win32" else VENV_DIR / "bin" / "pip"


def run(cmd: list, **kwargs) -> int:
    print(f"  $ {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, **kwargs)
    return result.returncode


def check_python_version():
    v = sys.version_info
    print(f"✓ Python {v.major}.{v.minor}.{v.micro}")
    if v.major < 3 or (v.major == 3 and v.minor < 11):
        print("⚠️  Python 3.11+ 권장 (현재 버전에서 일부 패키지가 작동 안 할 수 있습니다)")
    return True


def check_env_file():
    env_file = ROOT / ".env"
    example_file = ROOT / ".env.example"
    if not env_file.exists():
        if example_file.exists():
            shutil.copy(example_file, env_file)
            print("✓ .env.example → .env 복사 완료 (API 키를 입력해주세요)")
        else:
            print("⚠️  .env 파일이 없습니다. .env.example을 참고하여 생성해주세요")
        return False
    # 필수 키 확인
    env_text = env_file.read_text(encoding="utf-8")
    if "OPENAI_API_KEY=sk-" not in env_text and "OPENAI_API_KEY=" not in env_text:
        print("⚠️  .env에 OPENAI_API_KEY가 없습니다")
        return False
    if "sk-your" in env_text or "your_" in env_text:
        print("⚠️  .env의 API 키 값을 실제 값으로 교체해주세요")
        return False
    print("✓ .env 파일 확인됨")
    return True


def create_venv():
    if VENV_DIR.exists():
        print("✓ .venv 이미 존재")
        return True
    print("📦 가상환경 생성 중...")
    rc = run([sys.executable, "-m", "venv", str(VENV_DIR)])
    if rc != 0:
        print("❌ 가상환경 생성 실패")
        return False
    print("✓ .venv 생성 완료")
    return True


def install_packages():
    print("📦 패키지 설치 중...")
    req_file = ROOT / "requirements.txt"
    rc = run([str(VENV_PIP), "install", "-r", str(req_file)])
    if rc != 0:
        print("⚠️  일부 패키지 설치 실패, FinanceDataReader를 GitHub에서 설치 시도...")

    # FinanceDataReader는 Python 3.14용 wheel이 없어서 GitHub에서 직접 설치
    print("📦 FinanceDataReader (GitHub) 설치 중...")
    run([str(VENV_PIP), "install",
         "git+https://github.com/FinanceData/FinanceDataReader.git"])
    print("✓ 패키지 설치 완료")


def setup_frontend():
    frontend_dir = ROOT / "frontend"
    if not frontend_dir.exists():
        print("⚠️  frontend/ 디렉토리 없음 - npx create-next-app@latest frontend 로 생성하세요")
        return

    node_modules = frontend_dir / "node_modules"
    if node_modules.exists():
        print("✓ frontend node_modules 이미 존재")
        return

    print("📦 Frontend 패키지 설치 중...")
    npm = shutil.which("npm")
    if npm:
        subprocess.run([npm, "install"], cwd=str(frontend_dir))
        print("✓ Frontend 패키지 설치 완료")
    else:
        print("⚠️  npm이 없습니다. Node.js를 설치해주세요")


def check_all():
    print("\n" + "="*50)
    print("  Korean Trading Agents - 환경 점검")
    print("="*50)

    check_python_version()

    venv_ok = VENV_DIR.exists() and VENV_PYTHON.exists()
    print("✓ .venv 존재" if venv_ok else "❌ .venv 없음 - python setup.py --venv 실행")

    env_ok = check_env_file()

    frontend_ok = (ROOT / "frontend" / "node_modules").exists()
    print("✓ frontend/node_modules 존재" if frontend_ok else "⚠️  frontend 패키지 미설치")

    # 핵심 패키지 import 테스트
    if VENV_PYTHON.exists():
        result = subprocess.run(
            [str(VENV_PYTHON), "-c",
             "import fastapi, langchain_core, pydantic_settings, FinanceDataReader; print('IMPORT_OK')"],
            capture_output=True, text=True
        )
        if "IMPORT_OK" in result.stdout:
            print("✓ 핵심 패키지 import 정상")
        else:
            print("❌ 패키지 import 실패:", result.stderr[:200])

    print("\n" + "="*50)
    print("🚀 서버 실행: .venv\\Scripts\\python.exe run_server.py")
    print("🌐 프론트엔드: cd frontend && npm run dev")
    print("="*50 + "\n")


def main():
    args = sys.argv[1:]

    if "--check" in args:
        check_all()
        return

    print("\n🚀 Korean Trading Agents 설정 시작\n")
    check_python_version()
    check_env_file()

    if "--venv" in args or not args:
        create_venv()

    if not args or "--install" in args:
        install_packages()
        setup_frontend()

    check_all()


if __name__ == "__main__":
    main()

<div align="center">

<img src="docs/assets/logo.svg" alt="KTA" width="96" height="96" />

# Korean Trading Agents (KTA)

**한국 주식 시장(KOSPI · KOSDAQ)을 위한 멀티 에이전트 AI 트레이딩 플랫폼**

LLM 분석가 4명 + 리서처 토론 + 리스크/포트폴리오 매니저가 협업해
실시간 시세, OpenDART 공시, 뉴스 RSS, 내부자 시그널까지 종합한 매매 의견을 만들어 냅니다.

[빠른 시작](#-빠른-시작) ·
[주요 기능](#-주요-기능) ·
**[개발자 가이드 →](docs/DEVELOPER_GUIDE.md)**

</div>

---

## 한눈에 보는 KTA

- **왜 만들었나** — 한국 시장 데이터(가격·재무·공시·뉴스)를 LLM 에이전트들이
  **각자의 전문 영역에서 분석한 뒤 토론**하도록 만들어, 한 명의 모델이 내놓는 결정보다
  편향이 적고 근거가 풍부한 의견을 받기 위해서입니다.
- **무엇을 하는가** — 종목 하나를 입력하면
  ① 4인 분석가 패널(기술 · 재무 · 감성 · 매크로)이 동시에 분석 →
  ② 강세·약세 리서처가 그 결과를 두고 토론 →
  ③ 리스크 · 포트폴리오 매니저가 최종 판단을 내리는 순서로 의사결정이 흐릅니다.

> ⚠️ **투자 자문이 아닙니다.** 본 프로젝트는 연구 및 교육 목적의 데모입니다.
> 실거래 연동(KIS Open API)은 모의투자·실전 모두 가능하지만, 모든 손익은 사용자 책임입니다.

---

## ⚡ 빠른 시작

### 1. 사전 준비

| 항목 | 버전 / 비고 |
|---|---|
| Python | 3.12+ (3.14에서 검증됨) |
| Node.js | 20+ (프론트엔드용) |
| MongoDB | 로컬 또는 Atlas |
| OpenAI API Key | 필수 — 분석가/리서처 LLM 호출 |
| OpenDART API Key | 무료 발급 — 공시·재무 데이터 |
| KIS Open API | 선택 — 실거래·잔고 조회용 |

### 2. 설치

```powershell
git clone https://github.com/picothebird/korean-trading-agents.git
cd korean-trading-agents

# Python 가상환경
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install git+https://github.com/FinanceData/FinanceDataReader.git

# 프론트엔드
cd frontend
npm install
cd ..
```

### 3. 환경 변수 (`.env`)

루트에 `.env` 파일을 만들고 다음을 채웁니다(필수만 우선).

```env
# 필수
OPENAI_API_KEY=sk-...
DART_API_KEY=...                 # https://opendart.fss.or.kr 무료 발급
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=kta

# 선택 (실거래 연동 시)
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_ACCOUNT_NUMBER=12345678-01
KIS_ENV=virtual                  # virtual | real

# 보안
JWT_SECRET=local-dev-secret-change-me
CORS_ORIGINS=http://localhost:3000
```

### 4. 실행

터미널 두 개를 띄워 백엔드 · 프론트엔드를 동시에 실행합니다.

```powershell
# 터미널 1 — 백엔드 (FastAPI + SSE)
.\.venv\Scripts\python.exe run_server.py
# → http://localhost:8000

# 터미널 2 — 프론트엔드 (Next.js)
cd frontend
npm run dev
# → http://localhost:3000
```

> Windows 파워셸에서는 `&&` 대신 `;` 로 명령을 연결하세요.

---

## 🎯 주요 기능

### 멀티 에이전트 분석 파이프라인

| 단계 | 에이전트 | 역할 |
|---|---|---|
| 1 | **Technical Analyst** | RSI · MACD · 볼린저 · 이동평균 · ATR · 거래량 — 차트 신호 |
| 1 | **Fundamental Analyst** | OpenDART 재무제표(매출·영업이익·ROE 등) · 밸류에이션 |
| 1 | **Sentiment Analyst** | 뉴스 4개 매체 RSS + DART 공시 + **내부자 폴라리티** |
| 1 | **Macro Analyst** | KOSPI/KOSDAQ 지수, 환율, 금리, 외국인·기관 수급 |
| 2 | **Bull / Bear Researcher** | 4인 분석을 근거로 **강세 vs 약세 토론** |
| 3 | **Risk Manager** | 리스크 등급(LOW/MED/HIGH) · 손절/익절 가이드 |
| 3 | **Portfolio Manager** | 켈리 공식 기반 포지션 사이즈 + 최종 BUY/SELL/HOLD |
| 3 | **Guru Manager** | 워런 버핏 / 피터 린치 / 레이 달리오 스타일의 메타 코멘트 |

---

## 📄 라이선스

**Copyright © 2026 picothebird. All Rights Reserved.**

사유(Proprietary) 소프트웨어입니다. 자세한 조건은 [`LICENSE`](LICENSE) 파일을 참고하세요.
상업·평가·학술용 라이선스 문의, 협업 제안, 무단 사용 신고는 **summust135@gmail.com** 으로 연락 주세요.

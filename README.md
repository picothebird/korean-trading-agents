<div align="center">

# Korean Trading Agents (KTA)

**한국 주식 시장(KOSPI · KOSDAQ)을 위한 멀티 에이전트 AI 트레이딩 플랫폼**

LLM 분석가 4명 + 리서처 토론 + 리스크/포트폴리오 매니저가 협업해
실시간 시세, OpenDART 공시, 뉴스 RSS, 내부자 시그널까지 종합한 매매 의견을 만들어 냅니다.

[빠른 시작](#-빠른-시작) ·
[주요 기능](#-주요-기능) ·
[화면 구성](#-화면-구성) ·
[자주 묻는 질문](#-자주-묻는-질문) ·
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
  (백테스트 분석은 별도 백테스트 패널에서 과거 시점 재현용으로 동작합니다.)

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

### DART 내부자 시그널 (10단계 폴라리티)

뉴스보다 신호 가치가 높은 **회사 내부자의 행동**을 자동 분류합니다.

| 폴라리티 | 의미 | 트레이딩 시사점 |
|---|---|---|
| `BULLISH_STRONG` | 자사주 매입 결정/결과 · 소각 | **강한 매수** — 경영진의 저평가 인식 |
| `BULLISH_WEAK` | 자사주 신탁계약 등 | 약한 매수 |
| `BEARISH_WEAK` | 자사주 처분 | 약한 매도 |
| `BEARISH_ISSUE_PAID` | 유상증자 | 단기 희석 → 약세 |
| `BEARISH_CB` | 전환사채 / BW / EB | 단기 희석 → 약세 |
| `BULLISH_ISSUE_FREE` | 무상증자 | 긍정 |
| `EVENT_INSIDER` | 임원 · 주요주주 거래 | 빈도 = 관심도 대리지표 |
| `EVENT_5PCT` | 5%룰 대량보유 보고 | 빈도 = 변동성 대리지표 |
| `EVENT_OWNERSHIP` | 최대주주 변동 | 지배구조 이벤트 (변동성↑) |
| `NEUTRAL` | 정기공시 등 | 중립 |

### 한국 시장 사실주의

- **거래소 규칙 강제** — 호가 단위(lot size), 가격 제한폭, VI 발동, 휴장일,
  T+2 결제, 부분 체결을 데이터 레이어에서 처리.
- **모의투자 우선** — KIS 환경 변수 `KIS_ENV=virtual` 로 실수 없이 시뮬레이션.
- **승인 큐** — 실거래 주문은 승인 단계(`/api/kis/order/approval/...`)를 거쳐
  사람이 최종 확인한 뒤 전송.

### 자동 루프 & 포트폴리오

- **Auto Loop** — 단일 종목을 N분 간격으로 자동 분석·보고.
- **Portfolio Loop** — 다수 종목 스캔 → 점수 상위만 자동 분석 → 알림.
- 둘 다 휴장일·중복 시작 차단·재시작 시 영속화 처리됨.

---

## 🖥 화면 구성

| 화면 | 설명 |
|---|---|
| **Stock Chart Pro** | TradingView 스타일 차트 + 지표 가이드 모달 |
| **Agent Stage** | 분석 파이프라인을 실시간 SSE 로 시각화 (회의실 메타포) |
| **Decision Card** | 최종 BUY/SELL/HOLD 카드 + 근거 요약 + 리스크 등급 |
| **Meeting Minutes** | 분석가 4명·리서처 토론 회의록 (인스펙터 포함) |
| **Backtest Panel** | 단발 백테스트 + 에이전트 백테스트(과거 시점 재현) |
| **Auto / Portfolio Loop Panel** | 자동화 시작·중지·로그 |
| **KIS Panel** | 잔고·주문·승인 큐 |
| **Settings** | LLM 모델·키·테마·임계값 조정 |

---

## ❓ 자주 묻는 질문

<details>
<summary><b>OpenAI 키만으로 돌아가나요?</b></summary>

분석은 가능합니다. 단, OpenDART 키가 없으면 재무·공시·내부자 시그널 블록이
"정보 부족"으로 표시됩니다. **둘 다 무료**이므로 같이 발급받으시는 걸 권장합니다.
</details>

<details>
<summary><b>왜 강세/약세 점수가 50:50 근처에서 시작하나요?</b></summary>

리서처 토론 결과를 **HOLD = 50, BUY = 50+50·confidence, SELL = 50−50·confidence**
로 매핑하기 때문입니다. `bull_score + bear_score = 100` 으로 항상 정렬되어
"한쪽 0점" 같은 직관과 어긋나는 표시가 나오지 않습니다.
</details>

<details>
<summary><b>실거래는 안전한가요?</b></summary>

기본값은 `KIS_ENV=virtual` (모의투자)입니다. 실전으로 바꾸더라도 모든 주문은
승인 큐를 거치며, 휴장일·호가 단위·가격 제한폭 위반은 데이터 레이어에서 거부됩니다.
그럼에도 **실거래 손익은 전적으로 사용자 책임**입니다.
</details>

<details>
<summary><b>분석이 너무 느립니다.</b></summary>

분석가 4명을 병렬 호출하지만 LLM 응답 시간 자체가 변수입니다.
`SettingsPanel` 에서 모델을 `gpt-5-mini` 등 빠른 모델로 바꾸면 체감 속도가 개선됩니다.
</details>

<details>
<summary><b>토론·리서처 결과가 분석가와 어긋나요.</b></summary>

리서처는 분석가 4명의 **요약본**을 받아 다시 토론합니다.
분석가 raw output 은 `Agent Inspector` 에서 항상 확인 가능하며,
어긋남이 잦다면 LLM 모델 등급을 한 단계 올려보세요.
</details>

<details>
<summary><b>네이버 종목토론방·다른 커뮤니티 데이터도 들어가나요?</b></summary>

**들어가지 않습니다.** 네이버는 robots.txt 와 ToS 모두에서 크롤링을 금지합니다
(yeti 봇 외 차단). Paxnet 등 다른 게시판은 정치 스팸 비중이 80%를 넘어
신호 대비 잡음이 너무 커 의도적으로 제외했습니다. 대신 OpenDART 내부자 시그널을
강화했습니다.
</details>

---

## 📚 더 알아보기

- **개발자 / 기여자**: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) — 아키텍처,
  데이터 플로우, API 레퍼런스, 디렉터리 구조, 테스트, 보안 가이드(영문)
- **아키텍처 다이어그램**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Pre-production 체크리스트**: [docs/PRE_PRODUCTION_CHECKLIST.md](docs/PRE_PRODUCTION_CHECKLIST.md)
- **한국 시장 사실주의 감사 로그**: [docs/KOREAN_MARKET_REALISM_AUDIT.md](docs/KOREAN_MARKET_REALISM_AUDIT.md)
- **포트폴리오 오케스트레이션 청사진**: [docs/PORTFOLIO_ORCHESTRATION_BLUEPRINT.md](docs/PORTFOLIO_ORCHESTRATION_BLUEPRINT.md)

---

## 🤝 기여

본 프로젝트는 사유(Proprietary) 소프트웨어이며, **사전 서면 동의 없는 기여는 받지 않습니다.**
협업·연구 협력 제안은 아래 연락처로 먼저 문의해 주세요.

## 📄 라이선스 · 저작권

**Copyright (c) 2026 picothebird. All Rights Reserved.**

본 저장소의 모든 코드·문서·디자인·에셋은 저작권자의 독점 소유물입니다.
공개 저장소에 게시되어 있다는 사실 자체로는 어떠한 사용권도 부여되지 않습니다.

다음 행위는 **사전 서면 허가 없이 명시적으로 금지** 됩니다:

- 상업적·영리 목적 사용 (서비스 호스팅 포함)
- 복제·재배포 (수정 여부와 무관)
- 파생 저작물 생성 (포크·포팅·재구현 포함)
- 본 소프트웨어를 이용한 ML/LLM 학습·미세조정·평가
- 저작권·라이선스 표기 제거 또는 변경

소스 코드의 **개인적 열람·검토** 만 허용됩니다. 자세한 조건은 [`LICENSE`](LICENSE) 파일에 명시되어 있습니다.

## 📬 연락처

상업·평가·학술용 라이선스 문의 또는 무단 사용 신고:

> **summust135@gmail.com**

문의 시 (1) 성명·소속, (2) 사용 목적, (3) 사용 범위(지역·기간·배포 여부),
(4) 상업/비상업 여부를 함께 기재해 주세요.

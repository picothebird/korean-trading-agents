# 에이전트 타임라인 + 회의록 통합 — Apple 등급 UX 개편 제안

> 작성일: 2026-04-26
> 대상: 픽셀 오피스(`PhaserCanvas`) 하단의 **에이전트 활동 표시 영역** 전체
> 목표: "애플이 100억 들여 만든 것 같은" 일관된 톤·정보 위계·서사 구조 달성
> 상태: **제안서 (구현 전, 사용자 승인 대기)**

---

## 0. 결론 한 줄 (TL;DR)

현재 화면은 **"픽셀 오피스(위, 픽셀 톤) ↔ 에이전트 타임라인(아래, SaaS 카드형)"** 두 개의 시각 언어가 단순히 위아래로 붙어있는 상태입니다.
또한 분석 완료 후 산출되는 **"투자 회의록"(`AnalysisReport`)**, **단계별 산출물**, **에이전트별 상세(`analyst_details`)**, **토론 라운드**, **Kelly 비중**, **신뢰도** 같은 가장 가치 있는 정보들이 페이지 다른 위치에 흩어져 있어 사용자가 **"무슨 일이 일어났는지 → 왜 그렇게 결정했는지 → 그래서 내가 뭘 하면 되는지"**라는 서사를 한 호흡에 따라가지 못합니다.

본 제안은 다음을 달성합니다:

1. **하나의 통합 무대 (Stage)** — 픽셀 오피스 캔버스와 그 아래 영역을 시각적으로 완전히 한 덩어리로 재설계
2. **3개 화면 모드 (Live / Story / Report)** — 진행 중에는 라이브, 끝나면 스토리, 깊게 보고 싶으면 리포트로 자연스럽게 전환
3. **회의록의 정식 격상** — `AnalysisReport`를 별도 영역에서 **에이전트 무대 내부**의 종착지로 통합
4. **정보 위계 재정렬** — 비전문가도 한 줄 요약으로 답을 얻고, 전문가는 클릭 한 번으로 raw 토론까지 도달

---

## 1. 현 상태 정밀 분석

### 1.1 컴포넌트 인벤토리

| 컴포넌트 | 위치 | 톤 | 데이터 | 노출 |
|---|---|---|---|---|
| [PhaserCanvas](../frontend/src/components/game/PhaserCanvas.tsx) | 위 50% | **픽셀 도트** (16px → 32px scale) | `thoughts: AgentThought[]` | 항상 |
| [AgentTimeline](../frontend/src/components/agent-timeline/AgentTimeline.tsx) | 아래 50% | **SaaS 카드** (var(--bg-elevated), border-radius, motion) | 같은 `thoughts` | 항상 |
| [AnalysisReport](../frontend/src/components/AnalysisReport.tsx) | 별도 탭/스크롤 | **SaaS 카드** + emoji | `decision: TradeDecision` (분석 완료 시) | 분석 완료 시만 |
| [DecisionCard](../frontend/src/components/DecisionCard.tsx) | 헤더 근처 | 카드 | `decision` 요약 | 분석 완료 시 |
| [AgentInspector](../frontend/src/components/AgentInspector.tsx) | 모달 | 카드 | 단일 `AgentThought` 상세 | 클릭 시 |
| [PipelineBar](../frontend/src/components/PipelineBar.tsx) | 헤더 | 칩 | 단계 진행률 | 항상 |

### 1.2 톤 충돌 지점 7개

1. **폰트** — 캔버스 부트텍스트는 시스템 sans, 타임라인은 동일한 sans → 같지만 캔버스 안의 한글 라벨이 픽셀 도트 보더와 부딪힘
2. **모서리 곡률** — 캔버스(직각 픽셀 그리드) vs 타임라인 카드(`var(--radius-md)`) → 두 직사각형 영역이 다른 라운드를 가짐
3. **그림자** — 캔버스(없음) vs 타임라인 카드(`box-shadow`?) → 평면 vs 입체
4. **애니메이션** — 캔버스(`Phaser tween`, 1200ms bob) vs 타임라인(framer-motion 0.18s) → 박자 어긋남
5. **색 채도** — 캔버스(SKIN/HAIR/LEG 픽셀 팔레트) vs 타임라인(var(--brand) saturated SaaS 색) → 채도 갭
6. **여백** — 캔버스(타일 32px) vs 타임라인(padding 6/8/12 혼재) → 그리드 단위 불일치
7. **그룹 헤더 시각** — 픽셀 오피스의 "분석실/토론실/의사결정실" 룸 라벨과 타임라인의 "단계별/에이전트별" 그룹 헤더가 **같은 개념의 다른 표현**으로 중복

### 1.3 정보 위계 누수 4개

| 정보 | 어디 있나 | 문제 |
|---|---|---|
| 9 에이전트 활동 점/말풍선 | 캔버스 | "왜 그렇게 생각했는지" 본문이 캔버스에 안 보임 |
| thought.content 본문 | 타임라인 | 어느 캐릭터가 한 말인지 캔버스와 시선 이동 필요 |
| `metadata.duration_ms` / `model` / `latency_ms` / `data_sources` | 타임라인 verbose 모드 + Inspector | 두 군데 분산, 어느 쪽이 정식인지 모호 |
| 토론 라운드 / Kelly / 신뢰도 / 최종 결정 | `AnalysisReport` (별도 영역) | 캔버스·타임라인은 진행 중인데 결과가 다른 위치에 갑자기 등장 |

### 1.4 회의록(`AnalysisReport`)이 가진 풍부한 데이터 (현재 활용 부족)

[AnalysisReport](../frontend/src/components/AnalysisReport.tsx)는 다음을 포함하지만, 픽셀 오피스 영역과 시각적으로 단절되어 있어 사용자가 **"방금 본 토론의 결과"**로 인식하지 못합니다:

- `decision.signal` (BUY/SELL/HOLD) — 투표 결과
- `decision.confidence` — 신뢰도 0–1
- `decision.position_size` — Kelly 비중
- `agents_summary.analyst_details` — 4명 분석가 각자의 의견·근거
- `agents_summary.debate.rounds` — 강세/약세 토론 라운드 수
- `agents_summary.debate.transcript` — 라운드별 발언 (있는 경우)
- `agents_summary.risk_notes` — 리스크 매니저 코멘트
- `agents_summary.guru_notes` — GURU 정책 코멘트

이 데이터는 [agents/orchestrator/orchestrator.py:465](../korean-trading-agents/agents/orchestrator/orchestrator.py)의 `# 분석가별 상세 정보(프론트 회의록용)` 주석이 있는 그 페이로드입니다.

---

## 2. 디자인 원칙 (Apple-grade 기준)

### 2.1 5가지 원칙

1. **단일 무대 (One Stage)**
   - 캔버스와 본문이 하나의 borderless surface 위에 살아있어야 한다.
   - 둘 사이에 "이쪽은 그림, 저쪽은 표" 같은 분리선을 두지 않는다.

2. **3 모드 자연 전환 (Three Phases of a Single Story)**
   - **Live** — 분석 중. 캔버스 풀스크린, 타임라인은 우측 아래 보조 패널로 축소.
   - **Story** — 마지막 thought 도착 후 6초 뒤 자동 전환. 캔버스 줄어들고 회의록이 부풀며 이어 들어옴.
   - **Report** — 사용자가 회의록 클릭 시 풀 모드. 캔버스는 좌측 상단 미니어처, 회의록 풀 화면.

3. **데이터를 말로 (Data Becomes Words)**
   - "0.847" → **"신뢰도 85점, 매수 의견이 강세"**
   - "Kelly 0.23" → **"100만원 중 23만원을 이 종목에 쓰는 비중"**
   - 모든 숫자는 한국어 문장이 옆에 붙는다.

4. **터미널 한 줄 응답 (Top-Line Answer First)**
   - 화면 진입 즉시 한 줄: **"이 종목, AI 9명이 매수 73점으로 추천 — 100만원 중 18만원 비중 권장"**
   - 그 한 줄을 클릭하면 근거가 펼쳐진다.

5. **속도와 정적 (Speed and Stillness)**
   - 살아있는 곳: 캔버스 액터의 wander/pulse, 타임라인 신규 항목 fade-in
   - 정적인 곳: 회의록 카드, 결정 결과 (한 번 도착하면 흔들리지 않음)
   - 저혈압 60fps. 모션은 함수형 ease `[0.16, 1, 0.3, 1]` 단일 곡선만 사용.

### 2.2 시각 언어 통일 — "Pixel-Tonal" (제안 명칭)

**"픽셀 도트의 정직함 × SaaS 카드의 정보 밀도"**를 융합한 새로운 시각 언어:

| 요소 | 결정 |
|---|---|
| 코너 라디우스 | **0px 또는 4px만**. 라운드 8/12/16 전부 폐기. 픽셀 그리드와 한 단위. |
| 보더 | 1px 솔리드, `var(--border-default)`. 이중 보더(`outset` 8-bit 효과)는 액센트 카드만. |
| 그림자 | **금지** (회의록 모달만 예외). 평면 layering으로 통일. |
| 폰트 본문 | Pretendard / 시스템 sans, 14px (`comfortable`) — 그대로 |
| 폰트 헤더 | **Pretendard 800 + tracking 0.04em** — Apple의 SF Pro 헤드라인 무게감 |
| 폰트 라벨 / 메타 | **JetBrains Mono / D2Coding 11px** — 픽셀 그리드와 호환되는 모노스페이스 |
| 색 채도 | 채도 -15% 일괄 (LCH 기반). 너무 saturated한 SaaS 톤을 캔버스와 동일한 sober 팔레트로 |
| 그리드 단위 | **8px 베이스 그리드** (8 / 16 / 24 / 32 / 48). 현재 6/10/14 혼재 → 폐기 |
| 액센트 컬러 | 픽셀 캐릭터 9가지 색을 그대로 타임라인 dot/bar에 1:1 사용 → 시각 ID 동기화 |
| 모션 | framer-motion `cubic-bezier(0.16, 1, 0.3, 1)`, duration 180/280/420ms 3단계만 |

---

## 3. 신규 IA (Information Architecture)

### 3.1 통합 무대 레이아웃 (Live Mode)

```
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────┐  ┌────────────────────┐  │
│  │                                      │  │  탑 라인 응답       │  │
│  │      픽셀 오피스 캔버스               │  │  ─────────────     │  │
│  │      (Phaser, 9 액터 + 룸)            │  │  매수 73점          │  │
│  │                                      │  │  100만 중 18만 권장 │  │
│  │                                      │  │                    │  │
│  │      ↓ 우하단 HUD (소형)              │  │  ─ 진행률 ───      │  │
│  │      [ 진행률: 4/9 활성 ]            │  │  L1 ●●●● 4/4       │  │
│  │      [ 음소거 ♪ / ♪̸ ]                │  │  L2 ●●○○ 2/4       │  │
│  │                                      │  │  L3 ○○○ 0/3        │  │
│  └──────────────────────────────────────┘  │                    │  │
│                                            │  ─ 최근 발언 ───   │  │
│  ┌──────────────────────────────────────┐  │  · 윤 차트 매수    │  │
│  │  핵심 발언 한 줄 스트립 (6항목 회전)   │  │  · 박 펀더 중립    │  │
│  │  ● 윤 차트: "RSI 32, 과매도 진입"     │  │  · 강세 토론 우세  │  │
│  └──────────────────────────────────────┘  │  · …               │  │
│                                            └────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

**핵심 변경**:
- 캔버스 + 우측 사이드바 (320–360px 고정폭) = 하나의 카드. 사이의 분리선 없음.
- 타임라인은 **하단 1행 회전 스트립**으로 축소. "지금 누가 뭐라고 했는지"만 6초 회전.
- 우측 사이드바가 **탑 라인 응답 + 진행률 + 최근 5개 발언 + 다음 단계 예고**를 담는다.

### 3.2 Story Mode (분석 완료 직후 자동 전환)

마지막 `done` thought 도착 후 6초 동안 변화가 없으면:
- 캔버스가 **600ms easeOut**으로 50% → 35% 높이로 줄어듦
- 그 자리에 **회의록 카드 스택**이 위로 쌓이며 페이드인 (180ms 시차)
- 회의록 첫 카드: **"AI 9명의 결정 — 매수 (신뢰도 73%)"** 큰 헤드라인
- 두 번째 카드: **"분석가 4명 의견 — 윤(매수), 박(중립), 한(매수), 류(매도)"** AgreementDonut 시각화
- 세 번째 카드: **"강세 vs 약세 토론 — 강세가 2:1로 우세"** 토론 트랜스크립트 미리보기
- 네 번째 카드: **"실제 매매 권장 — 100만원 중 18만원, 손절 -3%"** Kelly + ConfidenceGauge

**자동 전환 트리거 명세**:
- 최근 thought.timestamp + 6000ms < now → Story 모드
- `decision` prop이 도착하면 즉시 Story 모드 (6초 대기 생략)
- 사용자가 캔버스 클릭/스크롤 시 → Live 모드로 복귀
- 토글 버튼 (캔버스 우상단): 🎬 자동 / ▶ 라이브 / 📄 리포트

### 3.3 Report Mode (회의록 풀스크린)

- 캔버스 → 좌상단 200×120px 미니어처 (액터 wander 계속, 클릭 시 Live 복귀)
- 회의록이 화면 중앙 720px 폭으로 풀 표시
- 좌측 sticky TOC (목차): "결정 / 분석가 / 토론 / 리스크 / 실행"
- 우측 sticky 액션 패널: "📝 모의 1주 시도 / 💾 PDF 저장 / 🔗 공유 링크"

---

## 4. 컴포넌트 트리 재설계

### 4.1 신규 / 수정 / 폐기 매트릭스

| 컴포넌트 | 액션 | 비고 |
|---|---|---|
| `<AgentStage>` | **신규** | 캔버스 + 사이드바 + 모드 전환 컨트롤러 (최상위) |
| `<StageTopLine>` | **신규** | 탑 라인 한 줄 응답 카드 |
| `<StageProgress>` | **신규** | L1/L2/L3 단계별 진행률 (PipelineBar 흡수) |
| `<StageRecentStrip>` | **신규** | 하단 회전 발언 스트립 |
| `<StageSidePanel>` | **신규** | 우측 320px 사이드바 컨테이너 |
| `<MeetingMinutes>` | **신규 (래퍼)** | AnalysisReport를 무대에 통합하는 motion 컨테이너 |
| `<PhaserCanvas>` | **유지 + props 추가** | `mode: "live"` &#124; `"mini"` prop으로 크기 동적 조절 |
| `<AgentTimeline>` | **재사용 + 두 모드** | `variant: "strip"` (스트립 1행) &#124; `"full"` (현재) |
| `<AnalysisReport>` | **유지 + 분해** | 섹션별로 쪼개서 `<MeetingMinutes>`에 슬롯 주입 가능하게 |
| `<DecisionCard>` | **흡수** | `<StageTopLine>` 안으로 |
| `<PipelineBar>` | **흡수** | `<StageProgress>` 안으로 |
| `<AgentInspector>` | **유지** | 모달 그대로 |
| `<ActivityFeed>` (이전 시대) | **이미 폐기됨** | 이번 세션에 잔여 import 제거 완료 |

### 4.2 신규 트리

```
<AgentStage>                      // 모드 컨트롤러 + 레이아웃 그리드
├── <StageTopLine />              // 탑 라인 응답
├── <PhaserCanvas mode="live" />  // 픽셀 오피스
├── <StageSidePanel>              // 우측 320px
│   ├── <StageProgress />         // L1/L2/L3
│   ├── <AgentTimeline variant="strip" /> // 최근 5개
│   └── <StageNextHint />         // 다음 단계 예고
├── <StageRecentStrip />          // 하단 회전 1행
└── <MeetingMinutes>              // Story/Report 모드에서 펼쳐짐
    ├── <MinutesHeadline />       // 큰 헤드라인
    ├── <MinutesAnalysts />       // 4 분석가 + AgreementDonut
    ├── <MinutesDebate />         // 토론 트랜스크립트
    ├── <MinutesRisk />           // 리스크 + Kelly + ConfidenceGauge
    └── <MinutesActions />        // 모의 1주 / PDF / 공유
```

### 4.3 상태 관리

`stores/useAgentStage.ts` 신규:
```ts
type StageMode = "live" | "story" | "report";
interface AgentStageState {
  mode: StageMode;
  setMode: (m: StageMode) => void;
  autoMode: boolean;             // 자동 전환 on/off (사용자 토글)
  setAutoMode: (v: boolean) => void;
  lastDoneAt: number | null;     // 자동 전환 트리거용
}
```

기존 `useTimelineStore`(필터/줌/그룹/일시정지/북마크)는 `variant: "full"`일 때만 의미있음. 스트립 모드에서는 모두 무시.

---

## 5. 화면별 상세 사양

### 5.1 `<StageTopLine>` 사양

**높이**: 56px (Live) / 80px (Story) / 96px (Report)
**구조**:
```
┌─[●]─매수────────────────────────────────────┐
│       73점  ·  100만원 중 18만원 권장        │
│       강세 우세 · 토론 2라운드 · 손절 -3%    │
└──────────────────────────────────────────────┘
```
- 좌측 `[●]` = 신호 dot (BUY=bull, SELL=bear, HOLD=hold)
- 한 줄 큰 글씨: **"매수 73점"** (Pretendard 800 24px)
- 그 아래 메타: **"100만원 중 18만원 권장"** (16px regular)
- 진행 중일 때: **"분석 진행 중 — 4/9 에이전트 완료, 약 12초 남음"** (남은 시간은 평균 thought 간격으로 추정)
- 클릭 시 → Story 모드 즉시 전환 + 회의록 첫 섹션으로 스크롤

### 5.2 `<StageProgress>` 사양

PipelineBar의 진화형. 3단계 시각화 + 단계별 활성 에이전트 도트:

```
L1 데이터 수집     ●●●●          4/4 완료
L2 강세⇄약세 토론  ●●○○          진행 중 (2라운드/3)
L3 리스크 → 결정   ○○○           대기
```

- 단계 클릭 시 → 타임라인 strip이 해당 단계 thoughts만 필터
- 단계 호버 시 → 캔버스 룸 라벨 하이라이트 (Phaser tween fadeIn glow)

### 5.3 `<StageRecentStrip>` 사양

**높이**: 32px 1행
**내용**: 최근 thought 6개를 6초 간격으로 회전. 각 항목:
```
[●] 윤 차트  RSI 32, 과매도 진입 — 매수 신호  · 12초 전
```
- 호버 시 회전 정지
- 클릭 시 Inspector 모달 오픈 (기존 동작 유지)
- 키보드 ←/→ 로 수동 회전

### 5.4 `<MeetingMinutes>` 사양 (회의록 격상)

**섹션 5개**, 각각 motion fade-in 시차 80ms:

#### 5.4.1 `<MinutesHeadline>`
```
AI 9명의 결정
─────────────────
매수 (신뢰도 73%)
```
- AgreementDonut (4 분석가 의견 비율) + ConfidenceGauge (신뢰도 0–100)
- 한 줄 자연어: **"4명 중 3명이 매수를 권했고, 강세 토론도 2:1로 우세했어요."**

#### 5.4.2 `<MinutesAnalysts>`
4 분석가 카드 (technical / fundamental / sentiment / macro):
```
┌─ 윤 차트(기술적 분석) ─ [매수]
│  RSI 32 → 과매도 진입
│  20일선 데드크로스 직전이지만 반등 시그널 우세
│  ──────────────────
│  근거 데이터: 한투 시세 / 1분봉 1500개
│  모델: Claude Haiku 4.5 · 응답 1.2초
└──────────────────────────────
```
- 각 카드 클릭 → Inspector 풀 트랜스크립트
- 의견이 다른 분석가는 노란색 dot으로 강조 (consensus break visual)

#### 5.4.3 `<MinutesDebate>`
강세 ⇄ 약세 토론 트랜스크립트 (핵심 격상):
```
강세(불 연구원)         약세(베어 연구원)
─────────             ─────────
1라운드               1라운드
"기술적 매수"          "거시 약세 우려"
                      
2라운드 (반박)          2라운드 (반박)
"매크로는 단기 영향만"  "그래도 KOSPI -3% 위험"

심판 평가
─────────
2:1 강세 우세 — RSI 신호 무게
```
- 각 라운드 카드는 **좌우 대칭 좌석 배치** (디베이트 룸 시각화)
- 라운드 카드 클릭 시 raw 발언 펼침
- "심판 평가" 섹션은 [docs/UX_BEGINNER_TO_EXPERT_AUDIT.md R3](../korean-trading-agents/docs/UX_BEGINNER_TO_EXPERT_AUDIT.md)의 미해결 요청 사항을 충족

#### 5.4.4 `<MinutesRisk>`
```
리스크 매니저(권 리스크) 의견
────────────────────────
Kelly 권장 비중: 23%
실제 적용 비중: 18% (보수적 0.8x 적용)

→ 보유 자본 100만원 기준 18만원
   손절선: 매수가 -3% (=약 5,400원)
   목표가: 매수가 +6% (=약 11,000원)
```
- ConfidenceGauge + 손절/목표가 라벨
- 비전문가 모드: "쉽게 말하면, 100만원이 있으면 18만원만 이 종목에 쓰고, 5,400원 떨어지면 칼같이 끊고 11,000원 오르면 익절하라는 권고예요."

#### 5.4.5 `<MinutesActions>`
```
[ 📝 모의 1주 시도 ]   [ 💾 PDF로 저장 ]   [ 🔗 공유 링크 ]
[ ⚙ 자동 매매에 추가 ]  [ ↻ 다시 분석 ]    [ ✗ 닫기 ]
```
- "모의 1주 시도"가 가장 큰 primary 버튼 (Apple-style 1px outset)
- "자동 매매에 추가"는 [AutoLoopPanel](../frontend/src/components/AutoLoopPanel.tsx)로 deep-link

---

## 6. 데이터 흐름 / 백엔드 의존성

### 6.1 추가로 필요한 백엔드 필드 (있으면 좋음, 없어도 폴백)

| 필드 | 위치 | 폴백 |
|---|---|---|
| `agents_summary.debate.transcript[]` | `decision.agents_summary.debate` | 없으면 "토론 라운드 N회"만 표시 |
| `agents_summary.debate.judge_score` | 동상 | 없으면 "강세 우세"만 |
| `analyst_details[role].latency_ms` | `analyst_details` | 없으면 메타 칸 비움 |
| `analyst_details[role].model` | 동상 | 없으면 "AI 모델" |
| `analyst_details[role].data_sources[]` | 동상 | 없으면 "한투 시세" |

[orchestrator.py:465 분석가별 상세](../korean-trading-agents/agents/orchestrator/orchestrator.py)는 이미 `analyst_details`를 만들고 있으므로, **debate.transcript / judge_score만 추가**하면 회의록 100% 충족. 이 부분은 별도 백엔드 트랙으로 분리 가능.

### 6.2 Live → Story 자동 전환 트리거

```ts
useEffect(() => {
  if (!autoMode) return;
  const last = thoughts[thoughts.length - 1];
  if (!last) return;
  const isAllDone = thoughts.filter(t => t.status === "done").length >= 9;
  if (decision || isAllDone) {
    // 6초 후 Story로
    const id = setTimeout(() => setMode("story"), 6000);
    return () => clearTimeout(id);
  }
}, [thoughts, decision, autoMode]);
```

---

## 7. 모션 / 마이크로 인터랙션 명세

### 7.1 핵심 6개 모션

| 트리거 | 효과 | duration | easing |
|---|---|---|---|
| 신규 thought 도착 | 타임라인 strip 1행 슬라이드 + 캔버스 액터 사고 파티클 | 280ms | `[0.16, 1, 0.3, 1]` |
| Live → Story | 캔버스 50% → 35% 줄어들기 + 회의록 fade-up | 600ms / 180ms 시차 | `easeOut` |
| Story → Report | 캔버스 → 200×120 미니어처, 회의록 폭 720px 확장 | 420ms | `[0.16, 1, 0.3, 1]` |
| 분석가 카드 호버 | 1px 보더 → 2px 보더 + 좌측 색 stripe | 180ms | linear |
| 토론 라운드 펼침 | 카드 height auto (LayoutGroup) | 320ms | spring stiffness 200 |
| 결정 시그널 도착 | 신호 dot 0.85 → 1.15 → 1.0 펄스 | 600ms | spring damping 8 |

### 7.2 사운드 디자인 (MS10 sfx.ts 활용)

| 트리거 | SFX |
|---|---|
| 분석가 done | `select` (660Hz sine 80ms) |
| 토론 라운드 종료 | `done` (660→990 triangle) |
| 최종 결정 도착 | `done` 두 번 + 빈 200ms + `done` 한 번 더 (3음 fanfare) |
| 회의록 카드 펼침 | `thought` (1760Hz tiny tick) |
| 모드 전환 | `select` (single) |

전체 음소거는 기존 HUD ♪/♪̸ 토글 그대로.

---

## 8. 접근성 (WCAG 2.2 AA 이상)

| 요건 | 구현 |
|---|---|
| 색 대비 | 4.5:1 본문 / 3:1 라벨 — 채도 -15% 후 재검증 |
| 키보드 내비게이션 | Tab 순서: TopLine → Canvas → Sidebar → Strip → Minutes 섹션 |
| 스크린리더 aria-live | 신규 thought 도착 시 `polite` 알림 (현재 구현 그대로 유지) |
| 모드 전환 | aria-live `assertive` "회의록이 표시되었습니다" |
| 모션 감소 | `prefers-reduced-motion` 시 모든 transition 0.01s + 캔버스 wander 정지 |
| 픽셀 캐릭터 라벨 | 각 액터에 `aria-label="윤 차트 — 분석 중"` 합성 (Phaser DOM 레이어) |

---

## 9. 성능 가드레일

| 메트릭 | 목표 |
|---|---|
| Live 모드 캔버스 + strip | 60 fps 유지 (현재 60 fps 측정됨) |
| Story 전환 애니메이션 | 16ms 프레임당 < 4ms JS |
| 회의록 풀 렌더 | < 80ms (분석가 카드 4 + 토론 5라운드 + 리스크 1 + 액션 1) |
| Bundle 추가 | < 8KB gzip (motion 재사용, 이미지 0) |
| 가상 스크롤 | strip 모드는 6항목 고정 → react-virtuoso 제거 가능, full 모드에서만 유지 |

---

## 10. 단계별 구현 마일스톤 (제안)

| MS | 범위 | 산출물 | 가시 변화 |
|---|---|---|---|
| **MS-S0** | 디자인 토큰 정렬 (radius/8px 그리드/모노 폰트) | `tokens.css` 갱신 | 시각 톤 즉시 통일 |
| **MS-S1** | `<AgentStage>` 골격 + 모드 전환 store | `useAgentStage.ts`, 빈 sidebar | 레이아웃 그리드 변경 |
| **MS-S2** | `<StageTopLine>` + `<StageProgress>` 흡수 | DecisionCard/PipelineBar 폐기 | 한 줄 응답 등장 |
| **MS-S3** | `<StageRecentStrip>` + AgentTimeline `variant="strip"` | strip 모드 추가 | 하단 회전 스트립 |
| **MS-S4** | `<MeetingMinutes>` 5개 섹션 분해 | MinutesHeadline/Analysts/Debate/Risk/Actions | 회의록이 무대로 통합 |
| **MS-S5** | Live↔Story↔Report 자동 전환 + 모션 | useEffect 트리거 + framer LayoutGroup | 모드 전환 살아남 |
| **MS-S6** | 사운드 디자인 + 접근성 + reduced-motion | sfx 트리거 추가, aria 보강 | 청각·키보드 완성 |
| **MS-S7** | 백엔드 `debate.transcript / judge_score` 필드 추가 (옵션) | orchestrator.py 수정 | 토론 트랜스크립트 풍부 |

각 MS는 기존 마이그레이션 패턴과 동일: 구현 → tsc/eslint/build 검증 → 문서 §0-septies.X 추가 → 커밋 → 푸시.

---

## 11. 위험 / 트레이드오프

| 위험 | 완화책 |
|---|---|
| 자동 모드 전환이 사용자에게 "갑자기 화면 바뀜" 거부감 | 토글 버튼 항상 노출, 첫 사용자는 manual `live` 고정 + 온보딩 안내 |
| AnalysisReport 흡수 시 다른 페이지(분석 탭 외)에서 사용처 깨짐 | `MeetingMinutes`는 래퍼만 추가하고 내부 섹션은 export 유지 |
| 사이드바 320px → 모바일 가로폭 부족 | < 1024px 시 사이드바 stack-below 변형 (모바일은 strip 폐기, 풀 타임라인 토글) |
| 픽셀 캔버스 36% 축소 시 가독성 | TILE_SCALE 동적 조정 (Story 모드 = 1.6x, Report 미니어처 = 0.8x) |
| 백엔드 `debate.transcript` 미공급 | "토론 N라운드"만 표시 + "트랜스크립트 곧 공개 예정" 잠금 카드 |

---

## 12. 다음 단계 (사용자 결정 요청)

이 제안서를 검토하신 후 다음 중 하나를 선택해 주세요:

**A.** 전체 안 그대로 진행 — MS-S0부터 순차 구현 + 커밋·푸시. 각 MS 완료 시 다음 MS로 자동 진행.

**B.** 일부 우선 진행 — 가장 큰 가치를 주는 MS만 골라 진행 (예: S0+S2+S4 = 톤 정렬 + 탑라인 + 회의록 통합).

**C.** 디자인 더 다듬기 — 본 제안의 특정 섹션 재설계 (예: 회의록 5섹션을 7섹션으로, 또는 자동 전환 폐기).

**D.** 디자인 시안 먼저 — 정적 HTML/Figma 톤 시안만 만들어 보고 결정.

추가로 결정 필요한 항목:

1. **자동 모드 전환** 기본값: ON / OFF
2. **모노 폰트** 도입: JetBrains Mono / D2Coding / Pretendard Mono (기존 Pretendard만 유지) 중 택일
3. **백엔드 `debate.transcript`** 추가: 동시 진행 / 별도 트랙 / 보류
4. **모바일 우선순위**: 데스크톱 먼저 완성 / 동시 / 모바일 우선

답변 주시면 그에 맞춰 구현을 시작하겠습니다.

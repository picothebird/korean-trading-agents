# UI 전면 재설계 — Light Edition

> **목표**: AI가 찍어낸 듯한 획일감을 제거하고, 토스/리니어/라이너의 디테일을 흡수한
> **눈이 편한 화이트톤**의 프로덕션급 트레이딩 대시보드로 전환한다.
>
> **범위**: `frontend/src` 전체 (라우트 4개, 컴포넌트 9개, 디자인 토큰).
> **방식**: 외부 컴포넌트 라이브러리 미도입. React Bits·shadcn·Toss 디자인 가이드는 *참고*만 한다.
> **상태**: Phase 1 — 인벤토리 + 컨셉 문서. (검토 후 Phase 2 적용 시작)

---

## 0. 진단 요약 (왜 "AI 같다"는 인상을 주는가)

현재 대시보드의 첫인상이 인공적으로 보이는 6가지 원인:

| # | 증상 | 근본 원인 |
|---|------|-----------|
| 1 | 모든 카드가 비슷한 톤, 같은 radius, 같은 그림자 | 시각적 위계(hierarchy)가 토큰으로 분리돼 있지 않음 — `--bg-surface` 한 톤이 8할을 점유 |
| 2 | 정보가 "한 화면에 모두" 쏟아짐 | 좌측 패널 1개 스크롤에 검색·가격카드·차트·탭컨텐츠 전부 적재 |
| 3 | 컬러가 강한데도 강조가 안 됨 | bull/bear/brand가 동시에 같은 채도로 사용 → 시선 흐름 부재 |
| 4 | 영역 간 padding/gap 불일치 (16/14/18px 혼재) | 8pt 그리드 토큰은 있지만 **준수되지 않음** (인라인 스타일 산재) |
| 5 | 안내 문구·빈 상태·로딩이 "공백"으로 처리 | empty state / skeleton / helper copy가 컴포넌트마다 들쭉날쭉 |
| 6 | 다크톤 위에 형광 컬러(`#F04452`, `#3182F6`) | 눈의 피로도 증가, "트레이딩 터미널" 분위기 → 일반 사용자에 위압적 |

→ **해법의 큰 방향**: 다크 → **밝은 무채색 베이스(off-white)**, 강조는 채도를 살짝 낮춘 *시그널 컬러*로,
정보는 **3-tier card system**(Surface / Elevated / Spotlight)으로 분리, 모든 spacing은 토큰으로 환산.

---

## 1. 디자인 원칙 (Designer's North Star)

1. **Quiet by default, loud on signal** — 평상시 화면은 종이처럼 조용하게. 가격 변동·결정·승인 요청 등 *사용자 액션이 필요한 순간에만* 색이 튄다.
2. **One screen, one job** — 좌측은 "지금 보는 종목", 우측은 "지금 하는 작업". 두 영역은 시각적으로 분리되되 같은 종목 컨텍스트를 공유한다.
3. **Numbers speak Korean** — 가격은 토스처럼 큰 숫자 + 작은 단위, 만/억 표기는 일관, tabular-nums 강제.
4. **Explain before asking** — 모든 주요 입력에 "이게 뭔지/왜 필요한지"를 한 줄로 안내. AI 결정에는 *근거 카드*가 항상 동반.
5. **Reversible & visible** — 모든 위험 액션(주문/루프 시작/설정 저장)은 **확인 → 결과 → 되돌리기 단서**의 3단으로.

---

## 2. 새 디자인 토큰 — Light Theme

### 2.1 색상 팔레트

#### Background (3-tier surface)

| Token | HEX | 용도 |
|-------|-----|------|
| `--bg-canvas` | `#F7F8FA` | 페이지 베이스. 순백(#FFFFFF)이 아닌 살짝 cool-gray 한 톤 → 흰눈 부심 방지 |
| `--bg-surface` | `#FFFFFF` | 카드·패널 (가장 일반적인 컨텐츠 컨테이너) |
| `--bg-elevated` | `#FFFFFF` + `--shadow-md` | 떠 있는 카드 (선택된 종목, 활성 탭, 모달) |
| `--bg-spotlight` | `#EEF3FF` | 강조 영역 (현재 분석 중인 에이전트, 추천 결정) — 브랜드 5% 틴트 |
| `--bg-muted` | `#F1F3F6` | 입력 필드, 비활성 탭, 코드 블록 |
| `--bg-overlay` | `rgba(15, 23, 42, 0.40)` | 모달 dim |

#### Border

| Token | HEX | 용도 |
|-------|-----|------|
| `--border-subtle` | `rgba(15,23,42,0.06)` | 표 행 구분, 카드 내부 분리 |
| `--border-default` | `rgba(15,23,42,0.10)` | 카드 외곽선 (1px) |
| `--border-strong` | `rgba(15,23,42,0.16)` | 입력 포커스 전, 드롭다운 |
| `--border-focus` | `#3182F6` | 포커스 링 (2px outline) |

#### Text (4 step)

| Token | HEX | 대비 (on canvas) | 용도 |
|-------|-----|------------------|------|
| `--text-primary` | `#0F172A` | 16.8:1 | 본문, 가격, 헤더 |
| `--text-secondary` | `#475569` | 7.2:1 | 라벨, 설명 |
| `--text-tertiary` | `#94A3B8` | 3.4:1 | 보조 메타, placeholder |
| `--text-inverse` | `#FFFFFF` | — | 컬러 배경 위 |

> 주: 기존 `#4E5867`은 라이트에서 대비 부족. 모든 placeholder는 `--text-tertiary` 이상.

#### Korean Market Signal (채도 -8%, 명도 -3%)

| Token | HEX | 용도 |
|-------|-----|------|
| `--bull` | `#E5384A` | 상승 (붉은 톤은 유지, 살짝 차분) |
| `--bull-bg` | `#FEF2F3` | 상승 카드 배경 |
| `--bull-border` | `#FBD5D9` | 상승 카드 테두리 |
| `--bear` | `#1F6FEB` | 하락 |
| `--bear-bg` | `#EEF4FE` | |
| `--bear-border` | `#CFE0FB` | |
| `--hold` | `#64748B` | 보합 |
| `--hold-bg` | `#F1F5F9` | |

#### Brand & Semantic

| Token | HEX | 용도 |
|-------|-----|------|
| `--brand` | `#3182F6` | Primary CTA, 포커스, 링크 |
| `--brand-hover` | `#1E6BE0` | hover 상태 |
| `--brand-bg` | `#EEF3FF` | 강조 배경 (spotlight) |
| `--success` | `#16A34A` | 완료, 체결 성공 |
| `--success-bg` | `#ECFDF3` | |
| `--warning` | `#D97706` | 승인 대기, 위험 경고 |
| `--warning-bg` | `#FFF8EB` | |
| `--danger` | `#DC2626` | 오류, 강제 중단 |
| `--danger-bg` | `#FEF2F2` | |

#### Agent Status (light-tuned)

| Status | Dot color | Halo (배경) |
|--------|-----------|--------------|
| `idle` | `#94A3B8` | `transparent` |
| `thinking` | `#3182F6` | `#EEF3FF` |
| `analyzing` | `#0EA5E9` | `#E0F2FE` |
| `debating` | `#8B5CF6` | `#F3EEFF` |
| `deciding` | `#D97706` | `#FFF8EB` |
| `done` | `#16A34A` | `#ECFDF3` |

### 2.2 타이포그래피

| Role | Font | Size / Weight | Letter | 비고 |
|------|------|---------------|--------|------|
| Display (가격) | Pretendard | 32 / 700 | -0.02em | tabular-nums, 변동율은 14/600 옆 배치 |
| Title | Pretendard | 20 / 600 | -0.01em | 카드 제목 |
| Subtitle | Pretendard | 15 / 600 | 0 | 섹션 헤더 |
| Body | Pretendard | 14 / 500 | 0 | 본문 |
| Caption | Pretendard | 12 / 500 | 0 | 라벨, 메타 |
| Micro | Pretendard | 11 / 500 | 0.02em | 시간 스탬프, 배지 |
| Mono | JetBrains Mono | 12 / 500 | 0 | 로그, 코드, 티커 |

> 11px 이하 본문은 금지. 현재 8–10px 라벨 다수 → 11px 이상으로 상향.

### 2.3 Radius / Spacing / Shadow

```
--radius-sm:  8px      카드 내부 요소 (배지, 입력)
--radius-md:  12px     기본 카드, 버튼
--radius-lg:  16px     주요 카드 (가격, 결정)
--radius-xl:  20px     모달, 메인 패널
--radius-pill: 999px   탭, 토큰

/* 모든 spacing은 8pt grid */
--space-1: 4 / --space-2: 8 / --space-3: 12 / --space-4: 16
--space-5: 20 / --space-6: 24 / --space-8: 32 / --space-10: 40
```

라이트 테마 그림자는 *얇고 길게* (다크의 두꺼운 그림자와 반대):
```
--shadow-sm:    0 1px 2px rgba(15,23,42,0.04)
--shadow-md:    0 4px 12px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)
--shadow-lg:    0 12px 32px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.04)
--shadow-spotlight: 0 8px 24px rgba(49,130,246,0.12)
--shadow-focus: 0 0 0 3px rgba(49,130,246,0.20)
```

### 2.4 Motion

- 기본 easing은 `cubic-bezier(0.16, 1, 0.3, 1)` 유지 (스냅감)
- duration: micro 120ms / base 200ms / panel 280ms / page 360ms
- 가격 flash는 0.6s → **0.9s**로 늘려 "조용함" 원칙 준수
- 픽셀 오피스의 워크 사이클은 그대로 (캐릭터는 고대비 유지하되 배경 톤만 라이트)

---

## 3. 레이아웃 재구성

### 3.1 큰 그림 — "Brief / Workspace / Console"

```
┌─────────────────────────────────────────────────────────────────┐
│  TopNav (높이 56)  로고  |  종목 검색(글로벌)  |  마켓 인덱스  |  알림 / 설정 / 사용자 │
├──────────────┬──────────────────────────────────┬───────────────┤
│ BRIEF        │  WORKSPACE                       │ CONSOLE       │
│ 320px        │  flex-1                          │ 360px         │
│              │                                  │ (collapsible) │
│ • 종목 정보  │  탭 네비게이션 (pill)             │ • 픽셀 오피스 │
│ • 즐겨찾기   │  ───────────────────             │ • 활동 로그   │
│ • 검색결과   │  분석 / 백테스트 / 트레이딩 / 포트폴리오│ • 알림        │
│              │                                  │               │
│              │  컨텐츠 (스크롤)                  │               │
│              │   - 분석: 파이프라인 + 결정카드    │               │
│              │   - 백테스트: 폼 + 결과            │               │
│              │   - 트레이딩: 잔고 + 주문          │               │
│              │   - 포트폴리오: 루프 설정 + 모니터  │               │
└──────────────┴──────────────────────────────────┴───────────────┘
```

**기존(50/50)의 문제**: 좌측이 "종목 + 모든 액션"을 동시에 짊어져 스크롤이 길어짐. 우측은 거의 빈 공간이 많음.

**신규(320 / flex / 360)의 이점**:
- **Brief**(좌)는 "지금 보는 종목"의 정체성 카드 + 검색/즐겨찾기만. 짧고 차분.
- **Workspace**(중)는 가장 넓은 캔버스. 차트·결정·백테스트·주문이 여기로 이동.
- **Console**(우)는 "AI가 일하는 모습"과 알림. 평소엔 *접혀 있고* 분석 시작 시 자동 펼침.

### 3.2 반응형

| breakpoint | 레이아웃 |
|------------|----------|
| ≥1440 | Brief 320 / Workspace flex / Console 360 |
| 1180–1439 | Brief 280 / Workspace flex / Console 320 (접기 기본) |
| 900–1179 | Brief 사이드시트(햄버거), Workspace flex, Console 모달 |
| <900 | 단일 컬럼 스택. 하단 4-탭 바 (분석/백테스트/트레이딩/포트폴리오) |

### 3.3 페이지별

| Route | 변화 |
|-------|------|
| `/` | 위 3-컬럼으로 전면 개편 |
| `/login` | 카드 1개 + 마켓 일러스트(부드러운 그라데이션 spotlight). 부트스트랩(첫 사용자)은 단계형 폼 (3step) |
| `/activity` | 타임라인 형식 (날짜 stick + 카드 행). 필터 칩(거래/분석/설정) |
| `/master` | TopNav 동일, 본문은 좌측 nav (개요/사용자/활동/거래) + 우측 워크스페이스 |

---

## 4. 컴포넌트별 적용 계획 (Designer Pass)

각 컴포넌트는 **(a) 시각**, **(b) 카피/안내**, **(c) UX/상호작용** 3축으로 정리.

### 4.1 `page.tsx` — 메인 셸

- (a) 다크 배경 제거, 3-컬럼 그리드. 헤더는 고정(56px), 그림자 `--shadow-sm`.
- (b) 마켓 인덱스에 코스피/코스닥/원달러 라벨 명시 + 변동율 색.
- (c) 로그인 fallback은 `/login`으로 **redirect**(현재 grid + center 카드는 제거).

### 4.2 Brief Panel (좌측, 신규 분리)

- (a) 종목 카드: 큰 가격(32/700), 변동(14), 그 아래 핵심 4지표(RSI / 52w / MA20 / 거래량)만 노출. 나머지는 "지표 더보기" 토글.
- (b) "RSI" → "RSI(14) — 30 미만이면 과매도, 70 초과면 과매수" 인라인 캡션 (한 줄, 처음만 표시 후 dismiss 가능).
- (c) 검색 결과 한 줄에 즐겨찾기 별 토글, 키보드 ↑↓/Enter 지원.

### 4.3 `StockChartPanel.tsx`

- (a) 카드 배경 `--bg-surface`, 차트 영역 inset `--bg-canvas`. 격자선은 `rgba(15,23,42,0.05)`.
- (a) 라인 컬러: 등락에 따라 bull/bear 단일색 → **항상 `--text-primary`** 유지하고 *영역 그라데이션*만 bull/bear-bg로. (눈이 덜 피로)
- (b) 빈 상태: "차트 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요." + Retry 버튼.
- (c) 시간프레임 버튼은 pill 그룹, 활성 시 `--bg-spotlight`. 키보드 ←→로 이동.

### 4.4 `DecisionCard.tsx` ⭐ (가장 중요한 카드)

- (a) 상단 3px bar → **6px round bar**, 카드 radius `--radius-xl`, 카드 좌측에 액션 아이콘(매수/매도/관망) 24px.
- (a) Confidence gauge는 SVG 유지하되 색은 단일(brand) + 신뢰도 구간 라벨(낮음/보통/높음) 텍스트 같이.
- (b) "최종 매매 결정" 아래 **한 줄 요약문** 추가: 예) "9개 에이전트 중 6개가 매수에 동의. 단기 모멘텀 강세, 변동성 보통."
- (b) 인간 승인 문구를 친절하게: "이 결정은 보유 한도를 초과하므로 직접 확인이 필요해요. [근거 보기] [승인] [거절]".
- (c) GURU 정책 영역은 비활성 시 *접어두기*(아코디언). 활성 시 자동 펼침.
- (c) 결정 후 30초 동안 "되돌리기" 버튼 노출(주문 미체결 시).

### 4.5 `AgentOffice.tsx` + `PixelOffice.tsx`

- (a) AgentOffice 카드들은 1-row scroll → **3-layer grid** (Layer 1/2/3 가로 분할), 각 카드는 `--bg-surface` + 상단 dot.
- (a) PixelOffice 캔버스 배경을 라이트 톤(연크림 `#FAF6EE` + 카펫 `#E8E2D2`)으로 교체. 캐릭터 컬러는 유지하되 약간 saturate-down(-10%).
- (b) 각 에이전트 카드에 *역할 한 줄 설명*: "기술분석가 — 차트 패턴과 지표로 단기 매매 신호를 찾아요."
- (c) 사고(thought) 거품은 4줄 고정 + "더 보기" 링크 → 클릭 시 우측 콘솔에 풀텍스트 표시.

### 4.6 `BacktestPanel.tsx`

- (a) 9-칸 그리드 → **3 KPI 헤드라인 + 6 보조** 위계로. 헤드라인은 `--bg-spotlight` 카드 1개에 통합 (수익률/샤프/MDD).
- (a) 차트 그라데이션 fill 0.25 → 0.10 으로 약화.
- (b) 각 지표에 1줄 도움말 (호버 tooltip 일관 컴포넌트로 통합 — `<Hint />`).
- (b) 결과 상단에 자연어 요약 추가: "지난 1년간 +18.2%, 코스피 대비 +6.1% 초과. 최대 낙폭 -8.4%로 안전한 편."
- (c) 결과 페이지에 *백테스트 파라미터 사이드패널* (수정 후 즉시 재실행 버튼).

### 4.7 `KisPanel.tsx`

- (a) "연결됨/모의/실전" 상태를 컬러 칩 1개로 통합 (`success` / `warning` / `danger`).
- (a) 보유종목 그리드는 **헤더 행 + 스트라이프** (홀짝 행 `--bg-canvas`).
- (b) "모의투자 모드 — 실제 자금이 거래되지 않습니다" 배너를 KIS 패널 상단에 *항상* 노출 (모의일 때).
- (b) 주문 확인 모달은 "총 결제금액 / 수수료 / 예상 잔여 매수가능금액" 3행을 큰 글씨로.
- (c) 주문 버튼은 POST 동안 disable + spinner. 성공 시 토스트 + 보유 자동 새로고침.

### 4.8 `AutoLoopPanel.tsx` + `PortfolioLoopPanel.tsx`

- (a) 단일 스크롤 → 내부 탭 3개: **설정 / 활동 / 거래내역**.
- (a) 로그 행은 monospace 12px + 레벨 dot 8px + 타임스탬프 우측 정렬.
- (b) "판단 주기 (거래일)" → "분석 간격 (한국 거래소 영업일 기준)" + 옆에 "예: 5 → 5영업일마다 1회".
- (b) 시작 전 **체크리스트 모달**: API키/잔고/모드/리스크 한눈에 + 시작 버튼.
- (c) 정지 버튼은 항상 떠 있도록(sticky bottom). 비상정지는 빨간색 텍스트 버튼.

### 4.9 `SettingsPanel.tsx`

- (a) 모달 → **사이드 시트(우측 슬라이드인 480px)**. 라이트 테마에서 모달은 무겁다.
- (a) 탭은 좌측 세로 nav, 본문은 우측. 저장/취소는 하단 sticky 바.
- (b) 각 탭 상단에 1문장 설명: "GURU — 위험 한도와 자동 승인 규칙을 정합니다.".
- (b) API 키 필드는 `<input type="password">` + 보기 토글, 마지막 4자리만 표시.
- (c) 변경 사항 있을 때만 저장 활성화. 저장 후 토스트 + 변경 diff 미리보기 옵션.

### 4.10 모달 / 다이얼로그

- 통일 컴포넌트 신설 `<Sheet />`(우측), `<Dialog />`(중앙). 둘 다 `role="dialog"` + `aria-labelledby`.
- 인간 승인 모달은 `<Dialog />` 사용, 단축키 `Y`(승인) `N`(거절) 표시.

---

## 5. 공용 패턴 (재사용 컴포넌트)

도입 예정 (외부 라이브러리 없이 자체 구현):

| 이름 | 역할 |
|------|------|
| `<Surface variant="canvas\|surface\|elevated\|spotlight\|muted">` | 3-tier 카드 베이스 |
| `<Stat label value sub trend>` | 가격/지표 표시 (tabular-nums, 색 자동) |
| `<Pill tone size>` | 상태/카테고리 배지 |
| `<Hint>` | 도움말 인라인 + 호버 풀텍스트 (aria-describedby) |
| `<Empty icon title body action>` | 빈 상태 일관 처리 |
| `<Skeleton w h shape>` | 로딩 스켈레톤 (현 .skeleton 클래스 확장) |
| `<Toast>` | 우상단 알림 (성공/경고/오류) |
| `<Sheet>` / `<Dialog>` | 모달 (접근성 포함) |
| `<TabPills value onChange items>` | 탭 (키보드 ←→) |
| `<NumberFlash>` | 가격 변동 깜빡임 |

---

## 6. 카피/안내 가이드 (UX Writing)

### 6.1 톤

- 존댓말, 간결. 한 문장 1메시지. 전문용어 옆엔 *항상* 한 줄 설명.
- 부정형보다 긍정형: "오류" → "잠시 연결이 끊겼어요. 다시 시도해주세요."
- 액션은 동사로: "확인" → "분석 시작하기", "저장" → "변경사항 저장".

### 6.2 핵심 카피 변경 예시

| Before | After |
|--------|-------|
| "분석 시작을 눌러..." | "종목을 골라 [AI 분석 시작]을 누르면 9명의 에이전트가 함께 검토합니다." |
| "SSE connection lost." | "실시간 연결이 끊겼어요. 잠시 후 자동으로 재연결합니다. (수동: 새로고침)" |
| "고신뢰도 / 대규모 포지션" | "이 결정은 보유 한도(35%)를 넘어 직접 승인이 필요해요." |
| "판단 주기 (거래일)" | "분석 간격 — 영업일 기준 며칠마다 한 번씩 분석할까요?" |
| "모의투자" 배지만 | "모의투자 모드 · 실제 자금은 사용되지 않아요" 배너 |
| 빈 보유종목 | "아직 보유한 종목이 없어요. 매수 주문을 넣으면 여기에 표시됩니다." |

### 6.3 온보딩

- 최초 진입 시 3-step 코치마크: ① "여기서 종목을 골라요" → ② "여기서 AI가 분석해요" → ③ "여기서 실제 주문을 넣어요". 닫으면 다시 안 뜸 (localStorage).

---

## 7. 접근성 체크리스트

- [ ] 모든 인터랙티브 요소 `<button>`/`<a>` 시맨틱
- [ ] 포커스 링 visible (라이트에선 `--shadow-focus`)
- [ ] 모달 `role="dialog"` + focus trap + ESC 닫기
- [ ] 탭 `role="tablist"` + `aria-selected` + 키보드 좌우
- [ ] 컬러 대비 본문 ≥ 4.5:1, 큰 텍스트 ≥ 3:1
- [ ] 상태 표시는 색 + 텍스트/아이콘 병기 (색맹 대응)
- [ ] `prefers-reduced-motion` 시 가격 flash·캐릭터 워크 사이클 비활성

---

## 8. 적용 순서 (Phase 2 제안)

1. **F0 — 토큰 교체**: `globals.css`를 라이트 토큰으로 전면 교체 + `color-scheme: light` + html/body 배경.
2. **F1 — 공용 컴포넌트**: `Surface`, `Stat`, `Pill`, `Empty`, `Skeleton`, `Sheet`, `Dialog`, `Toast`, `TabPills` 신설 (`frontend/src/components/ui/`).
3. **F2 — Shell 재구성**: `page.tsx` 3-컬럼(Brief / Workspace / Console) + TopNav 분리.
4. **F3 — 핵심 카드**: `DecisionCard` → `StockChartPanel` → `KisPanel` (가장 사용자가 자주 보는 순).
5. **F4 — 작업 패널**: `AutoLoopPanel`, `PortfolioLoopPanel`, `BacktestPanel` 내부 탭화.
6. **F5 — 보조 화면**: `SettingsPanel`(시트화), `AgentOffice` + `PixelOffice` 라이트 톤.
7. **F6 — 라우트 페이지**: `/login`, `/activity`, `/master` 새 셸에 맞춰 정리.
8. **F7 — 카피·온보딩·접근성**: 위 가이드 일괄 적용 + Lighthouse / axe 통과.

각 페이즈 끝에 `npm run lint` + 시각 회귀 (수동 페이지 점검).

---

## 9. 위험 및 완화

| 위험 | 완화 |
|------|------|
| 인라인 스타일 다수 → 일괄 교체 시 회귀 | 컴포넌트 단위 PR, 시각 비교 후 머지 |
| Recharts 컬러 props는 토큰 미지원 | wrapper 함수 `chartColor()`로 토큰 → HEX 변환 일원화 |
| Tailwind v4 `@theme inline` 변수 의존 | `--color-background/foreground` 매핑 갱신 |
| 픽셀아트 캔버스가 라이트에 맞지 않음 | 배경 팔레트만 교체, 캐릭터 sprite는 유지 |
| 사용자 익숙한 다크 → 라이트 변경 거부감 | 초기 진입 시 안내 + (옵션) 다크 토글은 설정 페이지에 향후 가능하도록 토큰 구조 유지 |

---

## 10. 참고 (직접 도입 X, 컨셉만)

- **Toss 증권**: 가격 카드, tabular-nums, "한 줄 요약" 패턴
- **Linear**: 사이드 nav, sheet, status dot, 키보드 단축키
- **Vercel Dashboard**: 라이트 surface + 얇은 그림자, 빈 상태 카피
- **Stripe Dashboard**: KPI 카드 위계, 타임라인 활동 로그
- **React Bits**(reactbits.dev): NumberFlash·SkeletonShimmer·BlurFade 등 마이크로 인터랙션 *영감*
- **Anthropic Skills/frontend-design**: 토큰 우선·컴포넌트 우선·접근성 기본 원칙

---

## 11. 다음 액션 (사용자 확인 요청)

이 컨셉이 의도와 맞는다면 Phase 2부터 순서대로 적용하겠습니다.
다음 중 알려주세요:

1. **레이아웃 3-컬럼(Brief/Workspace/Console)** 컨셉에 동의하는가? (현 50/50 유지 원하면 알려주세요)
2. **다크 모드 토글을 향후 위해 토큰만 남길지**, 아예 제거할지?
3. **온보딩 코치마크**를 도입할지(추가 작업 +) — 또는 인라인 안내만으로 충분한지?
4. Phase 2에서 **F0+F1을 먼저 PR로 묶을지**, 아니면 한 번에 F0~F3까지 진행 후 검토할지?

답변 주시면 바로 토큰 교체와 공용 컴포넌트부터 착수합니다.

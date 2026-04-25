# UI 인벤토리 — Frontend `frontend/src` 현재 상태

> 2026-04-25 기준. Phase 1 산출물. `UI_REDESIGN_LIGHT.md`의 입력 자료.

---

## 1. 라우트

| Route | File | 역할 | 비고 |
|-------|------|------|------|
| `/` | `src/app/page.tsx` | 메인 대시보드 (4탭) | 좌/우 50/50 split, 인증 가드 |
| `/activity` | `src/app/activity/page.tsx` | 사용자 활동 로그 | 거래/분석 이력 |
| `/login` | `src/app/login/page.tsx` | 로그인/가입 + 부트스트랩 | 첫 사용자 → master |
| `/master` | `src/app/master/page.tsx` | 어드민 대시보드 | 사용자/활동/거래 관리 |
| layout | `src/app/layout.tsx` | RootLayout | `lang="ko"`, dark, globals.css |

---

## 2. 컴포넌트 (9개)

| 파일 | 역할 | 주요 props | 핵심 섹션 |
|------|------|-----------|-----------|
| `AgentOffice.tsx` | 9-에이전트 상태 카드 + 활동 피드 | `AgentCard`, `ActivityFeed` | Layer 1/2/3 그룹, status dot, thought bubble |
| `AutoLoopPanel.tsx` | 단일 종목 자동 매매 루프 | `ticker`, `onDecision`, `onTradeRecorded` | 설정 폼, 상태, 로그(120), 결정 차트, 거래내역(80) |
| `BacktestPanel.tsx` | 백테스트 결과 표시 | `result` | 9-KPI 그리드, 자본 곡선, 예측 정확도, 거래리스트 |
| `DecisionCard.tsx` | 최종 매매 결정 카드 | `decision`, `onHumanApproval`, `onOpenSettings` | 색 bar, 신뢰도 게이지, GURU, 합의 바, 시그널 레이더 |
| `KisPanel.tsx` | KIS 증권 연동 (잔고/주문) | `prefillTicker`, `onOpenSettings` | 상태 칩, 잔고/보유, 주문 폼, 승인 워크플로 |
| `PixelOffice.tsx` | 픽셀아트 에이전트 오피스 | `thoughts`, `isRunning` | Canvas 620×390, 9 캐릭터, 타일 이동 |
| `PortfolioLoopPanel.tsx` | 포트폴리오 자동 매매 루프 | `ticker`, `onTradeRecorded` | 시드/유니버스, 후보, 포지션, 거래내역 |
| `SettingsPanel.tsx` | 설정 모달 (5탭) | `isOpen`, `initialTab`, `onClose` | overview/llm/analysis/guru/kis |
| `StockChartPanel.tsx` | 주가 차트 (1M~2Y) | `ticker`, `predictionMarkers`, `tradeMarkers`, `compact` | 시간프레임, 가격, OHLC, 마커, 툴팁 |

상세 분석은 `UI_REDESIGN_LIGHT.md` §4 참조.

---

## 3. 디자인 토큰 (현재 — 다크 기준)

`src/app/globals.css`:

- 배경 5단계: `--bg-base #0C0D10` ~ `--bg-overlay #242730`
- 테두리 4단계: `rgba(255,255,255,0.05~0.16)` + `--border-focus #3182F6`
- 텍스트 4단계: `--text-primary #EAEDF2` ~ `--text-tertiary #4E5867`
- 한국 시장 시그널: `--bull #F04452` (상승) / `--bear #2B7EF5` (하락) / `--hold #8B95A1`
- 브랜드: `--brand #3182F6` (Toss blue)
- Semantic: success/warning/error/info
- Agent status 6종: idle/thinking/analyzing/debating/deciding/done
- Typography: Pretendard (sans), JetBrains Mono (mono), tabular-nums
- Radius: 6/10/14/18/24
- Spacing: 4/8/12/16/20/24/32/40/48 (8pt grid — *선언만 있고 컴포넌트는 인라인으로 임의값 사용 多*)
- Shadow: 4단계 + focus
- Motion: 3 ease + 3 duration + flash/shimmer/pulse 키프레임

---

## 4. 메인 페이지 레이아웃 (`page.tsx`)

```
RootLayout (dark)
└─ FlexContainer (row ≥1260, column <1260)
   ├─ Left Panel (50%, bg-surface)
   │  ├─ Header (로고 + 사용자 + 마켓 인덱스)
   │  └─ Scrollable
   │     ├─ 종목 검색 + 티커 입력
   │     ├─ 인기/최근/즐겨찾기
   │     ├─ Stock Price Card (Toss style)
   │     ├─ Chart Panel
   │     ├─ Tab Pills (analysis/backtest/trading/portfolio)
   │     └─ Tab Content (AnimatePresence)
   └─ Right Panel (50%, bg-base)
      └─ Tab Content
         ├─ analysis: AgentOffice + DecisionCard
         ├─ backtest: BacktestPanel
         ├─ trading: KisPanel
         └─ portfolio: PortfolioLoopPanel
   + Modals: HumanApprovalModal (z200), SettingsPanel (z1000)
   + Login Fallback (인증 안된 경우)
```

핵심 상태: `tab`, `isNarrowLayout`, `isRunning`, `currentUser`, `decision`, `thoughts`, `approvalModal`, `settingsOpen`.

---

## 5. lib & types

- `lib/api.ts` — REST + SSE 클라이언트 (40+ endpoints): auth, stock, analysis, backtest, KIS, auto-loop, portfolio-loop, settings, master.
- `types/index.ts` — `AgentRole/AgentStatus/AgentThought`, `TradeDecision`, `StockIndicators/StockChartPoint`, `BacktestResult/Metrics/PredictionMonitoring`, `KisStatus/Balance/Holding/OrderRequest/Approval`, `AutoLoopStatus/Log`, `PortfolioLoopStatus`, `AppUser/UserRole` 외 30+.

---

## 6. 관찰된 UX/UI 이슈 (요약)

| 카테고리 | 주요 이슈 |
|----------|----------|
| Loading/Empty | 차트·검색·잔고 새로고침 시 시각적 피드백 없음, 빈 보유종목 안내 부재 |
| Error | 재시도 UI 부재, SSE 끊김 메시지 모호, 거절 사유 가독성 낮음 |
| Copy | "판단 주기(거래일)" 모호, 모의/실전 차이 설명 부족, GURU 탭 설명 없음 |
| Spacing | 16/14/18px 인라인 혼재, Activity feed line-height 1, 백테스트 9-칸 dense |
| Accessibility | 모달 role/aria 없음, 색만으로 상태 표현, 포커스 링 일관성 부족 |
| Contrast | text-tertiary on bg-overlay = 2.8:1 (WCAG fail) |
| Hierarchy | System info box가 결정카드 아래, GURU 영역 항상 큰 공간 차지 |
| Onboarding | 최초 진입 시 가이드 없음, 핵심 흐름 (분석→결정→주문) 안내 부재 |

상세 항목은 `UI_REDESIGN_LIGHT.md` §0, §4, §6 참조.

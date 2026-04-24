# UI 전면 개편 — 구현 계획서

## 1. 개요

### 목표
- **좌측 패널**: 토스(Toss) 증권 디자인 시스템 기반 주식 투자 UI
- **우측 패널**: pixel-agents 스타일 픽셀아트 오피스 — 에이전트 실시간 모니터링

### 레이아웃 변경
```
기존: [Sidebar 248px] [Main Content flex-1]
신규: [Left Panel 420px] [Right Panel flex-1]
```

---

## 2. 토스(Toss) 디자인 시스템 분석

### 2.1 핵심 색상 토큰
이미 globals.css에 반영된 토스 기반 색상:
- `--brand: #3182F6` — 토스 시그니처 블루
- `--bull: #F04452` — 한국 시장 상승색 (빨강)
- `--bear: #2B7EF5` — 한국 시장 하락색 (파랑)
- `--bg-base: #0C0D10` — 딥 다크 배경
- `--bg-surface: #141518` — 카드/패널 배경

### 2.2 토스 UI 패턴
1. **대형 숫자 타이포그래피**: 현재가는 24-32px bold
2. **카드 기반 레이아웃**: 둥근 모서리(18-24px), 미세한 테두리
3. **서브 정보**: 작은 텍스트(10-11px), 컬러 변화율
4. **탭 네비게이션**: 필 스타일, 선택 시 강조
5. **리스트 아이템**: 왼쪽 정보 + 오른쪽 값, 터치 하이라이트
6. **버튼**: 주요 CTA는 브랜드 블루, 전체 너비
7. **섹션 구분**: 미세한 구분선 대신 배경색 차이로 구분

### 2.3 토스 인터랙션
- 탭 전환: `AnimatePresence` with slide transition
- 숫자 변경: 색상 flash 애니메이션
- 버튼 클릭: `whileTap={{ scale: 0.96 }}`
- 리스트 클릭: 배경색 전환

---

## 3. Pixel Agents 스타일 분석

### 3.1 핵심 개념
- 각 AI 에이전트 = 픽셀아트 캐릭터
- 에이전트 상태 → 캐릭터 애니메이션
- 오피스 배경 (바닥 타일, 벽, 책상, 모니터)
- 말풍선 (Speech bubbles) = 에이전트 현재 사고
- 레이어/팀별 구역 분리

### 3.2 에이전트 → 캐릭터 매핑
```
Layer 1 (데이터 수집):
  technical_analyst   → 파란 셔츠 캐릭터 (좌상단)
  fundamental_analyst → 보라 셔츠 캐릭터
  sentiment_analyst   → 주황 셔츠 캐릭터
  macro_analyst       → 초록 셔츠 캐릭터 (우상단)

Layer 2 (토론):
  bull_researcher → 빨간 셔츠 캐릭터 (좌중앙)
  bear_researcher → 남색 셔츠 캐릭터 (우중앙)

Layer 3 (결정):
  risk_manager       → 노란 셔츠 캐릭터 (좌하단)
  portfolio_manager  → 흰/회 셔츠 캐릭터 (우하단)
```

### 3.3 캐릭터 상태 → 애니메이션 매핑
```
idle      → 미세한 상하 bob (sin 웨이브, 느림)
thinking  → 손 타이핑 동작 (빠른 bounce), 모니터 글로우
analyzing → 읽기 동작, 고개 살짝 기울기
debating  → 말풍선 표시, 손 올림 (active arms)
deciding  → 황금 글로우, 눈 확대
done      → 초록 ✓ 아이콘, 여유로운 idle
```

### 3.4 오피스 렌더링
- Canvas 2D, requestAnimationFrame 루프
- 크기: 620×390px (logical), CSS로 반응형 스케일
- 타일: 20×20px 체크보드 바닥
- 레이어 구분: 수평 구분선 + 텍스트 레이블
- 책상: 사각형 기반 가구 (어두운 나무색)
- 모니터: 작은 사각형 (화면 글로우 효과)
- 캐릭터: 2px 스케일 픽셀아트 (head/body/legs)

---

## 4. 컴포넌트 구조

### 4.1 신규 컴포넌트
```
frontend/src/components/
  PixelOffice.tsx     ← NEW: Canvas 픽셀 오피스 (핵심 구현)
```

### 4.2 수정 컴포넌트
```
frontend/src/app/page.tsx    ← MODIFY: 2패널 레이아웃으로 전면 재구성
frontend/src/app/globals.css ← MINOR: 픽셀 오피스 관련 CSS 추가
```

### 4.3 유지 컴포넌트
```
AgentOffice.tsx      ← 우측 패널 하단 피드에서 계속 사용
DecisionCard.tsx     ← 좌측 패널 결과 표시
BacktestPanel.tsx    ← 백테스트 탭 내 결과 표시
KisPanel.tsx         ← KIS 탭 내 사용
SettingsPanel.tsx    ← 설정 모달
```

---

## 5. 좌측 패널 (Toss 스타일) 상세 설계

### 5.1 섹션 구조 (위→아래)
```
┌─────────────────────────────────────┐
│ [로고] Korean Trading AI            │
│       AI 멀티에이전트 투자 시스템    │
├─────────────────────────────────────┤
│ 📊 시장 지수 (compact 2-column)     │
│ KOSPI +0.9%  KOSDAQ -0.6%          │
├─────────────────────────────────────┤
│ 🔍 종목 검색 (Toss-style search)    │
│ [삼성전자 · 005930     ▼검색]       │
│ [인기: 삼성전자 SK하이닉스 현대차]  │
├─────────────────────────────────────┤
│ 💹 현재가 카드 (Toss large price)  │
│  삼성전자                           │
│  ₩75,400                           │
│  ▲ 1,800 (+2.45%)                 │
│  [RSI bar] [52주 범위]              │
├─────────────────────────────────────┤
│ [AI 분석] [백테스트] [KIS 매매]     │  ← Pill tab nav
├─────────────────────────────────────┤
│ TAB CONTENT:                        │
│ analysis: PipelineProgress + btn    │
│           + DecisionCard            │
│ backtest: strategy select + btn     │
│           + BacktestPanel (compact) │
│ trading:  KisPanel                  │
├─────────────────────────────────────┤
│ ⚙️ 설정 · ⚠ 투자 위험 안내          │
└─────────────────────────────────────┘
```

### 5.2 토스 스타일 적용 포인트
- **주가 카드**: 회사명 14px bold, 현재가 30px extrabold, 등락 colored
- **탭 네비게이션**: 3개 pill 버튼, 활성탭 브랜드 블루 배경
- **리스트 아이템**: 인기 종목 리스트 (4px 패딩 리스트 아이템 스타일)
- **버튼**: 분석/백테스트 실행 버튼은 전체 너비, 브랜드 블루

---

## 6. 우측 패널 (Pixel Office) 상세 설계

### 6.1 레이아웃 (위→아래)
```
┌─────────────────────────────────────────────┐
│ 에이전트 오피스            [상태 뱃지]        │  ← 헤더 (56px)
│─────────────────────────────────────────────│
│                                             │
│  ╔═══════════════ CANVAS ════════════════╗  │
│  ║  [Layer 1: 데이터 수집]               ║  │
│  ║  [기술] [펀더] [감성] [매크로]        ║  │
│  ║  ─────────────────────────────────   ║  │
│  ║  [Layer 2: 강세/약세 토론]            ║  │
│  ║       [BULL]         [BEAR]          ║  │
│  ║  ─────────────────────────────────   ║  │
│  ║  [Layer 3: 리스크 & 결정]             ║  │
│  ║     [RISK]      [PORTFOLIO]          ║  │
│  ╚═════════════════════════════════════╝  │
│─────────────────────────────────────────────│
│ 실시간 활동 로그 (최근 8개, 스크롤)         │  ← 하단 피드
└─────────────────────────────────────────────┘
```

### 6.2 Canvas 렌더링 파이프라인
1. `drawBackground(ctx, frame)`:
   - 체크보드 바닥 타일 (20×20, 두 가지 어두운 색)
   - 레이어 구분 수평 구분선 + 레이블
   
2. `drawDesk(ctx, cx, cy, accent, isActive)`:
   - 책상 표면 (어두운 나무)
   - 모니터 (화면 글로우 when active)
   - 의자
   
3. `drawCharacter(ctx, cx, cy, meta, status, frame)`:
   - 머리카락 (색상 per agent)
   - 얼굴/눈/입 (상태별 표정)
   - 상체 (셔츠 색상 per agent)
   - 팔 (상태별 포즈 — typing, thinking)
   - 하체/신발
   
4. `drawLabel(ctx, x, y, label, accent, status)`:
   - 이름 레이블 아래 캐릭터

5. Speech Bubbles (HTML overlay, not canvas):
   - `position: absolute` over canvas container
   - 활성 에이전트에만 표시
   - 최근 thought.content truncated
   - 포인터 삼각형
   - 각 에이전트 accent color 테두리

### 6.3 캐릭터 픽셀아트 설계
- 1 "art pixel" = 2×2 canvas pixels (S=2)
- 캐릭터 크기: ~12×24 art pixels = 24×48 canvas pixels
- 프레임 카운터로 애니메이션 구동 (requestAnimationFrame)
- Bob: `sin(frame * 0.06) * 1` (idle), `sin(frame * 0.14) * 2` (active)
- Typing: `sin(frame * 0.2) * 3` for arm Y offset when thinking/analyzing

### 6.4 Speech Bubble 설계
```
[에이전트 이름 · 상태 뱃지]
[thought.content 최대 120자 truncated]
```
- max-width: 180px
- background: var(--bg-elevated) with accent border
- z-index: 10 (canvas 위)
- AnimatePresence for enter/exit

---

## 7. SSE 이벤트 → 캐릭터 상태 매핑

```python
# backend/core/events.py AgentStatus enum
class AgentStatus(str, Enum):
    IDLE = "idle"
    THINKING = "thinking"
    ANALYZING = "analyzing"
    DEBATING = "debating"
    DECIDING = "deciding"
    DONE = "done"
```

```
frontend thought.status → canvas character animation:

"idle"     → gentle bob, neutral face, dim monitor
"thinking" → fast typing (arms bounce), monitor glow
"analyzing"→ head slight tilt, reading posture
"debating" → speech bubble visible, arms raised
"deciding" → gold glow, wide eyes
"done"     → ✓ checkmark above head, relaxed posture
```

---

## 8. 백엔드 로직 검증 체크리스트

### 8.1 SSE 스트리밍
- [ ] `startAnalysis()` → POST /api/analyze/start → session_id 반환
- [ ] `streamAnalysis()` → GET /api/analyze/stream?session_id= → SSE events
- [ ] AgentThought 이벤트: role, status, content, timestamp 모두 존재
- [ ] TradeDecision 이벤트: action, ticker, confidence, reasoning, agents_summary
- [ ] 스트림 종료 후 isRunning = false 처리 (finally callback)

### 8.2 오케스트레이터 흐름
- [ ] 8개 에이전트 모두 thought 이벤트 emit
- [ ] Layer 1 → Layer 2 순서 보장 (Layer 1 완료 후 Layer 2 시작)
- [ ] final_decision 이벤트가 마지막에 emit
- [ ] session queue cleanup after stream ends

### 8.3 KIS API
- [ ] 인증 미설정 시 graceful error (400/422, not 500)
- [ ] mock mode: TR_ID 앞글자 T→V, J→V, C→V 변환 확인
- [ ] 잔고 API response parsing (output2 list vs dict)
- [ ] 주문 전 ticker/qty/price 유효성 검사

### 8.4 백테스트
- [ ] look-ahead 방지: as_of_date 파라미터 확인
- [ ] agent 백테스트 SSE 이벤트 포맷: {step, total, date, signal, confidence}
- [ ] 결과 equity_curve 데이터 포맷: [{date, value}]

---

## 9. 구현 순서

### Phase 1: PixelOffice 컴포넌트 (최우선)
1. `PixelOffice.tsx` 생성
   - Canvas 초기화 + resize 처리
   - requestAnimationFrame 게임루프
   - `drawBackground()` — 바닥/벽/레이어 구분선
   - `drawDesk()` — 책상/모니터/의자
   - `drawCharacter()` — 픽셀아트 캐릭터 (상태별 변형)
   - `drawLabel()` — 이름 레이블
   - Speech bubble HTML overlay
   - Props: `thoughts`, `activeAgents`

### Phase 2: page.tsx 레이아웃 재구성
1. 사이드바 제거
2. 2-패널 레이아웃 (Left 420px + Right flex-1)
3. 좌측 패널: 로고 + 시장지수 + 종목카드 + 탭 + 탭별 콘텐츠
4. 우측 패널: PixelOffice + ActivityFeed
5. 기존 로직 (handleAnalyze, handleBacktest, SSE) 유지

### Phase 3: 세부 Toss 스타일링
1. 주가 카드 → 대형 숫자 표시
2. 탭 네비게이션 → 필 스타일
3. 리스트 아이템 → 인기종목 스타일

### Phase 4: 로직 검증 & 수정
1. SSE 이벤트 처리 확인
2. KIS API 에러 처리 강화
3. 백테스트 데이터 검증

### Phase 5: 엣지케이스 & 테스트
1. 분석 중 탭 전환 → SSE 계속 수신 확인
2. 네트워크 에러 → UI 복구
3. KIS 자격증명 미설정 시 적절한 안내
4. 여러 빠른 클릭 → debounce 확인

### Phase 6: 최종 커밋 & 푸시

---

## 10. 위험 요소 및 대응

| 위험 | 대응 방안 |
|------|-----------|
| Canvas 좌표 계산 복잡성 | 에이전트 위치를 상수로 명확히 정의, 단위 테스트 |
| Speech bubble 오버레이 위치 | canvas 내 픽셀 좌표 → % → CSS absolute 변환 |
| 분석 중 컴포넌트 언마운트 시 SSE cleanup | AbortController 사용, cleanup refs |
| requestAnimationFrame 메모리 누수 | useEffect return에서 cancelAnimationFrame |
| 빠른 클릭으로 중복 분석 세션 | isRunning guard + 버튼 disabled |
| KIS mock/real 모드 혼동 | 명확한 MOCK 뱃지 표시, 주문 전 확인 모달 |

---

## 11. 최종 품질 체크리스트

### UI/UX
- [ ] 모든 버튼에 hover/active 상태 있음
- [ ] 로딩 중 skeleton 또는 스피너
- [ ] 에러 상태 명확한 메시지
- [ ] 결정(Decision) 없을 때 적절한 빈 상태
- [ ] 탭 전환 시 부드러운 애니메이션
- [ ] 숫자 데이터 tabular-nums 적용

### 기술
- [ ] TypeScript 타입 오류 0개
- [ ] 콘솔 에러/경고 0개
- [ ] requestAnimationFrame cleanup
- [ ] SSE EventSource cleanup
- [ ] 무한 루프/메모리 누수 없음

### 접근성
- [ ] 버튼에 적절한 disabled 상태
- [ ] 로딩 중 버튼 재클릭 방지
- [ ] 에러 메시지 사용자 이해 가능

---

*작성일: 현재 세션*  
*기반 커밋: 25c1a17 (KIS OpenAPI 통합)*

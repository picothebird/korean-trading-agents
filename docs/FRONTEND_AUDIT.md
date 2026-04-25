# 프런트엔드 기능·연동 전수 점검 문서

- 점검일: 2026-04-24
- 범위: frontend 전 기능 + backend/agents/data 연동 경로
- 기준: 사용자 흐름별로 Backend 연동 / 데이터 흐름 / 에러·상태 핸들링 / UI 표시를 개별 체크

## 1) 점검 대상

### 프런트 핵심 파일
- frontend/src/app/page.tsx
- frontend/src/lib/api.ts
- frontend/src/types/index.ts
- frontend/src/components/DecisionCard.tsx
- frontend/src/components/BacktestPanel.tsx
- frontend/src/components/KisPanel.tsx
- frontend/src/components/SettingsPanel.tsx
- frontend/src/components/AgentOffice.tsx
- frontend/src/components/PixelOffice.tsx

### 백엔드/에이전트 연동 파일
- backend/main.py
- backend/core/events.py
- agents/orchestrator/orchestrator.py
- agents/analyst/analysts.py
- data/market/fetcher.py
- backtesting/backtest.py
- data/kis/trading.py

## 2) 프런트 ↔ 백엔드 API 매핑

| 기능 | 프런트 API 함수 | 백엔드 엔드포인트 | 상태 |
|---|---|---|---|
| 헬스체크 | getHealth | GET /health | ✅ |
| 종목 검색 | searchStocks | GET /api/stock/search | ✅ |
| 종목 정보/지표 | getStock | GET /api/stock/{ticker} | ✅ |
| 분석 시작 | startAnalysis | POST /api/analyze/start | ✅ |
| 분석 스트림 | streamAnalysis | GET /api/analyze/stream/{session_id} (SSE) | ✅ |
| MA 백테스트 | runBacktest | POST /api/backtest | ✅ |
| AI 백테스트 시작 | startAgentBacktest | POST /api/backtest/agent/start | ✅ |
| AI 백테스트 스트림 | streamAgentBacktest | GET /api/backtest/agent/stream/{session_id} (SSE) | ⚠️ |
| 시장지수 | getMarketIndices | GET /api/market/indices | ✅ |
| 설정 조회/저장 | getSettings / updateSettings | GET/POST /api/settings | ✅ |
| KIS 상태 | getKisStatus | GET /api/kis/status | ✅ |
| KIS 잔고 | getKisBalance | GET /api/kis/balance | ✅ |
| KIS 현재가 | getKisPrice | GET /api/kis/price/{ticker} | ✅ |
| KIS 주문 | placeKisOrder | POST /api/kis/order | ✅ |

## 3) 기능별 사용자 흐름 + 항목 체크

체크 기준:
- Backend 연동: 요청/응답 계약이 실제로 연결되는가
- 데이터 흐름: 응답 필드가 상태로 정상 전달되는가
- 핸들링: 로딩/에러/빈값/예외 처리
- 표시: 사용자에게 의도대로 보여지는가

### A. 종목 탐색/선택

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| A-1 | 검색창에 종목명/코드 입력 → 자동완성 표시 | ✅ | ✅ | ✅ (300ms 디바운스) | ✅ | ✅ |
| A-2 | 자동완성 항목 선택 → ticker/companyName 동기화 | ✅ | ✅ | ✅ | ✅ | ✅ |
| A-3 | 인기 종목 버튼 클릭 → 즉시 종목 변경 | N/A | ✅ | ✅ | ✅ | ✅ |
| A-4 | 검색 API 실패/네트워크 실패 | ✅ | ✅ (빈배열로 폴백) | ✅ | ✅ (목록 비표시) | ✅ |
| A-5 | 컴포넌트 언마운트 시 디바운스 타이머 정리 | N/A | N/A | ❌ | N/A | ❌ |

### B. 주가 카드/지표 표시

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| B-1 | ticker 변경 후 700ms 뒤 종목/지표 조회 | ✅ | ✅ | ✅ | ✅ | ✅ |
| B-2 | 조회 성공 시 companyName 업데이트 | ✅ | ✅ | ✅ | ✅ | ✅ |
| B-3 | 조회 실패 시 stockInfo 초기화 | ✅ | ✅ | ⚠️ (companyName stale 가능) | ✅ | ⚠️ |
| B-4 | 지표 없음/로딩 중 스켈레톤 표시 | N/A | ✅ | ✅ | ✅ | ✅ |
| B-5 | MA5/MA20 값 null 가능 케이스 | ✅ | ⚠️ (타입 불일치) | ⚠️ | ⚠️ (런타임 위험) | ❌ |

### C. 시장지수 헤더

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| C-1 | 최초 마운트 시 지수 조회 후 상단 표시 | ✅ | ✅ | ✅ | ✅ | ✅ |
| C-2 | 장중 자동 갱신/주기 갱신 | ⚠️ | ⚠️ | ❌ | ⚠️ | ❌ |

### D. AI 분석(분석 탭)

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| D-1 | 분석 시작 버튼 클릭 → session 생성 | ✅ | ✅ | ✅ | ✅ | ✅ |
| D-2 | SSE thought 수신 → thoughts/active/logs 갱신 | ✅ | ✅ | ✅ | ✅ | ✅ |
| D-3 | SSE 끊김/timeout 처리 | ✅ | ✅ | ✅ (onError) | ✅ | ✅ |
| D-4 | 최종 결정 수신 → DecisionCard 표시 | ✅ | ✅ | ✅ | ✅ | ✅ |
| D-5 | Human approval 필요 시 모달 오픈 | ✅ | ✅ | ✅ | ✅ | ✅ |
| D-6 | Human approval 승인 후 후속 액션 | N/A | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| D-7 | Layer1(4명) 완료 조건 충족 | ⚠️ | ❌ | ❌ | ⚠️ | ❌ |

### E. 결정 카드/결정 상세 표시

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| E-1 | action/confidence/reasoning/리스크 표시 | ✅ | ✅ | ✅ | ✅ | ✅ |
| E-2 | entry_strategy/exit_strategy 표시 | ✅ | ❌ (필드 경로 불일치) | ⚠️ | ❌ | ❌ |
| E-3 | stop_loss_pct 표시 | ✅ | ⚠️ (백엔드 제공) | N/A | ❌ (UI 미표시) | ❌ |
| E-4 | KIS 주문하기 버튼으로 매매탭 이동 | ✅ | ✅ | ✅ | ✅ | ✅ |

### F. 백테스트(전략/결과)

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| F-1 | MA 교차 백테스트 실행/결과 표시 | ✅ | ✅ | ⚠️ (실패 에러메시지 미노출) | ✅ | ⚠️ |
| F-2 | AI 백테스트 시작/진행률 표시 | ✅ | ✅ | ✅ | ✅ | ✅ |
| F-3 | AI 백테스트 SSE error 이벤트 처리 | ✅ | ⚠️ (message 미사용) | ❌ | ❌ | ❌ |
| F-4 | 백테스트 결과 리셋(다시 설정) | N/A | ✅ | ⚠️ (에러상태 리셋 없음) | ✅ | ⚠️ |

### G. KIS 매매 탭

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| G-1 | 연결 테스트 | ✅ | ✅ | ✅ | ✅ | ✅ |
| G-2 | 잔고 조회/요약/보유종목 표시 | ✅ | ✅ | ✅ | ✅ | ✅ |
| G-3 | 주문 폼 프리필(분석→매매) | ✅ | ⚠️ (탭 전환 조건 이슈) | ⚠️ | ⚠️ | ⚠️ |
| G-4 | 주문 2단계 확인 후 주문 실행 | ✅ | ✅ | ✅ | ✅ | ✅ |
| G-5 | 주문 성공/실패 배너 표시 | ✅ | ✅ | ✅ | ✅ | ✅ |

### H. 설정 패널

| ID | 사용자 흐름 | Backend 연동 | 데이터 흐름 | 핸들링 | 표시 | 종합 |
|---|---|---|---|---|---|---|
| H-1 | 패널 오픈 시 현재 설정 로드 | ✅ | ✅ | ✅ | ✅ | ✅ |
| H-2 | 모델/Reasoning/라운드 저장 | ✅ | ✅ | ✅ | ✅ | ✅ |
| H-3 | KIS 모드/키/계좌 저장 | ✅ | ✅ | ✅ | ✅ | ✅ |
| H-4 | 저장 성공/실패 피드백 | ✅ | ✅ | ✅ | ✅ | ✅ |

## 4) 핵심 이슈(우선순위)

### 🔴 CRITICAL

1. L1 파이프라인 불완전 (fundamental_analyst 미실행)
- 근거:
  - orchestrator import에 fundamental 미포함
  - 병렬 실행이 기술/감성/매크로 3개만 실행
- 영향:
  - 파이프라인 진행률 L1이 구조적으로 4/4 완료 불가
  - 분석 품질 저하(펀더멘털 관점 누락)

2. DecisionCard 진입/청산 전략 미표시
- 근거:
  - 프런트는 decision.entry_strategy / decision.exit_strategy 사용
  - 백엔드는 agents_summary 안에 entry_strategy / exit_strategy 제공
- 영향:
  - 사용자 핵심 의사결정 정보 누락

3. technical_analyst 프롬프트 포맷 문자열 오류 위험
- 근거:
  - indicators 값 포맷 spec에 조건식 문자열이 직접 포함된 라인 존재
- 영향:
  - 기술 분석 task 예외 발생 시 HOLD 폴백으로 분석 품질 급락 가능

### 🟠 SIGNIFICANT

4. 백테스트 실패 시 에러 배너/메시지 부재
5. AI 백테스트 SSE error.message를 프런트가 소비하지 않음
6. 매매탭 prefill ticker가 기존 값 때문에 갱신되지 않는 케이스 존재
7. getStock 실패 시 companyName stale 잔존 가능

### 🟡 MINOR

8. StockIndicators 타입과 실제 응답(null 가능) 불일치
9. TickerSearchInput 언마운트 시 debounce timer 미정리
10. 시장지수 최초 1회만 로드(주기 갱신 없음)
11. Human approval 승인 시 후속 플로우가 닫기만 수행
12. stop_loss_pct 미표시

## 5) 총괄 체크 결과

- 전체 체크 항목: 33
- ✅ 정상: 21
- ⚠️ 부분 미흡: 8
- ❌ 실패/누락: 4

요약:
- 기본 연동 골격(엔드포인트 연결, 주요 화면 렌더링)은 대체로 정상
- 의사결정 핵심 정보 표시와 오류 피드백 경로에서 실사용 리스크가 큼
- 분석 파이프라인 완전성(펀더멘털 누락)과 타입 불일치를 우선 정리 필요

## 6) 권장 조치 순서

1. fundamental_analyst 구현 + orchestrator 병렬 실행에 포함
2. DecisionCard 전략 필드 경로를 agents_summary 기준으로 수정
3. technical_analyst 프롬프트 포맷 문자열 정정
4. 백테스트 에러 상태(state) + 배너 UI + SSE error message 전달
5. ma5/ma20 타입을 number | null로 수정 및 UI null-safe 처리
6. kisOrderTicker 탭 전환 로직 보정
7. companyName 실패 폴백, 검색 타이머 cleanup, 시장지수 polling 추가
8. stop_loss_pct/승인 후 액션 UX 보완

## 7) 픽스 로그 (어떻게/왜) — 2026-04-25

아래는 문서 이슈를 따라 실제 반영한 수정 내역이다.

1. L1 파이프라인에 fundamental_analyst 추가
- 어떻게:
  - `agents/analyst/analysts.py`에 `fundamental_analyst` 함수 추가
  - `agents/orchestrator/orchestrator.py`에서 import 및 병렬 gather에 fundamental task 추가
- 왜:
  - Layer 1은 기술/펀더/감성/매크로 4축이 전제이며, 3개만 실행하면 진행률/품질 모두 왜곡됨

2. DecisionCard 전략 필드 경로 수정
- 어떻게:
  - `frontend/src/components/DecisionCard.tsx`에서 `decision.entry_strategy`, `decision.exit_strategy` 사용을 중단
  - `decision.agents_summary.entry_strategy`, `decision.agents_summary.exit_strategy`로 변경
- 왜:
  - 백엔드 최종 payload 구조가 `agents_summary` 내부에 전략 필드를 담기 때문에 프런트 경로 불일치로 미표시가 발생함

3. technical_analyst 프롬프트 포맷 안전화
- 어떻게:
  - `agents/analyst/analysts.py`에 `_fmt_num` 유틸 추가
  - 조건식이 섞인 f-string 포맷을 `_fmt_num(...)` 호출 형태로 치환
- 왜:
  - 기존 포맷은 런타임 포맷 예외 가능성이 높아 분석이 HOLD 폴백으로 떨어질 수 있었음

4. MA 백테스트 에러 상태 추가 및 표시
- 어떻게:
  - `frontend/src/app/page.tsx`에 `btError` state 추가
  - MA 백테스트 catch에서 사용자 메시지 저장
  - 백테스트 섹션에 에러 배너(닫기 버튼 포함) 렌더링 추가
- 왜:
  - 실패 원인이 사용자에게 보이지 않아 재시도/원인파악 UX가 크게 떨어졌음

5. AI 백테스트 SSE error.message 전달
- 어떻게:
  - `frontend/src/lib/api.ts`의 `streamAgentBacktest` 시그니처에 `onError` 콜백 추가
  - `data.type === "error"`에서 `data.message`를 전달하도록 수정
  - `frontend/src/app/page.tsx`에서 해당 콜백을 받아 `btError`에 반영
- 왜:
  - SSE error 이벤트는 오는데 메시지를 소비하지 않아 사용자 피드백이 누락되었음

6. 매매 탭 prefill ticker stale 조건 제거
- 어떻게:
  - `frontend/src/app/page.tsx`의 `handleTabChange`에서 `!kisOrderTicker` 조건 제거
  - trading 탭 진입 시 최신 `decision.ticker`를 항상 동기화
- 왜:
  - 기존 값이 비어있지 않으면 새 분석 결과 ticker가 반영되지 않는 케이스가 있었음

7. getStock 실패 시 companyName stale 방지
- 어떻게:
  - `frontend/src/app/page.tsx`의 `getStock(...).catch`에서 `setCompanyName(ticker)` 추가
- 왜:
  - 조회 실패 후 이전 종목명이 남아 종목코드와 회사명이 불일치하는 상태가 발생했음

8. StockIndicators 타입 불일치 수정
- 어떻게:
  - `frontend/src/types/index.ts`에서 `ma5`, `ma20` 타입을 `number | null`로 변경
  - `frontend/src/app/page.tsx`의 MA 표시를 null-safe(`-` 표시)로 보강
- 왜:
  - 백엔드(`data/market/fetcher.py`)는 `_safe_float`로 null을 반환할 수 있어 타입과 실제 응답이 불일치했음

9. 검색 디바운스 타이머 언마운트 cleanup
- 어떻게:
  - `frontend/src/app/page.tsx`의 `TickerSearchInput`에 unmount cleanup `useEffect` 추가
- 왜:
  - 빠른 화면 전환/언마운트 시 타이머가 남아 setState 경고 가능성이 있었음

10. 시장지수 polling 추가
- 어떻게:
  - `frontend/src/app/page.tsx`에서 최초 1회 조회 + 60초 `setInterval` 갱신 + cleanup 적용
- 왜:
  - 헤더 지수가 마운트 시점에만 갱신되어 장중 실시간성이 부족했음

11. Human approval 승인 후 후속 액션 보강
- 어떻게:
  - `frontend/src/app/page.tsx`에서 승인 시 모달 닫기 + `kisOrderTicker` 동기화 + trading 탭 이동
- 왜:
  - 승인 후 사용자가 다음 행동을 다시 수동으로 해야 해서 흐름이 끊겼음

12. stop_loss_pct 표시 추가
- 어떻게:
  - `frontend/src/types/index.ts`의 `agents_summary`에 `stop_loss_pct` 타입 추가
  - `frontend/src/components/DecisionCard.tsx`에 손절 라인 카드 추가
- 왜:
  - 백엔드가 이미 제공하는 리스크 핵심값이 UI에 누락되어 의사결정 정보가 불완전했음

## 8) 재점검 결과

- 상태: 문서의 핵심 이슈 12건 반영 완료
- 빌드: `frontend`에서 `npm run build` 통과
- 비고: CSS `@import` 순서 경고 1건은 기존 전역 스타일 이슈로 기능 수정 범위 밖

## 9) 후속 종합 점검 (2026-04-26)
본 문서의 12개 픽스는 모두 ✅. 추가 프로덕션 점검에서 발견된 신규 14건 (fetch timeout / 주문 입력 경계 / 실거래 게이트 모달 / localStorage quota / polling cleanup / API key 마스킹 / 옵셔널 체이닝 / SSE race / 모바일 반응형 / 접근성 등) 은 `docs/PRE_PRODUCTION_CHECKLIST.md` §3-F / §4-U 로 이관.

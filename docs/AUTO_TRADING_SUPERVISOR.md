# AUTO TRADING SUPERVISOR

## 1. 현재 구조 점검 (요청 시점 기준)

### 1.1 기존 상태
- 분석 파이프라인: `run_analysis()` 기반 단회성 실행은 구현되어 있었음.
- 자동 루프: 프런트 `AutoLoopPanel` 내부 `setInterval` 기반으로 동작.
- 주문: KIS 주문 API(`/api/kis/order`)는 존재.
- 백테스트: 단순/에이전트 백테스트 및 `decision_interval_days` 지원.

### 1.2 한계점
- 루프 실행 주체가 브라우저였음:
  - 탭 종료/새로고침/네트워크 단절 시 루프 상태가 소실됨.
  - 서버가 보유 포지션/실행 이력의 단일 진실원(source of truth)이 아님.
- 제반 비용/시장 요소 반영이 분산되어 있었음:
  - 수수료/슬리피지/세금/감독 레벨의 일관된 서버 정책 부재.
- 감독(슈퍼바이즈) 정책 부재:
  - `requires_human_approval`, 위험도에 따른 차등 차단 정책이 루프 엔진 수준에서 미흡.
- 부분 매수/매도(리밸런싱 느낌) 정책 부재:
  - 확신도/리스크 기반의 단계적 비중 조절이 약함.

## 2. 이번 구현

## 2.1 서버 상주 자동매매 루프 엔진 추가
- 파일: `backend/services/auto_trading.py`
- 핵심 기능:
  - 서버 상주 루프 실행(브라우저와 분리)
  - 모의/실전 공통 사이클
  - 수수료/슬리피지/매도세 반영
  - KRX 호가단위/수량단위 반영(모의/백테스트)
  - 거래정지/시장경고/상하한가 가드
  - 감독 레벨(`strict`, `balanced`, `aggressive`) 반영
  - 세션 모드(`regular_only`, `regular_and_after_hours`) 분리
  - 부분 매수/매도 비중 조절 로직
  - 루프 로그/결정 히스토리/주문 히스토리/모의계좌 상태 집계

## 2.2 자동 루프 API 추가
- 파일: `backend/main.py`
- 엔드포인트:
  - `POST /api/auto-loop/start`
  - `POST /api/auto-loop/stop/{loop_id}`
  - `GET /api/auto-loop/status/{loop_id}`
  - `GET /api/auto-loop/list`
- 서버 종료 시 루프 정리:
  - lifespan shutdown에서 `auto_trading_supervisor.shutdown()` 호출

## 2.3 프런트 API/타입 확장
- 파일:
  - `frontend/src/types/index.ts`
  - `frontend/src/lib/api.ts`
- 추가 항목:
  - auto-loop 시작/중지/상태조회 타입/함수
  - 모의계좌/루프통계/로그/결정/주문 이력 타입

## 2.4 AutoLoopPanel 서버 제어 전환
- 파일: `frontend/src/components/AutoLoopPanel.tsx`
- 변경 내용:
  - 브라우저 내부 주기 실행 -> 서버 루프 시작/중지 API 호출 방식으로 전환
  - 주기적으로 서버 상태 polling하여 다음 정보를 표시:
    - 사이클 상태/다음 실행 시각
    - 결정 추이
    - 최근 주문
    - 루프 로그
    - 모의계좌 상태
    - 루프 통계
  - 설정 항목 확장:
    - 슬리피지(bps), 매도세(bps), 최대 비중(%), 감독 레벨, 모의 초기자본
    - 세션 모델(정규장 전용 / 정규+시간외)

## 3. 의사결정/거래 정책

## 3.1 사이클 흐름
1. `run_analysis()` 실행
2. 신뢰도/감독 레벨 규칙 체크
3. 현재가 조회
4. 목표 비중 대비 델타 계산(부분 매수/매도)
5. 모의 또는 실전 주문 실행
6. 로그/히스토리/계좌 상태 갱신

## 3.2 감독 레벨
- `strict`:
  - 인간 승인 필요 또는 고위험(`HIGH`, `CRITICAL`)이면 주문 차단
  - 포지션 증액 강도 낮춤
- `balanced`:
  - 인간 승인 + 고위험 조합에서 차단
  - 기본 강도
- `aggressive`:
  - 차단 완화
  - 포지션 증액 강도 높임

## 3.3 비용 반영
- 모의 체결가:
  - 매수: `price * (1 + slippage_bps)`
  - 매도: `price * (1 - slippage_bps)`
- 수수료: `fee_bps`
- 매도세: `tax_bps` (매도 시)

## 4. 기존 컴포넌트와 수준 맞추는 방법

## 4.1 이미 맞춘 부분
- 기존 패널 스타일/레이아웃 유지
- 기존 Decision/Trade 시각화 흐름 유지
- 기존 페이지 연동 콜백(`onDecision`, `onTradeRecorded`) 유지

## 4.2 추가 권장(다음 단계)
1. 루프 상태 SSE 도입
- 현재는 polling 기반. 이벤트성 실시간 감도를 높이려면 `/api/auto-loop/stream/{loop_id}` 추가 권장.

2. 다종목 포트폴리오 루프
- 현재는 단일 ticker 루프. 다종목 비중 재분배(목표 합계 100%) 엔진 추가 필요.

3. 실전 모드 계좌 동기화 강화
- 주문 직후/주기별 잔고 조회를 통해 보유수량/평단 추정 오차 최소화.

4. 승인 워크플로우
- `requires_human_approval=true` 시 프런트 승인 버튼 -> 백엔드 승인 API -> 대기 주문 실행.

5. 전략 프로파일
- 보수/중립/공격 프리셋을 settings로 저장해서 재사용.

## 5. 운영 주의사항
- 본 기능은 연구/실험 목적이며 투자 손실 책임은 사용자에게 있음.
- 실전 모드 사용 전 반드시 모의 모드로 충분한 검증이 필요.
- 서버 재시작 시 인메모리 루프 상태는 초기화됨(영속화 필요 시 DB/Redis 도입). → `docs/PRE_PRODUCTION_CHECKLIST.md §2-C1` 에서 MongoDB 영속화 + 자동 재개 작업으로 격상 처리 예정.

## 6. 빠른 테스트 절차
1. `POST /api/auto-loop/start` (paper_trade=true)
2. `GET /api/auto-loop/status/{loop_id}` 반복 조회
3. `decision_history`, `trade_history`, `paper_account`, `logs` 값 변화 확인
4. 프런트 Trading 탭에서 동일 정보 표시 확인
5. 종료 시 `POST /api/auto-loop/stop/{loop_id}` 호출

## 7. 한국시장 수치/누수 통제 상세 문서
- 상세 감사 문서: `docs/KOREAN_MARKET_REALISM_AUDIT.md`
- 포함 내용:
  - 한국 주식시장 수치 가정(호가단위/장시간/비용/제약) 반영 여부 매트릭스
  - mock/backtest 미래정보 누수 통제 점검 및 개선 사항
  - 현재 미반영 항목과 우선순위 개선 목록

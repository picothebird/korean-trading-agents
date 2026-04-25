# BACKEND_AUDIT

## 1) 목적 / 범위
- 기준: 현재 저장소의 백엔드 전체 파트 역할/연동/완성도 전수 점검
- 포함 범위:
  - backend/main.py
  - backend/core/config.py
  - backend/core/user_runtime_settings.py
  - backend/core/events.py
  - backend/core/llm.py
  - agents/analyst/analysts.py
  - agents/orchestrator/orchestrator.py
  - data/market/fetcher.py
  - data/kis/client.py
  - data/kis/trading.py
  - backtesting/backtest.py
  - run_server.py

## 2) 파트별 역할 정의
- [x] backend/main.py: REST/SSE 라우팅, 세션 상태 관리, 요청 검증, 각 도메인 모듈 오케스트레이션
- [x] backend/core/config.py: 런타임 설정 로딩(.env)
- [x] backend/core/user_runtime_settings.py: 사용자 설정 Mongo 영속화/복호화 런타임 주입
- [x] backend/core/events.py: 에이전트 사고 스트림 큐 및 SSE 직렬화
- [x] backend/core/llm.py: OpenAI Responses API 클라이언트 래퍼
- [x] agents/analyst/analysts.py: 기술/펀더멘털/감성/매크로 분석 에이전트 + 백테스트용 경량 시그널
- [x] agents/orchestrator/orchestrator.py: 분석 병렬 실행, 토론, 리스크, 최종 의사결정 파이프라인
- [x] data/market/fetcher.py: 종목/지수/뉴스/기술지표 데이터 수집
- [x] data/kis/client.py: KIS 토큰/공통 REST 호출
- [x] data/kis/trading.py: KIS 현재가/잔고/주문 도메인 API
- [x] backtesting/backtest.py: 단순/AI 백테스트 엔진 및 성과 계산
- [x] run_server.py: 서버 실행 진입점

## 3) 전수 체크리스트 (문서 기준 항목별 체크)
### 3.1 API 레이어
- [x] 분석 시작/스트림/결과 조회 엔드포인트가 정상 연결되어 있음
- [x] 백테스트(동기/에이전트) 엔드포인트가 정상 연결되어 있음
- [x] 설정 업데이트 엔드포인트가 런타임 + 영속화를 모두 수행함
- [x] KIS 상태/가격/잔고/주문 엔드포인트가 존재함
- [x] SSE 종료 시 done 이벤트가 항상 송신됨
- [x] SSE 오류 케이스가 명시적 error 이벤트로 전달됨 (이번 픽스)

### 3.2 오케스트레이션/에이전트
- [x] 4개 분석 에이전트 병렬 실행 구조 확인
- [x] 토론/리스크/포트폴리오 단계 순차 파이프라인 확인
- [x] LLM 실패 시 전체 파이프라인이 무조건 중단되지 않도록 완화됨 (이번 픽스)
- [x] Kelly 계산 입력 비정상/누락 시 안전 동작하도록 보강됨 (이번 픽스)

### 3.3 LLM/설정 안정성
- [x] fast/deep 모델 분리 및 reasoning 조건부 적용 확인
- [x] API 키 미설정 시 명시적 오류 메시지 반환 (이번 픽스)
- [x] reasoning_effort 값 검증 강화 (Literal) (이번 픽스)
- [x] max_debate_rounds 범위 검증 강화 (1~8) (이번 픽스)

### 3.4 데이터/백테스트/KIS
- [x] 기술지표 계산 시 NaN/Inf 방어 처리 존재
- [x] 백테스트는 look-ahead 방지(as_of_date) 경로 사용
- [x] 백테스트 결과 직렬화 포맷 통일 (REST/SSE) (이번 리팩터링)
- [x] KIS 토큰 캐시/만료 재발급/모의 TR 변환 로직 확인

### 3.5 프런트 연동 일관성
- [x] 분석 SSE의 error 이벤트를 프런트에서 처리하도록 반영 (이번 픽스)
- [x] 기존 final_decision/done 흐름과 충돌 없이 유지됨

## 4) 발견 이슈와 조치
### [완료] ISSUE-01 분석 실패 시 SSE 에러 정보 누락
- 증상: 분석 파이프라인 에러 시 프런트에서 실패 원인을 받지 못함
- 조치: `/api/analyze/stream/{session_id}`에서 `type=error` 이벤트 송신 추가
- 상태: [x] 완료

### [완료] ISSUE-02 백테스트 결과 직렬화 중복
- 증상: 동기 백테스트와 에이전트 백테스트 결과 매핑 코드가 중복
- 조치: `_serialize_backtest_result()` 공통 함수로 통합
- 상태: [x] 완료

### [완료] ISSUE-03 기술분석 프롬프트 숫자 포맷 취약
- 증상: nullable 지표를 직접 포맷해 예외 가능
- 조치: `_fmt_num()` 기반 null-safe 포맷으로 변경
- 상태: [x] 완료

### [완료] ISSUE-04 백테스트 시그널 프롬프트 null 포맷 취약
- 증상: MA/가격 null 값 포맷 시 예외 가능
- 조치: 백테스트 프롬프트도 `_fmt_num()` 사용
- 상태: [x] 완료

### [완료] ISSUE-05 토론 단계 LLM 실패 시 전체 분석 중단 위험
- 증상: bull/bear 응답 생성 예외가 상위로 전파될 수 있음
- 조치: 각 라운드 LLM 호출 try/except로 국소 실패 처리
- 상태: [x] 완료

### [완료] ISSUE-06 리스크 매니저 평균 신뢰도 0분모 가능
- 증상: confidence 누락 시 division by zero 가능
- 조치: 평균 신뢰도 기본값/클램프/파싱 방어 추가
- 상태: [x] 완료

### [완료] ISSUE-07 API 키 미설정 상태의 오류 메시지 불명확
- 증상: OpenAI SDK 내부 오류만 노출될 수 있음
- 조치: LLM 클라이언트 생성 전 키 존재 여부 명시 검증
- 상태: [x] 완료

### [완료] ISSUE-08 설정 값 검증 약함
- 증상: reasoning_effort/max_debate_rounds 무제한 입력 가능
- 조치: Pydantic Literal + Field 범위 검증 추가
- 상태: [x] 완료

### [완료] ISSUE-09 프런트 분석 스트림 error 이벤트 미처리
- 증상: 서버가 error 이벤트를 보내도 UI 에러 배너 반영 누락
- 조치: frontend/src/lib/api.ts `streamAnalysis`에 `type=error` 분기 추가
- 상태: [x] 완료

## 5) 픽스 로그 (어떻게 / 왜)
- [x] 어떻게: 분석 SSE에서 final_decision이 없는 error 상태를 분기해 JSON 에러 이벤트 송신
  - 왜: 사용자에게 실패 원인을 즉시 전달하지 않으면 재시도/설정 수정 판단이 어려움
- [x] 어떻게: 백테스트 결과 매핑을 단일 함수로 통합
  - 왜: API 포맷 드리프트 및 누락 필드 회귀를 줄이기 위함
- [x] 어떻게: LLM 프롬프트 숫자 포맷을 모두 null-safe 헬퍼로 통일
  - 왜: 데이터 소스 특성상 일부 지표 결측이 빈번하여 런타임 안정성이 중요함
- [x] 어떻게: 토론 단계 LLM 호출을 라운드 단위 예외 격리
  - 왜: 부분 실패가 전체 파이프라인 실패로 확대되는 것을 방지
- [x] 어떻게: Kelly 입력 신뢰도에 대한 파싱 방어/범위 클램프/기본값 적용
  - 왜: LLM 출력 다양성(문자열/누락/이상치)에도 수학 로직이 안정적으로 동작해야 함
- [x] 어떻게: LLM 클라이언트 생성 전 API 키 선검증
  - 왜: 운영자 관점에서 원인 파악 가능한 에러 메시지가 필요
- [x] 어떻게: 설정 스키마 검증 강화
  - 왜: 잘못된 입력값이 내부 상태를 오염시키는 것을 사전 차단
- [x] 어떻게: 프런트 SSE 클라이언트에 error 이벤트 핸들링 추가
  - 왜: 백엔드 개선을 UI까지 완결시켜야 사용자 체감 품질이 올라감

## 6) 검증 결과
- [x] Python 문법 검증: `c:/python314/python.exe -m compileall backend agents data backtesting` 통과
- [x] Frontend 빌드: `npm run build` 통과
- [x] TypeScript/Pylance 진단: 수정 파일 오류 없음
- [ ] 통합 E2E 시나리오(실제 OpenAI/KIS 실호출) 수동 검증: 환경 키 필요로 미실행

## 7) 잔여 리스크 / 후속 권장
- [ ] 자동/포트폴리오 루프의 실행 상태는 프로세스 메모리(`AutoTradingSupervisor._loops`, `PortfolioSupervisor._loops`) 기반이며 재시작 시 복원되지 않음 → `PRE_PRODUCTION_CHECKLIST.md §2-C1` 로 격상
- [ ] 자동 테스트(pytest, API integration test) 부재 → `PRE_PRODUCTION_CHECKLIST.md §3-T1/T2`
- [ ] KIS 주문 사전검증(시장가/지정가 price 규칙) 세분화 여지 → `PRE_PRODUCTION_CHECKLIST.md §2-K1`

## 8) 후속 종합 점검 (2026-04-26)
본 문서의 9개 ISSUE 는 모두 ✅ 처리 완료. 프로덕션 출시 전 추가 점검에서 발견된 백엔드 이슈(인증 쿠키 / rate limit / 암호화 키 / 루프 영속화 / TTL / SSE 누수 / orchestrator 부분 실패 / KIS 멱등성 등)는 `docs/PRE_PRODUCTION_CHECKLIST.md` 에 통합되었다.

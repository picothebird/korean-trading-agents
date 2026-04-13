# 다중 AI 에이전트 트레이딩 시스템 - 아키텍처 전략

## 1. 에이전트 역할 계층 구조

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: 데이터 수집 에이전트 (병렬 실행)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐  │
│  │ 기술적 분석가  │ │  감성 분석가  │ │   매크로 분석가          │  │
│  │ RSI/MACD/BB  │ │  뉴스/여론    │ │  KOSPI/금리/환율        │  │
│  └──────────────┘ └──────────────┘ └────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: 연구원 토론 에이전트 (순차 + 반복)                      │
│  ┌──────────────┐ ←→ ┌──────────────┐                          │
│  │  강세 연구원   │     │  약세 연구원   │  (최대 3라운드)          │
│  │  매수 논거     │     │  매도 논거     │                         │
│  └──────────────┘     └──────────────┘                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: 리스크 & 최종 결정 에이전트 (순차)                      │
│  ┌──────────────┐ → ┌──────────────┐ → ┌──────────────────┐   │
│  │ 리스크 매니저  │   │ 포트폴리오    │   │  인간 승인 게이트   │   │
│  │ Kelly기준/VaR │   │   매니저     │   │  (임계값 초과시)    │   │
│  └──────────────┘   └──────────────┘   └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 2. LangGraph StateGraph 설계

```python
# 그래프 상태 정의
class TradingState(TypedDict):
    ticker: str
    session_id: str
    
    # Layer 1 outputs
    technical: dict      # 기술 분석 결과
    sentiment: dict      # 감성 분석 결과
    macro: dict          # 매크로 분석 결과
    
    # Layer 2 outputs
    debate_history: list  # 토론 기록
    debate_round: int     # 현재 라운드
    
    # Layer 3 outputs
    risk_assessment: dict  # 리스크 평가
    final_decision: dict   # 최종 결정
    
    # 인간 협업
    human_approved: bool | None  # None=대기, True=승인, False=거부

# 그래프 노드
graph.add_node("technical_analyst", technical_node)
graph.add_node("sentiment_analyst", sentiment_node)
graph.add_node("macro_analyst", macro_node)
graph.add_node("bull_researcher", bull_node)
graph.add_node("bear_researcher", bear_node)
graph.add_node("risk_manager", risk_node)
graph.add_node("portfolio_manager", portfolio_node)
graph.add_node("human_gate", human_approval_node)  # 신규

# 병렬 엣지 (Layer 1)
graph.add_edge(START, "technical_analyst")
graph.add_edge(START, "sentiment_analyst")
graph.add_edge(START, "macro_analyst")

# 레이어 2로 집합
graph.add_edge(["technical_analyst", "sentiment_analyst", "macro_analyst"], "bull_researcher")
graph.add_conditional_edges("bull_researcher", should_continue_debate, ...)
```

## 3. 에이전트별 프롬프트 설계 원칙

### 3.1 기술적 분석가
- **입력**: OHLCV, RSI, MACD, 볼린저밴드, MA5/20/60, 52주 고저
- **출력**: JSON with action (BUY/SELL/HOLD), confidence (0-1), key_levels (지지/저항), signals (근거 3개)
- **프롬프트 핵심**: 한국 기술적 분석에서 골든크로스/데드크로스 중요도, KOSPI 연동성 언급

### 3.2 감성 분석가
- **입력**: 뉴스 헤드라인 최근 10건, RSS 피드
- **출력**: sentiment_score (-1~1), key_events[], risk_events[]
- **프롬프트 핵심**: 공시/실적발표/기관투자자 동향에 가중치 높게

### 3.3 매크로 분석가
- **입력**: KOSPI/KOSDAQ 추세, 환율, 외국인 매수/매도, 시장 심리
- **출력**: market_regime (BULL/BEAR/SIDEWAYS), risk_level, position_bias
- **프롬프트 핵심**: 서킷브레이커 조건, 공매도 제한 여부

### 3.4 강세/약세 연구원 (TradingAgents 방식)
- 강세: Layer 1 결과에서 BUY 논거만 강조, 낙관적 시나리오 구성
- 약세: Layer 1 결과에서 SELL 논거만 강조, 하락 리스크 강조
- 토론: 상대방 주장 반박 (최대 3라운드)

### 3.5 리스크 매니저 (Kelly Criterion)
```
Kelly = (bp - q) / b
where:
  b = 예상 수익률 (승리시)
  p = 승리 확률 (에이전트 confidence 평균)
  q = 패배 확률 (1 - p)

보수적 적용: position_size = Kelly * 0.5  # Half-Kelly
최대 포지션: 25%
최소 포지션: 5%
```

## 4. 한국 시장 특수 규칙

| 규칙 | 세부 내용 |
|------|-----------|
| **서킷브레이커** | -8%: 20분 중단, -15%: 20분+낙폭확인, -20%: 당일 종가 |
| **공매도 제한** | 코스피200/코스닥150만 허용, 개인 불가 |
| **외국인 동향** | 3일 연속 순매도 = 위험 신호 |
| **기관 동향** | ETF 리밸런싱 일정 고려 (매월 말) |
| **거래시간** | 09:00-15:30 (동시호가: 08:30-09:00, 15:20-15:30) |
| **거래세** | 코스피 0.18%, 코스닥 0.18%, 증권사 수수료 0.015% |

## 5. 인간-AI 협업 플로우

```
분석 요청 → [AI 자동 분석] → 임계값 체크
                                    │
              ┌─────────────────────┤
              │ 임계값 초과시        │ 임계값 이내
              ▼                     ▼
         인간 승인 요청          자동 실행 (시뮬레이션)
         - 고신뢰(>0.8) 대형
         - 포지션 20% 이상
         - 급등락(±5%) 시
              │
     ┌────────┴────────┐
     ▼                 ▼
   승인 (5분 내)    거부 (HOLD)
```

## 6. 목표 설정 & 모니터링

```
사용자 목표 예시:
  - 연 수익: +15%
  - 최대 낙폭 허용: -10%
  - 투자 기간: 6개월
  
→ 시스템이 Kelly 공식으로 분기별 포지션 크기 조정
→ 목표 달성률 대시보드에서 시각화
→ 목표 기간 내 MDD 초과시 자동 알림
```

## 7. 평가 지표 (Evaluation Metrics)

| 지표 | 목표값 | 계산법 |
|------|--------|--------|
| Sharpe Ratio | > 1.5 | (R - Rf) / σ |
| Calmar Ratio | > 1.0 | Ann.Return / MaxDD |
| Win Rate | > 55% | 승리 거래 / 전체 거래 |
| Profit Factor | > 1.5 | 총이익 / 총손실 |
| Max Drawdown | < -15% | 최고점 대비 최대 하락 |
| Alpha (vs KOSPI) | > 0% | 전략 수익 - 벤치마크 |

## 8. 백테스트 전략 로드맵

**Phase 1 (현재)**: MA5/20 골든크로스 (베이스라인)
**Phase 2**: RSI 과매도/과매수 + 볼린저밴드 반전
**Phase 3**: AI 에이전트 시그널 통합 (실제 LLM 판단)
**Phase 4**: 포트폴리오 최적화 (다종목)

---
*최종 업데이트: 2026-04-13*
*TradingAgents 논문 (Yijia Liu et al., 2024) 참조*

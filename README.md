# Korean Trading Agents

한국 주식 시장(KOSPI/KOSDAQ)을 위한 다중 AI 에이전트 자동매매 시스템

## 목표 구조

```
다중 에이전트 오케스트레이션
├── 분석 에이전트들 (각자 독립적인 데이터 소스 기반 분석)
│   ├── 기술적 분석 에이전트 (차트, 기술지표)
│   ├── 펀더멘털 분석 에이전트 (재무제표, 기업가치)
│   ├── 감성 분석 에이전트 (뉴스, SNS 여론)
│   └── 매크로 분석 에이전트 (환율, 금리, 시장 상황)
├── 리서처 에이전트들 (강세/약세 토론 검증)
└── 오케스트레이터 (최종 판단 및 실행)
    ├── 리스크 매니저
    └── 포트폴리오 매니저 → KIS OpenAPI 실행
```

## 기술 스택

- **에이전트 프레임워크**: LangGraph (TradingAgents 기반)
- **LLM**: OpenAI GPT / Anthropic Claude
- **데이터**: FinanceDataReader, pykrx, KIS OpenAPI
- **실행**: 한국투자증권 KIS OpenAPI

## 참고 레포

- [TradingAgents](https://github.com/TauricResearch/TradingAgents) — 다중 에이전트 LLM 트레이딩 프레임워크
- [FinRL-X](https://github.com/AI4Finance-Foundation/FinRL-Trading) — RL 기반 트레이딩
- [KIS OpenAPI](https://github.com/koreainvestment/open-trading-api) — 한국투자증권 공식 API

## 주의사항

> 이 프로젝트는 연구/학습 목적입니다. 실제 투자에 사용 시 발생하는 손실에 대한 책임은 사용자 본인에게 있습니다.

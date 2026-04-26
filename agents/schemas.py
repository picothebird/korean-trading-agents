"""에이전트 LLM 출력 Pydantic 스키마.

OpenAI Responses API의 Structured Outputs (json_schema, strict=True) 와 함께 사용한다.
모든 필드는 strict 모드 호환을 위해 명시적으로 선언한다.

사용 예:
    from backend.core.llm import create_structured_response
    from agents.schemas import AnalystOutput
    out: AnalystOutput = await create_structured_response(system, prompt, AnalystOutput)
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# OpenAI strict mode는 추가 속성(additionalProperties)을 명시적으로 false 로 요구한다.
# Pydantic 의 model_json_schema 는 기본적으로 additionalProperties 를 추가하지 않으므로
# 헬퍼에서 schema 후처리로 강제한다 (llm.create_structured_response 참조).


SignalType = Literal["BUY", "SELL", "HOLD"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]
RiskLevelExtended = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class AnalystOutput(BaseModel):
    """기술/펀더멘털 분석가 공통 출력."""
    model_config = ConfigDict(extra="forbid")

    signal: SignalType = Field(description="BUY | SELL | HOLD")
    confidence: float = Field(ge=0.0, le=1.0, description="0.0~1.0 신뢰도")
    key_signals: list[str] = Field(default_factory=list, description="핵심 근거 2~4개")
    risk_level: RiskLevel = Field(default="MEDIUM")
    summary: str = Field(description="200자 이내 요약")


class SentimentAnalystOutput(BaseModel):
    """감성 분석가 출력 (뉴스/공시 분석)."""
    model_config = ConfigDict(extra="forbid")

    signal: SignalType
    confidence: float = Field(ge=0.0, le=1.0)
    sentiment_score: float = Field(ge=-1.0, le=1.0, description="-1.0(매우 부정) ~ +1.0(매우 긍정)")
    key_signals: list[str] = Field(default_factory=list)
    event_flags: list[str] = Field(default_factory=list, description="감지된 이벤트 키워드 (공시/뉴스 패턴)")
    summary: str = Field(description="200자 이내 요약")


MarketCondition = Literal["BULL", "BEAR", "NEUTRAL"]
MacroRecommendation = Literal["INVEST", "CAUTION", "AVOID"]


class MacroAnalystOutput(BaseModel):
    """매크로 분석가 출력."""
    model_config = ConfigDict(extra="forbid")

    market_condition: MarketCondition
    confidence: float = Field(ge=0.0, le=1.0)
    risk_level: RiskLevel
    recommendation: MacroRecommendation
    key_factors: list[str] = Field(default_factory=list, description="핵심 요인 2~3개")
    summary: str = Field(description="150자 이내 요약")


class BacktestSignalOutput(BaseModel):
    """백테스트용 경량 시그널 출력."""
    model_config = ConfigDict(extra="forbid")

    signal: SignalType
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(default="", description="50자 이내")


class DebateStanceOutput(BaseModel):
    """연구원 토론(강세/약세) 한 라운드 출력."""
    model_config = ConfigDict(extra="forbid")

    argument: str = Field(description="주장 200자 이내")
    key_points: list[str] = Field(default_factory=list, description="핵심 포인트 2~3개")
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)


class RiskOutput(BaseModel):
    """리스크 매니저 출력."""
    model_config = ConfigDict(extra="forbid")

    risk_level: RiskLevelExtended
    max_position_pct: float = Field(ge=0.0, le=25.0, description="최대 허용 포지션 % (0~25)")
    kelly_position_pct: float = Field(ge=0.0, le=100.0, description="Kelly 권장 포지션 %")
    stop_loss_pct: float = Field(ge=0.0, le=50.0, description="손절 % (3~15)")
    key_risks: list[str] = Field(default_factory=list, description="핵심 리스크 2~3개")
    approval: bool = Field(description="포지션 진입 승인 여부")
    requires_human_approval: bool = Field(default=False, description="인간 승인 필요 여부")
    summary: str = Field(description="결정 근거 150자 이내")


class PortfolioManagerOutput(BaseModel):
    """포트폴리오 매니저 최종 결정 출력."""
    model_config = ConfigDict(extra="forbid")

    action: SignalType
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = Field(description="결정 근거 300자 이내")
    position_size_pct: float = Field(ge=0.0, le=100.0)
    entry_strategy: str = Field(default="", description="진입 전략")
    exit_strategy: str = Field(default="", description="청산 전략 (목표가/손절가)")


class GuruOutput(BaseModel):
    """GURU(사용자 정책) 레이어 출력."""
    model_config = ConfigDict(extra="forbid")

    action: SignalType
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = Field(description="결정 근거 300자 이내")
    policy_notes: list[str] = Field(default_factory=list, description="적용된 정책 포인트 1~3개")

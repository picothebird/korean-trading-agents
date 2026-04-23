"""
오케스트레이터: 에이전트 분석 결과를 취합하여 최종 판단
- 강세/약세 연구원 토론 (TradingAgents 방식)
- Kelly Criterion 포지션 사이징
- 리스크 매니저 검토 (VaR 개념 적용)
- 포트폴리오 매니저 최종 결정
- 인간 승인 게이트 (임계값 초과시)
"""
import asyncio
import json
import re
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.core.config import settings
from backend.core.events import (
    AgentRole, AgentStatus, AgentThought, TradeDecision,
    emit_thought
)
from backend.core.llm import create_response
from agents.analyst.analysts import technical_analyst, sentiment_analyst, macro_analyst
from data.market.fetcher import get_stock_info


def _safe_parse_json(text: str, fallback: dict) -> dict:
    """LLM 응답에서 JSON을 안전하게 파싱 (코드블록 제거 포함)"""
    text = text.strip()
    # ```json ... ``` 제거
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = text.strip("`").strip()
    # JSON 시작점 찾기
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return fallback


def _kelly_position_size(
    agent_confidences: list[float],
    avg_win_pct: float = 5.0,
    avg_loss_pct: float = 3.0,
    max_fraction: float = 0.25,
) -> float:
    """
    Kelly Criterion 기반 포지션 크기 계산 (Half-Kelly 적용)
    
    f = (bp - q) / b
    where b = 승리시 수익률, p = 승리 확률, q = 패배 확률
    """
    if not agent_confidences:
        return 0.05

    p = sum(agent_confidences) / len(agent_confidences)  # 평균 신뢰도 = 승률 추정
    q = 1 - p
    b = avg_win_pct / avg_loss_pct  # 손익비

    kelly = (b * p - q) / b
    half_kelly = kelly * 0.5  # 보수적: Half-Kelly
    # 0.05 ~ max_fraction 범위로 클리핑
    return max(0.05, min(half_kelly, max_fraction))


async def researcher_debate(
    ticker: str,
    analyst_results: dict,
    session_id: str,
    rounds: int = 2,
) -> dict:
    """강세/약세 연구원 토론 (지정된 라운드 수 반복)"""
    analysis_summary = json.dumps(analyst_results, ensure_ascii=False, indent=2)
    
    bull_stance = ""
    bear_stance = ""
    
    for round_num in range(1, rounds + 1):
        # 강세 연구원
        await emit_thought(session_id, AgentThought(
            agent_id="bull_researcher",
            role=AgentRole.BULL_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] 매수 논거 수립 중...",
        ))

        bull_prompt = f"""당신은 강세(매수) 관점의 주식 연구원입니다.

[분석팀 결과]
{analysis_summary}

[약세 측 주장 (이전 라운드)]
{bear_stance if bear_stance else '(첫 라운드)'}

종목 {ticker}에 대해 매수를 지지하는 논거를 제시하세요. 
JSON: {{"argument": "주장 (200자)", "key_points": ["포인트1", "포인트2", "포인트3"], "confidence": 0.0~1.0}}"""

        bull_resp_text = await create_response(
            system="당신은 강세 주식 연구원입니다. JSON만 출력하세요.",
            user=bull_prompt,
            fast=True,
        )
        bull_key_points = []
        try:
            bull_result = _safe_parse_json(bull_resp_text, {})
            bull_stance = bull_result.get("argument", bull_resp_text)
            bull_key_points = bull_result.get("key_points", [])
        except Exception:
            bull_stance = bull_resp_text

        await emit_thought(session_id, AgentThought(
            agent_id="bull_researcher",
            role=AgentRole.BULL_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] {bull_stance}",
            metadata={"round": round_num, "key_points": bull_key_points},
        ))

        # 약세 연구원
        await emit_thought(session_id, AgentThought(
            agent_id="bear_researcher",
            role=AgentRole.BEAR_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] 매도 논거 수립 중...",
        ))

        bear_prompt = f"""당신은 약세(매도/관망) 관점의 주식 연구원입니다.

[분석팀 결과]
{analysis_summary}

[강세 측 주장]
{bull_stance}

종목 {ticker}에 대해 매도 또는 관망을 지지하는 논거를 제시하세요.
JSON: {{"argument": "주장 (200자)", "key_points": ["포인트1", "포인트2", "포인트3"], "confidence": 0.0~1.0}}"""

        bear_resp_text = await create_response(
            system="당신은 약세 주식 연구원입니다. JSON만 출력하세요.",
            user=bear_prompt,
            fast=True,
        )
        bear_key_points = []
        try:
            bear_result = _safe_parse_json(bear_resp_text, {})
            bear_stance = bear_result.get("argument", bear_resp_text)
            bear_key_points = bear_result.get("key_points", [])
        except Exception:
            bear_stance = bear_resp_text

        await emit_thought(session_id, AgentThought(
            agent_id="bear_researcher",
            role=AgentRole.BEAR_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] {bear_stance}",
            metadata={"round": round_num, "key_points": bear_key_points},
        ))

    return {"bull_stance": bull_stance, "bear_stance": bear_stance}


async def risk_manager(
    ticker: str,
    analyst_results: dict,
    debate_results: dict,
    session_id: str,
) -> dict:
    """리스크 매니저: Kelly Criterion 기반 포지션 평가"""
    await emit_thought(session_id, AgentThought(
        agent_id="risk_manager",
        role=AgentRole.RISK_MANAGER,
        status=AgentStatus.ANALYZING,
        content="포트폴리오 리스크 & Kelly 포지션 분석 중...",
    ))

    # Kelly Criterion 계산용 신뢰도 수집
    confidences = []
    for val in analyst_results.values():
        if isinstance(val, dict) and "confidence" in val:
            confidences.append(float(val.get("confidence", 0.5)))

    kelly_size = _kelly_position_size(confidences)
    kelly_pct = round(kelly_size * 100, 1)

    prompt = f"""당신은 퀀트 리스크 매니저입니다.

[분석 결과 요약]
{json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ['signal','confidence','risk_level','summary']}
             for k, v in analyst_results.items() if isinstance(v, dict)}, ensure_ascii=False)}

[연구원 토론 결과]
강세론: {debate_results.get('bull_stance', '')[:200]}
약세론: {debate_results.get('bear_stance', '')[:200]}

[Kelly Criterion 계산 결과]
- 에이전트 평균 신뢰도: {sum(confidences)/len(confidences)*100:.1f}% → Half-Kelly 권장 포지션: {kelly_pct}%

한국 시장 특수 조건 고려:
- 서킷브레이커 (-8%): 즉시 포지션 축소 권고
- 공매도 제한: 롱 전략만 사용
- 최대 허용 포지션: 25%

종목 {ticker}의 투자 리스크를 평가하세요.
JSON: {{"risk_level": "LOW|MEDIUM|HIGH|CRITICAL", "max_position_pct": 0~25, "kelly_position_pct": {kelly_pct}, "stop_loss_pct": 3~15, "key_risks": ["리스크1", "리스크2", "리스크3"], "approval": true|false, "requires_human_approval": true|false, "summary": "150자"}}

requires_human_approval=true 조건: 신뢰도 80% 이상이고 포지션 20% 초과, 또는 위험도 CRITICAL"""

    try:
        risk_text = await create_response(
            system="당신은 퀀트 리스크 관리 전문가입니다. Kelly Criterion을 반영한 JSON만 출력하세요.",
            user=prompt,
        )
        result = _safe_parse_json(risk_text, {
            "risk_level": "HIGH",
            "max_position_pct": 10,
            "kelly_position_pct": kelly_pct,
            "stop_loss_pct": 7,
            "approval": False,
            "requires_human_approval": False,
            "summary": "리스크 분석 실패",
        })
    except Exception as e:
        result = {
            "risk_level": "HIGH",
            "max_position_pct": 5,
            "kelly_position_pct": kelly_pct,
            "stop_loss_pct": 5,
            "approval": False,
            "requires_human_approval": False,
            "summary": f"분석 오류: {str(e)[:100]}",
        }

    result["kelly_position_pct"] = kelly_pct  # 항상 오버라이드로 정확값 유지

    await emit_thought(session_id, AgentThought(
        agent_id="risk_manager",
        role=AgentRole.RISK_MANAGER,
        status=AgentStatus.DONE,
        content=f"리스크: {result.get('risk_level')} | Kelly: {kelly_pct}% | 승인: {result.get('approval')}",
        metadata=result,
    ))
    return result


async def portfolio_manager(
    ticker: str,
    analyst_results: dict,
    debate_results: dict,
    risk_result: dict,
    session_id: str,
) -> TradeDecision:
    """포트폴리오 매니저: 최종 매매 결정 (인간 개입 가능)"""
    await emit_thought(session_id, AgentThought(
        agent_id="portfolio_manager",
        role=AgentRole.PORTFOLIO_MANAGER,
        status=AgentStatus.DECIDING,
        content="모든 에이전트 보고서 취합 후 최종 결정 중...",
    ))

    # 신호 집계
    signals = []
    confidences = []
    for val in analyst_results.values():
        if isinstance(val, dict):
            if "signal" in val:
                signals.append(val["signal"])
            if "confidence" in val:
                confidences.append(float(val.get("confidence", 0.5)))

    signal_counts = {"BUY": signals.count("BUY"), "SELL": signals.count("SELL"), "HOLD": signals.count("HOLD")}
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.5
    kelly_pct = risk_result.get("kelly_position_pct", 10.0)
    position_pct = min(
        float(risk_result.get("max_position_pct", 15)),
        kelly_pct,
    )

    prompt = f"""당신은 한국 주식 포트폴리오 책임 매니저입니다.

[에이전트 투표 현황]
매수(BUY): {signal_counts['BUY']}표 | 매도(SELL): {signal_counts['SELL']}표 | 관망(HOLD): {signal_counts['HOLD']}표
평균 신뢰도: {avg_confidence*100:.1f}%

[리스크 매니저 평가]
위험도: {risk_result.get('risk_level')} | 승인: {risk_result.get('approval')}
Kelly 포지션: {kelly_pct}% | 최대 허용: {risk_result.get('max_position_pct')}%
손절: {risk_result.get('stop_loss_pct')}%
핵심 리스크: {', '.join(risk_result.get('key_risks', [])[:2])}

[연구원 토론]
강세론: {debate_results.get('bull_stance', '')[:300]}
약세론: {debate_results.get('bear_stance', '')[:300]}

종목 {ticker}에 대한 최종 투자 결정을 내리세요.
Kelly 모델 기반 적정 포지션: {position_pct:.1f}%

JSON: {{"action": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "reasoning": "결정 근거 300자", "position_size_pct": {position_pct:.0f}, "entry_strategy": "진입 전략 (가격대, 분할 여부)", "exit_strategy": "청산 전략 (목표가, 손절가)"}}"""


    try:
        pm_text = await create_response(
            system="당신은 최종 투자 결정권자입니다. Kelly Criterion을 반영하여 JSON만 출력하세요.",
            user=prompt,
        )
        pm_result = _safe_parse_json(pm_text, {
            "action": "HOLD",
            "confidence": 0.3,
            "reasoning": "결정 과정 오류",
            "position_size_pct": 0,
        })
    except Exception as e:
        pm_result = {
            "action": "HOLD",
            "confidence": 0.3,
            "reasoning": f"결정 실패: {str(e)[:100]}",
            "position_size_pct": 0,
        }

    requires_human = (
        risk_result.get("requires_human_approval", False)
        or float(pm_result.get("confidence", 0)) >= 0.85
        or float(pm_result.get("position_size_pct", 0)) >= 20
    )

    decision = TradeDecision(
        action=pm_result.get("action", "HOLD"),
        ticker=ticker,
        confidence=float(pm_result.get("confidence", 0.3)),
        reasoning=pm_result.get("reasoning", ""),
        agents_summary={
            "analyst_signals": signal_counts,
            "risk_level": risk_result.get("risk_level"),
            "position_size_pct": float(pm_result.get("position_size_pct", 0)),
            "kelly_position_pct": kelly_pct,
            "entry_strategy": pm_result.get("entry_strategy", ""),
            "exit_strategy": pm_result.get("exit_strategy", ""),
            "stop_loss_pct": risk_result.get("stop_loss_pct", 5),
            "requires_human_approval": requires_human,
        },
    )

    status_msg = f"🎯 최종: {decision.action} | 신뢰도: {decision.confidence*100:.0f}% | Kelly포지션: {kelly_pct}%"
    if requires_human:
        status_msg += " | ⚠️ 인간 승인 필요"

    await emit_thought(session_id, AgentThought(
        agent_id="portfolio_manager",
        role=AgentRole.PORTFOLIO_MANAGER,
        status=AgentStatus.DONE,
        content=status_msg,
        metadata={
            "action": decision.action,
            "confidence": decision.confidence,
            "reasoning": decision.reasoning,
            "requires_human_approval": requires_human,
        },
    ))
    return decision


async def run_analysis(ticker: str, session_id: str) -> TradeDecision:
    """전체 에이전트 파이프라인 실행"""
    stock_info = get_stock_info(ticker)
    company_name = stock_info.get("name", "")

    await emit_thought(session_id, AgentThought(
        agent_id="system",
        role=AgentRole.PORTFOLIO_MANAGER,
        status=AgentStatus.IDLE,
        content=f"🚀 분석 시작: {ticker} ({company_name})",
        metadata={"ticker": ticker, "company": company_name},
    ))

    # 1단계: 분석 에이전트 병렬 실행
    tech_task = asyncio.create_task(technical_analyst(ticker, session_id))
    sent_task = asyncio.create_task(sentiment_analyst(ticker, company_name, session_id))
    macro_task = asyncio.create_task(macro_analyst(session_id))

    tech_result, sent_result, macro_result = await asyncio.gather(
        tech_task, sent_task, macro_task, return_exceptions=True
    )

    analyst_results = {
        "technical": tech_result if not isinstance(tech_result, Exception) else {"signal": "HOLD"},
        "sentiment": sent_result if not isinstance(sent_result, Exception) else {"signal": "HOLD"},
        "macro": macro_result if not isinstance(macro_result, Exception) else {"signal": "HOLD"},
    }

    # 2단계: 연구원 토론
    debate = await researcher_debate(ticker, analyst_results, session_id, rounds=settings.max_debate_rounds)

    # 3단계: 리스크 매니저
    risk = await risk_manager(ticker, analyst_results, debate, session_id)

    # 4단계: 포트폴리오 매니저 최종 결정
    decision = await portfolio_manager(ticker, analyst_results, debate, risk, session_id)

    # 스트림 종료 신호
    from backend.core.events import get_thought_queue
    queue = get_thought_queue(session_id)
    await queue.put(None)

    return decision

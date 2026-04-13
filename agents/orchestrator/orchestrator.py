"""
오케스트레이터: 에이전트 분석 결과를 취합하여 최종 판단
- 강세/약세 연구원 토론
- 리스크 매니저 검토
- 포트폴리오 매니저 최종 결정
"""
import asyncio
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from backend.core.config import settings
from backend.core.events import (
    AgentRole, AgentStatus, AgentThought, TradeDecision,
    emit_thought
)
from agents.analyst.analysts import technical_analyst, sentiment_analyst, macro_analyst
from data.market.fetcher import get_stock_info


def _make_llm(fast: bool = False) -> ChatOpenAI:
    model = settings.fast_llm_model if fast else settings.default_llm_model
    return ChatOpenAI(
        model=model,
        api_key=settings.openai_api_key,
        temperature=0.2,
    )


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

        llm = _make_llm(fast=True)
        bull_resp = await llm.ainvoke([
            SystemMessage(content="당신은 강세 주식 연구원입니다. JSON만 출력하세요."),
            HumanMessage(content=bull_prompt),
        ])
        try:
            bull_result = json.loads(bull_resp.content.strip().strip("```json").strip("```"))
            bull_stance = bull_result.get("argument", "")
        except Exception:
            bull_stance = bull_resp.content

        await emit_thought(session_id, AgentThought(
            agent_id="bull_researcher",
            role=AgentRole.BULL_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] {bull_stance[:100]}...",
            metadata={"round": round_num},
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

        bear_resp = await llm.ainvoke([
            SystemMessage(content="당신은 약세 주식 연구원입니다. JSON만 출력하세요."),
            HumanMessage(content=bear_prompt),
        ])
        try:
            bear_result = json.loads(bear_resp.content.strip().strip("```json").strip("```"))
            bear_stance = bear_result.get("argument", "")
        except Exception:
            bear_stance = bear_resp.content

        await emit_thought(session_id, AgentThought(
            agent_id="bear_researcher",
            role=AgentRole.BEAR_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] {bear_stance[:100]}...",
            metadata={"round": round_num},
        ))

    return {"bull_stance": bull_stance, "bear_stance": bear_stance}


async def risk_manager(
    ticker: str,
    analyst_results: dict,
    debate_results: dict,
    session_id: str,
) -> dict:
    """리스크 매니저: 포지션 위험도 평가"""
    await emit_thought(session_id, AgentThought(
        agent_id="risk_manager",
        role=AgentRole.RISK_MANAGER,
        status=AgentStatus.ANALYZING,
        content="포트폴리오 리스크 분석 중...",
    ))

    prompt = f"""당신은 퀀트 리스크 매니저입니다.

[분석 결과]
{json.dumps(analyst_results, ensure_ascii=False)}

[연구원 토론]
강세론: {debate_results.get('bull_stance', '')}
약세론: {debate_results.get('bear_stance', '')}

종목 {ticker}의 투자 리스크를 평가하세요. 
JSON: {{"risk_level": "LOW|MEDIUM|HIGH|CRITICAL", "max_position_pct": 0~20 (포트폴리오 최대 비중%), "stop_loss_pct": 리스크관리 손절 %(0~15), "key_risks": ["리스크1", "리스크2"], "approval": true|false, "summary": "150자"}}"""

    llm = _make_llm()
    try:
        response = await llm.ainvoke([
            SystemMessage(content="당신은 리스크 관리 전문가입니다. JSON만 출력하세요."),
            HumanMessage(content=prompt),
        ])
        result = json.loads(response.content.strip().strip("```json").strip("```"))
    except Exception as e:
        result = {
            "risk_level": "HIGH",
            "max_position_pct": 5,
            "stop_loss_pct": 5,
            "approval": False,
            "summary": str(e),
        }

    await emit_thought(session_id, AgentThought(
        agent_id="risk_manager",
        role=AgentRole.RISK_MANAGER,
        status=AgentStatus.DONE,
        content=f"리스크 평가: {result.get('risk_level')} | 승인: {result.get('approval')}",
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
    """포트폴리오 매니저: 최종 매매 결정"""
    await emit_thought(session_id, AgentThought(
        agent_id="portfolio_manager",
        role=AgentRole.PORTFOLIO_MANAGER,
        status=AgentStatus.DECIDING,
        content="모든 에이전트 보고서 취합 후 최종 결정 중...",
    ))

    # 신호 집계
    signals = []
    for key, val in analyst_results.items():
        if isinstance(val, dict) and "signal" in val:
            signals.append(val["signal"])
    
    signal_counts = {"BUY": signals.count("BUY"), "SELL": signals.count("SELL"), "HOLD": signals.count("HOLD")}

    prompt = f"""당신은 한국 주식 포트폴리오 매니저입니다.

[에이전트 신호 집계]
매수: {signal_counts['BUY']}표 / 매도: {signal_counts['SELL']}표 / 관망: {signal_counts['HOLD']}표

[리스크 매니저]
위험도: {risk_result.get('risk_level')} | 승인: {risk_result.get('approval')} | 최대비중: {risk_result.get('max_position_pct')}% | 손절: {risk_result.get('stop_loss_pct')}%

[강세 논거]
{debate_results.get('bull_stance', '')}

[약세 논거]
{debate_results.get('bear_stance', '')}

종목 {ticker}에 대한 최종 결정을 JSON으로만 내리세요:
{{"action": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "reasoning": "결정 근거 300자", "position_size_pct": 0~20, "entry_strategy": "진입 전략", "exit_strategy": "청산 전략"}}"""

    llm = _make_llm()
    try:
        response = await llm.ainvoke([
            SystemMessage(content="당신은 최종 투자 결정권자입니다. JSON만 출력하세요."),
            HumanMessage(content=prompt),
        ])
        pm_result = json.loads(response.content.strip().strip("```json").strip("```"))
    except Exception as e:
        pm_result = {
            "action": "HOLD",
            "confidence": 0.3,
            "reasoning": f"결정 실패: {str(e)}",
        }

    decision = TradeDecision(
        action=pm_result.get("action", "HOLD"),
        ticker=ticker,
        confidence=pm_result.get("confidence", 0.3),
        reasoning=pm_result.get("reasoning", ""),
        agents_summary={
            "analyst_signals": signal_counts,
            "risk_level": risk_result.get("risk_level"),
            "position_size_pct": pm_result.get("position_size_pct", 0),
            "entry_strategy": pm_result.get("entry_strategy", ""),
            "exit_strategy": pm_result.get("exit_strategy", ""),
        },
    )

    await emit_thought(session_id, AgentThought(
        agent_id="portfolio_manager",
        role=AgentRole.PORTFOLIO_MANAGER,
        status=AgentStatus.DONE,
        content=f"🎯 최종 결정: {decision.action} | 신뢰도: {decision.confidence*100:.0f}%",
        metadata={
            "action": decision.action,
            "confidence": decision.confidence,
            "reasoning": decision.reasoning,
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

"""
분석 에이전트 팀
- 기술적 분석가: 차트, 기술지표 기반
- 펀더멘털 분석가: 재무 기반
- 감성 분석가: 뉴스/여론 기반
- 매크로 분석가: 환율/금리/시장 환경
"""
import sys
import os
import re
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from backend.core.config import settings
from backend.core.events import AgentRole, AgentStatus, AgentThought, emit_thought
from data.market.fetcher import get_technical_indicators, get_stock_info, get_market_index, get_news_async


def _safe_parse_json(text: str, fallback: dict) -> dict:
    """LLM 응답에서 JSON을 안전하게 추출"""
    text = re.sub(r"```(?:json)?\s*", "", text).strip("`").strip()
    start, end = text.find("{"), text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return fallback


def _make_llm(fast: bool = False) -> ChatOpenAI:
    model = settings.fast_llm_model if fast else settings.default_llm_model
    return ChatOpenAI(
        model=model,
        api_key=settings.openai_api_key,
        temperature=0.1,
        streaming=True,
    )


async def technical_analyst(ticker: str, session_id: str) -> dict:
    """기술적 분석 에이전트: 차트·지표 기반 매수/매도 시그널 분석"""
    await emit_thought(session_id, AgentThought(
        agent_id="technical_analyst",
        role=AgentRole.TECHNICAL_ANALYST,
        status=AgentStatus.ANALYZING,
        content=f"{ticker} 기술 지표 수집 중...",
    ))

    indicators = get_technical_indicators(ticker)
    stock_info = get_stock_info(ticker)

    if "error" in indicators:
        return {"agent": "technical_analyst", "signal": "HOLD", "reason": "데이터 없음", "confidence": 0.3}

    prompt = f"""당신은 한국 주식 전문 기술적 분석가입니다.

종목: {ticker} ({stock_info.get('name', '')})
현재가: {indicators['current_price']:,}원 ({indicators['change_pct']:+.2f}%)

[기술 지표]
- RSI(14): {indicators.get('rsi_14', 'N/A'):.1f if indicators.get('rsi_14') else 'N/A'}
- MACD: {indicators.get('macd', 'N/A'):.2f if indicators.get('macd') else 'N/A'}
- MACD Signal: {indicators.get('macd_signal', 'N/A'):.2f if indicators.get('macd_signal') else 'N/A'}
- MACD 히스토그램: {indicators.get('macd_hist', 'N/A'):.2f if indicators.get('macd_hist') else 'N/A'}
- 볼린저 상단: {indicators.get('bb_upper', 'N/A'):,.0f if indicators.get('bb_upper') else 'N/A'}
- 볼린저 중단: {indicators.get('bb_middle', 'N/A'):,.0f if indicators.get('bb_middle') else 'N/A'}
- 볼린저 하단: {indicators.get('bb_lower', 'N/A'):,.0f if indicators.get('bb_lower') else 'N/A'}
- MA5: {indicators.get('ma5', 'N/A'):,.0f}
- MA20: {indicators.get('ma20', 'N/A'):,.0f}
- 52주 최고: {indicators.get('high_52w', 'N/A'):,.0f}
- 52주 최저: {indicators.get('low_52w', 'N/A'):,.0f}

위 지표를 분석하여 다음 JSON 형식으로만 답하세요:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "key_signals": ["근거1", "근거2", "근거3"], "risk_level": "LOW|MEDIUM|HIGH", "summary": "200자 이내 요약"}}"""

    llm = _make_llm()
    
    await emit_thought(session_id, AgentThought(
        agent_id="technical_analyst",
        role=AgentRole.TECHNICAL_ANALYST,
        status=AgentStatus.THINKING,
        content="기술 지표 패턴 분석 중...",
        metadata={"indicators": indicators},
    ))

    try:
        response = await llm.ainvoke([
            SystemMessage(content="당신은 KOSPI/KOSDAQ 전문 기술적 분석가입니다. 반드시 JSON만 출력하세요."),
            HumanMessage(content=prompt),
        ])
        result = _safe_parse_json(response.content, {
            "agent": "technical_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "summary": "JSON 파싱 실패",
        })
        result["agent"] = "technical_analyst"
        result["raw_data"] = indicators
    except Exception as e:
        result = {
            "agent": "technical_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "summary": f"분석 실패: {str(e)[:100]}",
        }

    await emit_thought(session_id, AgentThought(
        agent_id="technical_analyst",
        role=AgentRole.TECHNICAL_ANALYST,
        status=AgentStatus.DONE,
        content=f"분석 완료: {result.get('signal')} (신뢰도 {result.get('confidence', 0)*100:.0f}%)",
        metadata=result,
    ))
    return result


async def sentiment_analyst(ticker: str, company_name: str, session_id: str) -> dict:
    """감성 분석 에이전트: 뉴스 기반 시장 심리 분석"""
    await emit_thought(session_id, AgentThought(
        agent_id="sentiment_analyst",
        role=AgentRole.SENTIMENT_ANALYST,
        status=AgentStatus.ANALYZING,
        content=f"{company_name}({ticker}) 뉴스 수집 중...",
    ))

    news = await get_news_async(ticker, company_name)
    
    if not news:
        await emit_thought(session_id, AgentThought(
            agent_id="sentiment_analyst",
            role=AgentRole.SENTIMENT_ANALYST,
            status=AgentStatus.DONE,
            content="뉴스 데이터 없음 - HOLD 판단",
        ))
        return {"agent": "sentiment_analyst", "signal": "HOLD", "confidence": 0.3, "summary": "수집된 뉴스 없음"}

    news_text = "\n".join([f"- {n['title']}: {n['summary'][:100]}" for n in news[:5]])
    
    await emit_thought(session_id, AgentThought(
        agent_id="sentiment_analyst",
        role=AgentRole.SENTIMENT_ANALYST,
        status=AgentStatus.THINKING,
        content=f"{len(news)}개 뉴스 감성 분석 중...",
        metadata={"news_count": len(news)},
    ))

    prompt = f"""종목: {ticker} ({company_name})

[최근 뉴스]
{news_text}

시장 심리를 분석하여 JSON으로만 답하세요:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "sentiment_score": -1.0~1.0, "key_signals": ["근거1", "근거2"], "summary": "150자 이내"}}"""

    llm = _make_llm(fast=True)
    try:
        response = await llm.ainvoke([
            SystemMessage(content="당신은 금융 뉴스 감성 분석 전문가입니다. JSON만 출력하세요."),
            HumanMessage(content=prompt),
        ])
        result = _safe_parse_json(response.content, {
            "agent": "sentiment_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "summary": "JSON 파싱 실패",
        })
        result["agent"] = "sentiment_analyst"
        result["news"] = news[:3]
    except Exception as e:
        result = {"agent": "sentiment_analyst", "signal": "HOLD", "confidence": 0.3, "summary": str(e)[:100]}

    await emit_thought(session_id, AgentThought(
        agent_id="sentiment_analyst",
        role=AgentRole.SENTIMENT_ANALYST,
        status=AgentStatus.DONE,
        content=f"감성 분석 완료: {result.get('signal')} (감성점수: {result.get('sentiment_score', 0):+.2f})",
        metadata=result,
    ))
    return result


async def macro_analyst(session_id: str) -> dict:
    """매크로 분석 에이전트: 환율, 지수, 시장 환경"""
    await emit_thought(session_id, AgentThought(
        agent_id="macro_analyst",
        role=AgentRole.MACRO_ANALYST,
        status=AgentStatus.ANALYZING,
        content="KOSPI/KOSDAQ/환율 데이터 수집 중...",
    ))

    indices = get_market_index(days=30)
    
    summary_parts = []
    for name, df in indices.items():
        if not df.empty and "Close" in df.columns:
            latest = float(df["Close"].iloc[-1])
            prev = float(df["Close"].iloc[-2]) if len(df) > 1 else latest
            change_pct = (latest - prev) / prev * 100
            summary_parts.append(f"{name}: {latest:,.2f} ({change_pct:+.2f}%)")

    market_summary = " | ".join(summary_parts) if summary_parts else "데이터 없음"

    await emit_thought(session_id, AgentThought(
        agent_id="macro_analyst",
        role=AgentRole.MACRO_ANALYST,
        status=AgentStatus.THINKING,
        content=f"시장 환경 분석: {market_summary}",
    ))

    prompt = f"""현재 한국 주식 시장 환경:
{market_summary}

전반적인 시장 환경과 투자 적합성을 분석하여 JSON으로만 답하세요:
{{"market_condition": "BULL|BEAR|NEUTRAL", "confidence": 0.0~1.0, "risk_level": "LOW|MEDIUM|HIGH", "recommendation": "INVEST|CAUTION|AVOID", "key_factors": ["요인1", "요인2"], "summary": "150자 이내"}}"""

    llm = _make_llm(fast=True)
    try:
        response = await llm.ainvoke([
            SystemMessage(content="당신은 거시경제 분석 전문가입니다. JSON만 출력하세요."),
            HumanMessage(content=prompt),
        ])
        result = _safe_parse_json(response.content, {
            "agent": "macro_analyst",
            "signal": "HOLD",
            "market_condition": "NEUTRAL",
            "confidence": 0.3,
            "summary": "JSON 파싱 실패",
        })
        result["agent"] = "macro_analyst"
        result["market_data"] = market_summary
    except Exception as e:
        result = {"agent": "macro_analyst", "signal": "HOLD", "confidence": 0.3, "summary": str(e)[:100]}

    await emit_thought(session_id, AgentThought(
        agent_id="macro_analyst",
        role=AgentRole.MACRO_ANALYST,
        status=AgentStatus.DONE,
        content=f"매크로 분석 완료: {result.get('market_condition', 'NEUTRAL')} ({result.get('recommendation', 'CAUTION')})",
        metadata=result,
    ))
    return result

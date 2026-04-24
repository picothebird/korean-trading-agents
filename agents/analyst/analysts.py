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

from backend.core.config import settings
from backend.core.events import AgentRole, AgentStatus, AgentThought, emit_thought
from backend.core.llm import create_response
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


def _fmt_num(value, fmt: str, default: str = "N/A") -> str:
    """None/NaN-safe number formatting for prompts."""
    if value is None:
        return default
    try:
        return format(float(value), fmt)
    except Exception:
        return default


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
현재가: {_fmt_num(indicators.get('current_price'), ',.0f')}원 ({_fmt_num(indicators.get('change_pct'), '+.2f', default='0.00')}%)

[기술 지표]
- RSI(14): {_fmt_num(indicators.get('rsi_14'), '.1f')}
- MACD: {_fmt_num(indicators.get('macd'), '.2f')}
- MACD Signal: {_fmt_num(indicators.get('macd_signal'), '.2f')}
- MACD 히스토그램: {_fmt_num(indicators.get('macd_hist'), '.2f')}
- 볼린저 상단: {_fmt_num(indicators.get('bb_upper'), ',.0f')}
- 볼린저 중단: {_fmt_num(indicators.get('bb_middle'), ',.0f')}
- 볼린저 하단: {_fmt_num(indicators.get('bb_lower'), ',.0f')}
- MA5: {_fmt_num(indicators.get('ma5'), ',.0f')}
- MA20: {_fmt_num(indicators.get('ma20'), ',.0f')}
- 52주 최고: {_fmt_num(indicators.get('high_52w'), ',.0f')}
- 52주 최저: {_fmt_num(indicators.get('low_52w'), ',.0f')}

위 지표를 분석하여 다음 JSON 형식으로만 답하세요:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "key_signals": ["근거1", "근거2", "근거3"], "risk_level": "LOW|MEDIUM|HIGH", "summary": "200자 이내 요약"}}"""

    await emit_thought(session_id, AgentThought(
        agent_id="technical_analyst",
        role=AgentRole.TECHNICAL_ANALYST,
        status=AgentStatus.THINKING,
        content="기술 지표 패턴 분석 중...",
        metadata={"indicators": indicators},
    ))

    try:
        text = await create_response(
            system="당신은 KOSPI/KOSDAQ 전문 기술적 분석가입니다. 반드시 JSON만 출력하세요.",
            user=prompt,
        )
        result = _safe_parse_json(text, {
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


async def fundamental_analyst(ticker: str, session_id: str) -> dict:
    """펀더멘털 분석 에이전트: 섹터/산업/가격 구조 기반 분석"""
    await emit_thought(session_id, AgentThought(
        agent_id="fundamental_analyst",
        role=AgentRole.FUNDAMENTAL_ANALYST,
        status=AgentStatus.ANALYZING,
        content=f"{ticker} 기업 기본 정보/가격 구조 분석 중...",
    ))

    indicators = get_technical_indicators(ticker)
    stock_info = get_stock_info(ticker)

    if "error" in indicators:
        return {
            "agent": "fundamental_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "summary": "데이터 없음",
        }

    current_price = indicators.get("current_price")
    low_52w = indicators.get("low_52w")
    high_52w = indicators.get("high_52w")
    range_position = "N/A"
    if all(v is not None for v in (current_price, low_52w, high_52w)) and high_52w > low_52w:
        pct = (current_price - low_52w) / (high_52w - low_52w) * 100
        range_position = f"{pct:.1f}%"

    await emit_thought(session_id, AgentThought(
        agent_id="fundamental_analyst",
        role=AgentRole.FUNDAMENTAL_ANALYST,
        status=AgentStatus.THINKING,
        content="섹터/산업/가격 구조 기반 펀더멘털 프록시 분석 중...",
        metadata={
            "sector": stock_info.get("sector", ""),
            "industry": stock_info.get("industry", ""),
            "market": stock_info.get("market", ""),
        },
    ))

    prompt = f"""당신은 한국 주식 펀더멘털 분석가입니다.

종목: {ticker} ({stock_info.get('name', '')})
시장: {stock_info.get('market', 'N/A')}
섹터: {stock_info.get('sector', 'N/A')}
산업: {stock_info.get('industry', 'N/A')}

[가격 구조 데이터]
- 현재가: {_fmt_num(current_price, ',.0f')}원
- MA5: {_fmt_num(indicators.get('ma5'), ',.0f')}
- MA20: {_fmt_num(indicators.get('ma20'), ',.0f')}
- MA60: {_fmt_num(indicators.get('ma60'), ',.0f')}
- 52주 범위: {_fmt_num(low_52w, ',.0f')} ~ {_fmt_num(high_52w, ',.0f')}원
- 52주 범위 내 현재 위치: {range_position}
- 거래량: {int(indicators.get('volume') or 0):,}

위 정보만으로 펀더멘털 관점의 투자 판단을 내려주세요.
JSON만 출력:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "key_signals": ["근거1", "근거2", "근거3"], "risk_level": "LOW|MEDIUM|HIGH", "summary": "200자 이내 요약"}}"""

    try:
        text = await create_response(
            system="당신은 한국 주식 펀더멘털 분석가입니다. 반드시 JSON만 출력하세요.",
            user=prompt,
        )
        result = _safe_parse_json(text, {
            "agent": "fundamental_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "summary": "JSON 파싱 실패",
        })
        result["agent"] = "fundamental_analyst"
        result["raw_data"] = {
            "stock_info": stock_info,
            "indicators": indicators,
            "range_position": range_position,
        }
    except Exception as e:
        result = {
            "agent": "fundamental_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "summary": f"분석 실패: {str(e)[:100]}",
        }

    await emit_thought(session_id, AgentThought(
        agent_id="fundamental_analyst",
        role=AgentRole.FUNDAMENTAL_ANALYST,
        status=AgentStatus.DONE,
        content=f"펀더멘털 분석 완료: {result.get('signal')} (신뢰도 {result.get('confidence', 0)*100:.0f}%)",
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

    try:
        text = await create_response(
            system="당신은 금융 뉴스 감성 분석 전문가입니다. JSON만 출력하세요.",
            user=prompt,
            fast=True,
        )
        result = _safe_parse_json(text, {
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

    try:
        text = await create_response(
            system="당신은 거시경제 분석 전문가입니다. JSON만 출력하세요.",
            user=prompt,
            fast=True,
        )
        result = _safe_parse_json(text, {
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


async def get_signal_for_backtest(ticker: str, indicators: dict) -> dict:
    """
    백테스트 전용 경량 AI 시그널 생성.
    - SSE 없음 (세션 불필요)
    - as_of_date 기준 지표만 입력받아 LLM 판단
    - fast 모델(gpt-5.4-mini) 사용으로 비용 최소화

    Returns: {"signal": "BUY"|"SELL"|"HOLD", "confidence": 0.0~1.0}
    """
    rsi = indicators.get("rsi_14")
    macd = indicators.get("macd")
    macd_signal = indicators.get("macd_signal")
    price = indicators.get("current_price")
    ma20 = indicators.get("ma20")
    ma5 = indicators.get("ma5")
    bb_upper = indicators.get("bb_upper")
    bb_lower = indicators.get("bb_lower")

    prompt = f"""종목코드 {ticker}의 기술 지표:
RSI(14): {f'{rsi:.1f}' if rsi is not None else 'N/A'}
MACD: {f'{macd:.3f}' if macd is not None else 'N/A'}, Signal: {f'{macd_signal:.3f}' if macd_signal is not None else 'N/A'}
MA5: {_fmt_num(ma5, ',.0f')}, MA20: {_fmt_num(ma20, ',.0f')}, 현재가: {_fmt_num(price, ',.0f')}
볼린저 상단: {f'{bb_upper:,.0f}' if bb_upper else 'N/A'}, 하단: {f'{bb_lower:,.0f}' if bb_lower else 'N/A'}

기술적 분석만으로 투자 판단: BUY(매수)/SELL(매도)/HOLD(관망)
JSON만 출력: {{"signal": "BUY"|"SELL"|"HOLD", "confidence": 0.0~1.0, "reason": "50자"}}"""

    try:
        text = await create_response(
            system="한국 주식 기술 분석가. 지표만 보고 JSON으로 시그널 판단.",
            user=prompt,
            fast=True,
        )
        result = _safe_parse_json(text, {"signal": "HOLD", "confidence": 0.5})
        signal = result.get("signal", "HOLD").upper()
        if signal not in ("BUY", "SELL", "HOLD"):
            signal = "HOLD"
        return {
            "signal": signal,
            "confidence": float(result.get("confidence", 0.5)),
            "reason": result.get("reason", ""),
        }
    except Exception:
        return {"signal": "HOLD", "confidence": 0.5, "reason": "오류"}

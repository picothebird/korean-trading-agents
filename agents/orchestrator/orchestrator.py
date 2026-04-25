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
from backend.core.user_runtime_settings import get_runtime_setting
from agents.analyst.analysts import technical_analyst, fundamental_analyst, sentiment_analyst, macro_analyst
from data.market.fetcher import get_stock_info, get_technical_indicators, get_news_async


_VALID_ACTIONS = {"BUY", "SELL", "HOLD"}
_RISK_ORDER = {
    "LOW": 0,
    "MEDIUM": 1,
    "HIGH": 2,
    "CRITICAL": 3,
}


def _normalize_action(action: str) -> str:
    v = str(action or "").strip().upper()
    return v if v in _VALID_ACTIONS else "HOLD"


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def _risk_exceeds(current_level: str, allowed_level: str) -> bool:
    current_rank = _RISK_ORDER.get(str(current_level or "").upper(), _RISK_ORDER["HIGH"])
    allowed_rank = _RISK_ORDER.get(str(allowed_level or "").upper(), _RISK_ORDER["HIGH"])
    return current_rank > allowed_rank


def _compute_judge_score(analyst_details: dict, pm_action: str) -> dict:
    """MS-S7: 강세 vs 약세 토론 판정 점수.

    분석가 신뢰도 가중 평균으로 강세/약세 우세를 0~100점으로 환산.
    LLM 호출 없이 결정론적으로 회의록 결정타 라운드 시각화에 사용.
    """
    bull_conf: list[float] = []
    bear_conf: list[float] = []
    for d in (analyst_details or {}).values():
        if not isinstance(d, dict):
            continue
        sig = str(d.get("signal", "")).upper()
        c = float(d.get("confidence", 0.0) or 0.0)
        if sig == "BUY":
            bull_conf.append(c)
        elif sig == "SELL":
            bear_conf.append(c)

    bull_score = round(((sum(bull_conf) / len(bull_conf)) * 100) if bull_conf else 0.0, 1)
    bear_score = round(((sum(bear_conf) / len(bear_conf)) * 100) if bear_conf else 0.0, 1)

    if bull_score > bear_score + 5:
        winner = "BULL"
        reasoning = f"강세 분석가 평균 신뢰도 {bull_score}점이 약세 {bear_score}점을 분명히 앞섭니다."
    elif bear_score > bull_score + 5:
        winner = "BEAR"
        reasoning = f"약세 분석가 평균 신뢰도 {bear_score}점이 강세 {bull_score}점을 분명히 앞섭니다."
    else:
        winner = "DRAW"
        reasoning = f"강세 {bull_score}점, 약세 {bear_score}점으로 우열을 가리기 어렵습니다."

    return {
        "bull_score": bull_score,
        "bear_score": bear_score,
        "winner": winner,
        "final_action": pm_action,
        "reasoning": reasoning,
    }


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
    p = max(0.0, min(1.0, p))
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
    company_name = str(get_stock_info(ticker).get("name", "") or "")
    
    bull_stance = ""
    bear_stance = ""
    previous_round_price: float | None = None
    bull_rounds: list[dict] = []
    bear_rounds: list[dict] = []
    
    for round_num in range(1, rounds + 1):
        # 라운드마다 최신 시세/뉴스를 재조회해 토론 컨텍스트를 갱신한다.
        market_summary = "실시간 가격 재조회 실패"
        news_summary = "뉴스 재조회 실패"
        latest_price = None
        latest_change_pct = None
        intraround_change_pct = None
        top_news_titles: list[str] = []

        try:
            indicators = get_technical_indicators(ticker, days=45)
            latest_price = indicators.get("current_price")
            latest_change_pct = indicators.get("change_pct")
            volume = indicators.get("volume")

            if isinstance(latest_price, (int, float)) and previous_round_price and previous_round_price > 0:
                intraround_change_pct = (float(latest_price) - previous_round_price) / previous_round_price * 100.0
            if isinstance(latest_price, (int, float)):
                previous_round_price = float(latest_price)

            latest_price_text = f"{float(latest_price):,.0f}원" if isinstance(latest_price, (int, float)) else "N/A"
            latest_change_text = f"{float(latest_change_pct):+.2f}%" if isinstance(latest_change_pct, (int, float)) else "N/A"
            intraround_change_text = f"{float(intraround_change_pct):+.2f}%" if isinstance(intraround_change_pct, (int, float)) else "N/A"
            volume_text = f"{int(volume):,}" if isinstance(volume, int) else "N/A"
            market_summary = (
                f"현재가 {latest_price_text} | 일중등락 {latest_change_text} | "
                f"직전 라운드 대비 {intraround_change_text} | 거래량 {volume_text}"
            )
        except Exception:
            pass

        try:
            latest_news = await get_news_async(ticker, company_name)
            for item in latest_news[:3]:
                title = str(item.get("title", "") or "").strip()
                if title:
                    top_news_titles.append(title)
            if top_news_titles:
                news_summary = " | ".join(top_news_titles)
            else:
                news_summary = "신규 뉴스 없음"
        except Exception:
            pass

        # 강세 연구원
        await emit_thought(session_id, AgentThought(
            agent_id="bull_researcher",
            role=AgentRole.BULL_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] 매수 논거 수립 중... ({market_summary})",
        ))

        bull_prompt = f"""당신은 강세(매수) 관점의 주식 연구원입니다.

[분석팀 결과]
{analysis_summary}

[라운드 최신 데이터 재조회]
- 시세: {market_summary}
- 뉴스 헤드라인: {news_summary}

[약세 측 주장 (이전 라운드)]
{bear_stance if bear_stance else '(첫 라운드)'}

종목 {ticker}에 대해 매수를 지지하는 논거를 제시하세요. 
JSON: {{"argument": "주장 (200자)", "key_points": ["포인트1", "포인트2", "포인트3"], "confidence": 0.0~1.0}}"""

        bull_key_points = []
        try:
            bull_resp_text = await create_response(
                system="당신은 강세 주식 연구원입니다. JSON만 출력하세요.",
                user=bull_prompt,
                fast=True,
            )
            bull_result = _safe_parse_json(bull_resp_text, {})
            bull_stance = bull_result.get("argument", bull_resp_text)
            bull_key_points = bull_result.get("key_points", [])
        except Exception as e:
            bull_stance = f"강세 관점 생성 실패: {str(e)[:80]}"

        bull_rounds.append({
            "round": round_num,
            "argument": bull_stance,
            "key_points": list(bull_key_points or []),
        })
        await emit_thought(session_id, AgentThought(
            agent_id="bull_researcher",
            role=AgentRole.BULL_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] {bull_stance}",
            metadata={
                "round": round_num,
                "key_points": bull_key_points,
                "latest_price": latest_price,
                "latest_change_pct": latest_change_pct,
                "intraround_change_pct": intraround_change_pct,
                "news_titles": top_news_titles,
            },
        ))

        # 약세 연구원
        await emit_thought(session_id, AgentThought(
            agent_id="bear_researcher",
            role=AgentRole.BEAR_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] 매도 논거 수립 중... ({market_summary})",
        ))

        bear_prompt = f"""당신은 약세(매도/관망) 관점의 주식 연구원입니다.

[분석팀 결과]
{analysis_summary}

[라운드 최신 데이터 재조회]
- 시세: {market_summary}
- 뉴스 헤드라인: {news_summary}

[강세 측 주장]
{bull_stance}

종목 {ticker}에 대해 매도 또는 관망을 지지하는 논거를 제시하세요.
JSON: {{"argument": "주장 (200자)", "key_points": ["포인트1", "포인트2", "포인트3"], "confidence": 0.0~1.0}}"""

        bear_key_points = []
        try:
            bear_resp_text = await create_response(
                system="당신은 약세 주식 연구원입니다. JSON만 출력하세요.",
                user=bear_prompt,
                fast=True,
            )
            bear_result = _safe_parse_json(bear_resp_text, {})
            bear_stance = bear_result.get("argument", bear_resp_text)
            bear_key_points = bear_result.get("key_points", [])
        except Exception as e:
            bear_stance = f"약세 관점 생성 실패: {str(e)[:80]}"

        bear_rounds.append({
            "round": round_num,
            "argument": bear_stance,
            "key_points": list(bear_key_points or []),
        })
        await emit_thought(session_id, AgentThought(
            agent_id="bear_researcher",
            role=AgentRole.BEAR_RESEARCHER,
            status=AgentStatus.DEBATING,
            content=f"[라운드 {round_num}] {bear_stance}",
            metadata={
                "round": round_num,
                "key_points": bear_key_points,
                "latest_price": latest_price,
                "latest_change_pct": latest_change_pct,
                "intraround_change_pct": intraround_change_pct,
                "news_titles": top_news_titles,
            },
        ))

    # 토론 종료 → 양측 연구원 DONE 신호 (프론트 L2 진행률 마감)
    final_bull_points = bull_rounds[-1]["key_points"] if bull_rounds else []
    final_bear_points = bear_rounds[-1]["key_points"] if bear_rounds else []
    await emit_thought(session_id, AgentThought(
        agent_id="bull_researcher",
        role=AgentRole.BULL_RESEARCHER,
        status=AgentStatus.DONE,
        content=f"강세론 정리 ({len(bull_rounds)}라운드): {bull_stance[:140]}",
        metadata={"rounds": bull_rounds, "final_key_points": final_bull_points},
    ))
    await emit_thought(session_id, AgentThought(
        agent_id="bear_researcher",
        role=AgentRole.BEAR_RESEARCHER,
        status=AgentStatus.DONE,
        content=f"약세론 정리 ({len(bear_rounds)}라운드): {bear_stance[:140]}",
        metadata={"rounds": bear_rounds, "final_key_points": final_bear_points},
    ))

    return {
        "bull_stance": bull_stance,
        "bear_stance": bear_stance,
        "bull_rounds": bull_rounds,
        "bear_rounds": bear_rounds,
        "bull_key_points": final_bull_points,
        "bear_key_points": final_bear_points,
        "rounds": len(bull_rounds),
    }


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
            try:
                confidences.append(float(val.get("confidence", 0.5)))
            except (TypeError, ValueError):
                confidences.append(0.5)

    kelly_size = _kelly_position_size(confidences)
    kelly_pct = round(kelly_size * 100, 1)
    avg_confidence_pct = (sum(confidences) / len(confidences) * 100) if confidences else 50.0

    prompt = f"""당신은 퀀트 리스크 매니저입니다.

[분석 결과 요약]
{json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ['signal','confidence','risk_level','summary']}
             for k, v in analyst_results.items() if isinstance(v, dict)}, ensure_ascii=False)}

[연구원 토론 결과]
강세론: {debate_results.get('bull_stance', '')[:200]}
약세론: {debate_results.get('bear_stance', '')[:200]}

[Kelly Criterion 계산 결과]
- 에이전트 평균 신뢰도: {avg_confidence_pct:.1f}% → Half-Kelly 권장 포지션: {kelly_pct}%

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

    pm_action = _normalize_action(pm_result.get("action", "HOLD"))
    pm_confidence = _clamp01(float(pm_result.get("confidence", 0.3)))

    # 분석가별 상세 정보(프론트 회의록용)
    analyst_details: dict[str, dict] = {}
    for key, val in analyst_results.items():
        if isinstance(val, dict):
            analyst_details[key] = {
                "signal": val.get("signal", "HOLD"),
                "confidence": float(val.get("confidence", 0.5) or 0.5),
                "summary": val.get("summary") or val.get("reason") or "",
                "key_signals": val.get("key_signals") or val.get("key_points") or [],
                "risk_level": val.get("risk_level"),
            }

    debate_block = {
        "bull_stance": debate_results.get("bull_stance", ""),
        "bear_stance": debate_results.get("bear_stance", ""),
        "bull_key_points": debate_results.get("bull_key_points", []),
        "bear_key_points": debate_results.get("bear_key_points", []),
        "bull_rounds": debate_results.get("bull_rounds", []),
        "bear_rounds": debate_results.get("bear_rounds", []),
        "rounds": int(debate_results.get("rounds", 0) or 0),
        # MS-S7: 토론 판정 점수 — 분석가 신뢰도 가중 평균으로 강세/약세 우세 판단.
        # winner는 단순 다수결 + 신뢰도 가중. 회의록에서 결정타 라운드 강조용.
        "judge_score": _compute_judge_score(analyst_details, pm_action),
    }

    risk_block = {
        "risk_level": risk_result.get("risk_level"),
        "max_position_pct": risk_result.get("max_position_pct"),
        "kelly_position_pct": kelly_pct,
        "stop_loss_pct": risk_result.get("stop_loss_pct"),
        "key_risks": list(risk_result.get("key_risks", []) or [])[:5],
        "summary": risk_result.get("summary", ""),
        "avg_confidence_pct": round(
            (sum(confidences) / len(confidences) * 100) if confidences else 50.0, 1
        ),
    }

    decision = TradeDecision(
        action=pm_action,
        ticker=ticker,
        confidence=pm_confidence,
        reasoning=pm_result.get("reasoning", ""),
        agents_summary={
            "analyst_signals": signal_counts,
            "analyst_details": analyst_details,
            "debate": debate_block,
            "risk": risk_block,
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


async def guru_manager(
    ticker: str,
    analyst_results: dict,
    debate_results: dict,
    risk_result: dict,
    base_decision: TradeDecision,
    session_id: str,
) -> TradeDecision:
    """사용자 철학 + 룰 기반 정책을 반영하는 최종 GURU 레이어."""
    if not bool(get_runtime_setting("guru_enabled", settings.guru_enabled, use_global_when_unset=True)):
        return base_decision

    await emit_thought(session_id, AgentThought(
        agent_id="guru_agent",
        role=AgentRole.GURU_AGENT,
        status=AgentStatus.DEBATING,
        content="GURU 에이전트가 사용자 투자 철학과 리스크 룰을 반영해 최종 결정을 검토 중...",
    ))

    risk_profile = str(get_runtime_setting("guru_risk_profile", settings.guru_risk_profile, use_global_when_unset=True) or "balanced")
    principles = str(get_runtime_setting("guru_investment_principles", settings.guru_investment_principles, use_global_when_unset=True) or "").strip()
    min_confidence = _clamp01(float(get_runtime_setting("guru_min_confidence_to_act", settings.guru_min_confidence_to_act, use_global_when_unset=True)))
    max_risk_level = str(get_runtime_setting("guru_max_risk_level", settings.guru_max_risk_level, use_global_when_unset=True) or "HIGH").upper().strip()
    max_position_pct = max(
        1.0,
        min(
            100.0,
            float(get_runtime_setting("guru_max_position_pct", settings.guru_max_position_pct, use_global_when_unset=True)),
        ),
    )
    debate_enabled = bool(get_runtime_setting("guru_debate_enabled", settings.guru_debate_enabled, use_global_when_unset=True))
    require_user_confirmation = bool(
        get_runtime_setting(
            "guru_require_user_confirmation",
            settings.guru_require_user_confirmation,
            use_global_when_unset=True,
        )
    )

    llm_action = _normalize_action(base_decision.action)
    llm_confidence = _clamp01(float(base_decision.confidence))
    llm_reasoning = str(base_decision.reasoning or "")
    llm_notes: list[str] = []

    if debate_enabled:
        prompt = f"""당신은 사용자 개인화 투자 정책을 대변하는 GURU 에이전트입니다.

[사용자 투자 철학]
{principles if principles else '(미입력) 기본 원칙: 큰 손실 회피와 일관된 리스크 관리 우선'}

[사용자 정책 룰]
- risk_profile: {risk_profile}
- min_confidence_to_act: {min_confidence:.2f}
- max_risk_level: {max_risk_level}
- max_position_pct: {max_position_pct:.1f}
- require_user_confirmation: {require_user_confirmation}

[포트폴리오 매니저 초안]
action={base_decision.action}, confidence={base_decision.confidence:.3f}, reasoning={str(base_decision.reasoning or '')[:400]}

[리스크 매니저]
risk_level={risk_result.get('risk_level')}, approval={risk_result.get('approval')}, stop_loss_pct={risk_result.get('stop_loss_pct')}

[분석 요약]
{json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ['signal', 'confidence', 'risk_level', 'summary']}
             for k, v in analyst_results.items() if isinstance(v, dict)}, ensure_ascii=False)}

[토론 요약]
강세론: {str(debate_results.get('bull_stance', ''))[:260]}
약세론: {str(debate_results.get('bear_stance', ''))[:260]}

출력은 JSON만:
{{"action":"BUY|SELL|HOLD","confidence":0.0~1.0,"reasoning":"300자 이내","policy_notes":["핵심 포인트1","핵심 포인트2"]}}"""

        try:
            guru_text = await create_response(
                system="당신은 개인화 투자 원칙을 엄격히 적용하는 GURU 에이전트입니다. JSON만 출력하세요.",
                user=prompt,
                fast=True,
            )
            guru_result = _safe_parse_json(guru_text, {})

            llm_action = _normalize_action(guru_result.get("action", llm_action))

            try:
                llm_confidence = _clamp01(float(guru_result.get("confidence", llm_confidence)))
            except (TypeError, ValueError):
                pass

            llm_reasoning = str(guru_result.get("reasoning", "") or llm_reasoning)

            raw_notes = guru_result.get("policy_notes", [])
            if isinstance(raw_notes, list):
                llm_notes = [str(x).strip() for x in raw_notes if str(x).strip()][:5]
        except Exception as e:
            llm_notes = [f"LLM 토론 실패로 룰 기반만 적용: {str(e)[:100]}"]

    final_action = llm_action
    final_confidence = llm_confidence
    final_reasoning = llm_reasoning
    applied_rules: list[str] = []

    risk_level = str(risk_result.get("risk_level", "HIGH") or "HIGH").upper()

    if final_action in {"BUY", "SELL"} and final_confidence < min_confidence:
        applied_rules.append(
            f"신뢰도 하한 룰: {final_confidence*100:.1f}% < {min_confidence*100:.1f}%"
        )
        final_action = "HOLD"
        final_reasoning = f"신뢰도 임계치 미달로 관망 전환. {final_reasoning}".strip()

    if final_action == "BUY" and _risk_exceeds(risk_level, max_risk_level):
        applied_rules.append(f"리스크 상한 룰: {risk_level} > {max_risk_level}")
        final_action = "HOLD"
        final_reasoning = f"허용 리스크를 초과해 신규 매수를 보류합니다. {final_reasoning}".strip()

    try:
        position_size_pct = float(base_decision.agents_summary.get("position_size_pct", 0.0) or 0.0)
    except (TypeError, ValueError):
        position_size_pct = 0.0

    if position_size_pct > max_position_pct:
        base_decision.agents_summary["position_size_pct"] = round(max_position_pct, 2)
        applied_rules.append(
            f"포지션 상한 룰: {position_size_pct:.1f}% -> {max_position_pct:.1f}%"
        )

    requires_human = bool(base_decision.agents_summary.get("requires_human_approval"))
    if require_user_confirmation and final_action in {"BUY", "SELL"}:
        requires_human = True
        applied_rules.append("사용자 실행 확인 룰: BUY/SELL 액션은 최종 사용자 승인 필요")

    original_action = _normalize_action(base_decision.action)
    action_changed = original_action != final_action
    if action_changed:
        applied_rules.append(f"GURU 최종 액션 조정: {original_action} -> {final_action}")

    extra_notes: list[str] = []
    if llm_notes:
        extra_notes.append("GURU 토론: " + " | ".join(llm_notes[:3]))
    if applied_rules:
        extra_notes.append("GURU 룰: " + " | ".join(applied_rules[:4]))
    if extra_notes:
        final_reasoning = f"{final_reasoning}\n\n[{'] ['.join(extra_notes)}]"

    base_decision.action = final_action
    base_decision.confidence = round(_clamp01(final_confidence), 4)
    base_decision.reasoning = final_reasoning[:1500]
    base_decision.agents_summary["requires_human_approval"] = requires_human
    base_decision.agents_summary["guru"] = {
        "enabled": True,
        "risk_profile": risk_profile,
        "debate_enabled": debate_enabled,
        "investment_principles": principles,
        "min_confidence_to_act": round(min_confidence, 4),
        "max_risk_level": max_risk_level,
        "max_position_pct": round(max_position_pct, 2),
        "require_user_confirmation": require_user_confirmation,
        "llm_action": llm_action,
        "llm_confidence": round(llm_confidence, 4),
        "final_action": final_action,
        "action_changed": action_changed,
        "rules_applied": applied_rules,
        "notes": llm_notes,
    }

    status_msg = (
        f"GURU 검토 완료: {original_action}→{final_action} "
        f"(신뢰도 {base_decision.confidence*100:.0f}%)"
    )
    if requires_human:
        status_msg += " | 사용자 승인 필요"

    await emit_thought(session_id, AgentThought(
        agent_id="guru_agent",
        role=AgentRole.GURU_AGENT,
        status=AgentStatus.DONE,
        content=status_msg,
        metadata=base_decision.agents_summary.get("guru", {}),
    ))

    return base_decision


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
    fund_task = asyncio.create_task(fundamental_analyst(ticker, session_id))
    sent_task = asyncio.create_task(sentiment_analyst(ticker, company_name, session_id))
    macro_task = asyncio.create_task(macro_analyst(session_id))

    tech_result, fund_result, sent_result, macro_result = await asyncio.gather(
        tech_task, fund_task, sent_task, macro_task, return_exceptions=True
    )

    analyst_results = {
        "technical": tech_result if not isinstance(tech_result, Exception) else {"signal": "HOLD"},
        "fundamental": fund_result if not isinstance(fund_result, Exception) else {"signal": "HOLD"},
        "sentiment": sent_result if not isinstance(sent_result, Exception) else {"signal": "HOLD"},
        "macro": macro_result if not isinstance(macro_result, Exception) else {"signal": "HOLD"},
    }

    # 2단계: 연구원 토론
    rounds = int(get_runtime_setting("max_debate_rounds", settings.max_debate_rounds, use_global_when_unset=True) or settings.max_debate_rounds)
    rounds = max(1, min(8, rounds))
    debate = await researcher_debate(ticker, analyst_results, session_id, rounds=rounds)

    # 3단계: 리스크 매니저
    risk = await risk_manager(ticker, analyst_results, debate, session_id)

    # 4단계: 포트폴리오 매니저 최종 결정
    decision = await portfolio_manager(ticker, analyst_results, debate, risk, session_id)

    # 5단계: GURU 사용자 커스터마이징 레이어
    decision = await guru_manager(
        ticker=ticker,
        analyst_results=analyst_results,
        debate_results=debate,
        risk_result=risk,
        base_decision=decision,
        session_id=session_id,
    )

    # 스트림 종료 신호
    from backend.core.events import get_thought_queue
    queue = get_thought_queue(session_id)
    await queue.put(None)

    return decision

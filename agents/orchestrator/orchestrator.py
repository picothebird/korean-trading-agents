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
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.core.config import settings
from backend.core.events import (
    AgentRole, AgentStatus, AgentThought, TradeDecision,
    emit_thought
)
from backend.core.llm import create_structured_response
from backend.core.user_runtime_settings import get_runtime_setting
from agents.analyst.analysts import technical_analyst, fundamental_analyst, sentiment_analyst, macro_analyst
from data.market.fetcher import get_stock_info, get_technical_indicators, get_news_async
from backend.services.memory_service import build_memory_block, record_decision
from agents.schemas import (
    DebateStanceOutput,
    RiskOutput,
    PortfolioManagerOutput,
    GuruOutput,
)


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
    """MS-S7: 강세 vs 약세 토론 판정 점수 (중립축 기반).

    각 분석가의 의견을 0~100 스칼라로 매핑한 뒤 평균 → bull_score.
    bear_score = 100 - bull_score 로 강세/약세가 항상 보완 관계가 되도록 정의.

    매핑 규칙 (직관적):
    - BUY  (신뢰도 c): 50 + 50·c        → c=1.0 이면 100, c=0.5 이면 75
    - SELL (신뢰도 c): 50 - 50·c        → c=1.0 이면   0, c=0.5 이면 25
    - HOLD (신뢰도 c): 50 (중립)        → 신뢰도 무관하게 정중앙
    - 신호 없는 항목은 평균에서 제외

    예시:
    - 4명 모두 BUY @0.7 → bull=85, bear=15  (강세이지만 약세도 0이 아님)
    - 1 BUY @0.8 + 3 HOLD @0.5 → bull=(90+50+50+50)/4=60, bear=40
    - 분석가 전무 → bull=50, bear=50 (중립)
    """
    scores: list[float] = []
    for d in (analyst_details or {}).values():
        if not isinstance(d, dict):
            continue
        sig = str(d.get("signal", "")).upper()
        c = float(d.get("confidence", 0.0) or 0.0)
        c = max(0.0, min(1.0, c))
        if sig == "BUY":
            scores.append(50.0 + 50.0 * c)
        elif sig == "SELL":
            scores.append(50.0 - 50.0 * c)
        elif sig == "HOLD":
            scores.append(50.0)

    if not scores:
        bull_score = 50.0
    else:
        bull_score = sum(scores) / len(scores)

    bull_score = round(bull_score, 1)
    bear_score = round(100.0 - bull_score, 1)

    # 우세 판단 임계값 (10점 차이 = 한 쪽이 60:40 이상)
    if bull_score > bear_score + 10:
        winner = "BULL"
        reasoning = (
            f"분석가 의견 종합 결과 강세 {bull_score}점 vs 약세 {bear_score}점으로 "
            f"강세가 우세합니다."
        )
    elif bear_score > bull_score + 10:
        winner = "BEAR"
        reasoning = (
            f"분석가 의견 종합 결과 약세 {bear_score}점 vs 강세 {bull_score}점으로 "
            f"약세가 우세합니다."
        )
    else:
        winner = "DRAW"
        reasoning = (
            f"강세 {bull_score}점, 약세 {bear_score}점으로 우열이 뚜렷하지 않아 "
            f"중립~혼조 구간입니다."
        )

    return {
        "bull_score": bull_score,
        "bear_score": bear_score,
        "winner": winner,
        "final_action": pm_action,
        "reasoning": reasoning,
    }



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
            bull_out = await create_structured_response(
                system="당신은 강세 주식 연구원입니다.",
                user=bull_prompt,
                schema_model=DebateStanceOutput,
                fast=True,
            )
            bull_stance = bull_out.argument
            bull_key_points = list(bull_out.key_points)
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
            bear_out = await create_structured_response(
                system="당신은 약세 주식 연구원입니다.",
                user=bear_prompt,
                schema_model=DebateStanceOutput,
                fast=True,
            )
            bear_stance = bear_out.argument
            bear_key_points = list(bear_out.key_points)
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

    # ── 변동성 기반 손절 계산 ──────────────────────────────
    # 기술 분석가의 raw_data 에 ATR(14) / 20일 σ / 20일 스윙로우가 들어있다.
    # 세 후보를 모두 산출해 가장 보수적인(=가장 큰) 값을 LLM 에게 권장값으로 제시한다.
    tech = analyst_results.get("technical", {}) if isinstance(analyst_results, dict) else {}
    raw = tech.get("raw_data", {}) if isinstance(tech, dict) else {}
    cur_price = raw.get("current_price")
    atr_pct = raw.get("atr_pct")              # ATR(14) / 현재가 × 100
    sigma_pct = raw.get("sigma_20d_pct")      # 일간수익률 표준편차(20일) × 100
    swing_drop_pct = raw.get("swing_low_drop_pct")  # 직전 20일 스윙로우까지 낙폭 %

    candidates: list[tuple[str, float]] = []
    if isinstance(atr_pct, (int, float)) and atr_pct > 0:
        # 1.5×ATR — Chandelier/Wilder 류 트레이더 스탠다드. 하루 평균 변동의 1.5배 안에서는 정상 노이즈.
        candidates.append(("1.5×ATR", round(1.5 * float(atr_pct), 2)))
    if isinstance(sigma_pct, (int, float)) and sigma_pct > 0:
        # σ × √5 — 5거래일 보유 가정 표준편차. 노이즈로 털리지 않을 최소 보유 임계.
        candidates.append(("σ20·√5", round(float(sigma_pct) * (5 ** 0.5), 2)))

    # 손절폭 산정: 변동성 기반 후보 중 큰 값(=노이즈에 안 털리는 최소 폭).
    # 스윙로우는 컨텍스트로만 LLM 에 노출 — 추세 약세 종목은 스윙로우가 매우 멀어
    # 그대로 쓰면 손절 의미가 사라지므로 산정식에는 포함하지 않는다.
    if candidates:
        recommended_stop = max(c[1] for c in candidates)
        recommended_stop = max(3.0, min(15.0, recommended_stop))
    else:
        recommended_stop = None

    vol_block_lines = []
    if cur_price:
        vol_block_lines.append(f"- 현재가: {cur_price:,.0f}원")
    if atr_pct is not None:
        vol_block_lines.append(f"- ATR(14): {atr_pct:.2f}% — 일평균 진폭")
    if sigma_pct is not None:
        vol_block_lines.append(f"- 20일 σ: {sigma_pct:.2f}% — 일간수익률 표준편차")
    if swing_drop_pct is not None:
        vol_block_lines.append(f"- 직전 스윙로우(20D)까지 낙폭: {swing_drop_pct:.2f}% (참고용)")
    if candidates:
        cand_str = ", ".join(f"{name} {val:.1f}%" for name, val in candidates)
        vol_block_lines.append(f"- 변동성 기반 후보: {cand_str}")
        vol_block_lines.append(
            f"- **권장 손절폭(변동성 후보 max, 3~15 클램프): {recommended_stop:.1f}%**"
        )
    vol_block = "\n".join(vol_block_lines) if vol_block_lines else "- (변동성 데이터 미수집 — 보수적으로 5% 적용)"

    prompt = f"""당신은 퀀트 리스크 매니저입니다.

[분석 결과 요약]
{json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ['signal','confidence','risk_level','summary']}
             for k, v in analyst_results.items() if isinstance(v, dict)}, ensure_ascii=False)}

[연구원 토론 결과]
강세론: {debate_results.get('bull_stance', '')[:200]}
약세론: {debate_results.get('bear_stance', '')[:200]}

[Kelly Criterion 계산 결과]
- 에이전트 평균 신뢰도: {avg_confidence_pct:.1f}% → Half-Kelly 권장 포지션: {kelly_pct}%

[변동성·손절 산정 입력]
{vol_block}

한국 시장 특수 조건:
- 일일 가격 제한폭 ±30% — stop_loss_pct 는 절대 30 을 넘기지 말 것.
- 공매도 제한 → 롱 전략만 사용.
- 최대 허용 포지션: 25%.

손절폭 결정 규칙:
1. 위 "권장 손절폭" 이 제시되면 그 값을 0.5% 단위로 반올림한 값을 stop_loss_pct 로 사용.
2. 종목별 변동성에 따라 다르게 답해야 정상이다 — 어떤 값이든 8.0% 로 수렴하지 말 것.
3. 권장값이 없으면 ATR/σ/스윙로우 중 입력된 후보의 최댓값을 기준으로 산정.
4. 모두 없으면 5.0% 폴백.
5. 최종 stop_loss_pct 는 반드시 [3.0, 15.0] 범위 내.

종목 {ticker}의 투자 리스크를 평가하세요.
JSON: {{"risk_level": "LOW|MEDIUM|HIGH|CRITICAL", "max_position_pct": 0~25, "kelly_position_pct": {kelly_pct}, "stop_loss_pct": <위 규칙으로 산출>, "key_risks": ["리스크1", "리스크2", "리스크3"], "approval": true|false, "requires_human_approval": true|false, "summary": "150자 — 손절폭의 근거(ATR / σ / 스윙로우 중 무엇)를 명시"}}

requires_human_approval=true 조건: 신뢰도 80% 이상이고 포지션 20% 초과, 또는 위험도 CRITICAL"""

    try:
        risk_out = await create_structured_response(
            system="당신은 퀀트 리스크 관리 전문가입니다. Kelly Criterion 과 ATR/σ 변동성 데이터를 반영해 손절폭을 종목별로 다르게 산출합니다.",
            user=prompt,
            schema_model=RiskOutput,
        )
        result = risk_out.model_dump()
    except Exception as e:
        # 파싱 실패 시 — 변동성 권장값이 있으면 그걸 폴백으로, 없으면 5% 폴백.
        fallback_stop = recommended_stop if recommended_stop is not None else 5.0
        result = {
            "risk_level": "HIGH",
            "max_position_pct": 5,
            "kelly_position_pct": kelly_pct,
            "stop_loss_pct": round(fallback_stop, 1),
            "key_risks": [],
            "approval": False,
            "requires_human_approval": False,
            "summary": f"분석 오류: {str(e)[:100]}",
        }

    result["kelly_position_pct"] = kelly_pct  # 항상 오버라이드로 정확값 유지
    # 변동성 입력값을 결과에도 보존 — 인스펙터/회의록에서 손절 근거 추적 가능
    result["volatility_inputs"] = {
        "atr_pct": atr_pct,
        "sigma_20d_pct": sigma_pct,
        "swing_low_drop_pct": swing_drop_pct,
        "recommended_stop_pct": recommended_stop,
        "candidates": candidates,
    }

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
    memory_block: str = "",
) -> TradeDecision:
    """포트폴리오 매니저: 최종 매매 결정 (인간 개입 가능)

    memory_block: build_memory_block() 결과 — 과거 동일 종목 의사결정 회고 텍스트.
                  비어있으면 (신규 사용자/로그인 안됨) 무시하고 동작.
    """
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
{(chr(10) + memory_block) if memory_block else ''}
종목 {ticker}에 대한 최종 투자 결정을 내리세요.
Kelly 모델 기반 적정 포지션: {position_pct:.1f}%

JSON: {{"action": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "reasoning": "결정 근거 300자", "position_size_pct": {position_pct:.0f}, "entry_strategy": "진입 전략 (가격대, 분할 여부)", "exit_strategy": "청산 전략 (목표가, 손절가)"}}"""


    try:
        pm_out = await create_structured_response(
            system="당신은 최종 투자 결정권자입니다. Kelly Criterion을 반영하세요.",
            user=prompt,
            schema_model=PortfolioManagerOutput,
        )
        pm_result = pm_out.model_dump()
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
    memory_block: str = "",
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
{(chr(10) + memory_block) if memory_block else ''}
출력은 JSON만:
{{"action":"BUY|SELL|HOLD","confidence":0.0~1.0,"reasoning":"300자 이내","policy_notes":["핵심 포인트1","핵심 포인트2"]}}"""

        try:
            guru_out = await create_structured_response(
                system="당신은 개인화 투자 원칙을 엄격히 적용하는 GURU 에이전트입니다.",
                user=prompt,
                schema_model=GuruOutput,
                fast=True,
            )
            llm_action = _normalize_action(guru_out.action)
            llm_confidence = _clamp01(float(guru_out.confidence))
            llm_reasoning = str(guru_out.reasoning or llm_reasoning)
            llm_notes = [str(x).strip() for x in guru_out.policy_notes if str(x).strip()][:5]
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


async def run_analysis(
    ticker: str,
    session_id: str,
    user_id: str | None = None,
) -> TradeDecision:
    """전체 에이전트 파이프라인 실행.

    user_id: 메모리/리플렉션 루프 활성화용 (옵션). 미지정 시 메모리 미사용.
    """
    stock_info = get_stock_info(ticker)
    company_name = stock_info.get("name", "")

    await emit_thought(session_id, AgentThought(
        agent_id="system",
        role=AgentRole.PORTFOLIO_MANAGER,
        status=AgentStatus.IDLE,
        content=f"🚀 분석 시작: {ticker} ({company_name})",
        metadata={"ticker": ticker, "company": company_name},
    ))

    # 0단계: 메모리 회상 (사용자가 식별된 경우만)
    memory_block = ""
    if user_id:
        try:
            memory_block = await build_memory_block(user_id, ticker, recent_n=5, each_extreme=1)
        except Exception:
            memory_block = ""
        if memory_block:
            await emit_thought(session_id, AgentThought(
                agent_id="memory",
                role=AgentRole.PORTFOLIO_MANAGER,
                status=AgentStatus.THINKING,
                content="과거 동일 종목 의사결정 회고를 결정 단계에 주입합니다.",
                metadata={"memory_block_chars": len(memory_block)},
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

    # 4단계: 포트폴리오 매니저 최종 결정 (메모리 주입)
    decision = await portfolio_manager(
        ticker, analyst_results, debate, risk, session_id, memory_block=memory_block,
    )

    # 5단계: GURU 사용자 커스터마이징 레이어 (메모리 주입)
    decision = await guru_manager(
        ticker=ticker,
        analyst_results=analyst_results,
        debate_results=debate,
        risk_result=risk,
        base_decision=decision,
        session_id=session_id,
        memory_block=memory_block,
    )

    # 6단계: 의사결정 메모리 영속화 (사용자가 식별된 경우만)
    if user_id:
        try:
            summary = decision.agents_summary or {}
            sig = summary.get("analyst_signals") or {"BUY": 0, "SELL": 0, "HOLD": 0}
            risk_block = summary.get("risk") or {}
            avg_conf = float(risk_block.get("avg_confidence_pct", 0.0) or 0.0) / 100.0
            entry_price = None
            try:
                ind = get_technical_indicators(ticker)
                entry_price = ind.get("current_price")
            except Exception:
                pass
            decision_id = await record_decision(
                user_id=user_id,
                ticker=ticker,
                session_id=session_id,
                action=decision.action,
                confidence=float(decision.confidence or 0.0),
                position_pct=float(summary.get("position_size_pct", 0.0) or 0.0),
                reasoning=str(decision.reasoning or ""),
                agent_signals=sig,
                avg_confidence=avg_conf,
                entry_price=entry_price if isinstance(entry_price, (int, float)) else None,
            )
            if decision_id:
                # 메모리 ID 를 호출자가 outcome 갱신에 쓸 수 있도록 노출
                decision.agents_summary["memory_decision_id"] = decision_id
        except Exception:
            # 메모리 저장 실패는 사용자 응답을 방해하지 않는다.
            pass

    return decision

"""
분석 에이전트 팀
- 기술적 분석가: 차트, 기술지표 기반
- 펀더멘털 분석가: 재무 기반
- 감성 분석가: 뉴스/여론 기반
- 매크로 분석가: 환율/금리/시장 환경
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.core.events import AgentRole, AgentStatus, AgentThought, emit_thought
from backend.core.llm import create_structured_response
from data.market.fetcher import get_technical_indicators, get_stock_info, get_market_index, get_news_async
from data.market import dart as dart_api
from data.market.news import fetch_news_and_disclosures
from agents.schemas import (
    AnalystOutput,
    SentimentAnalystOutput,
    MacroAnalystOutput,
    BacktestSignalOutput,
)


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
        out = await create_structured_response(
            system="당신은 KOSPI/KOSDAQ 전문 기술적 분석가입니다.",
            user=prompt,
            schema_model=AnalystOutput,
        )
        result = out.model_dump()
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
    """펀더멘털 분석 에이전트.

    데이터 우선순위:
    1) OpenDART 재무제표 + 비율(매출/영업이익/순이익/ROE/부채비율 등)
    2) 가격 구조 보조 지표 (52주 위치, 이평선)
    3) 종목 메타 (섹터/산업)

    DART_API_KEY 미설정 시 1) 단계가 비어 있고 LLM이 그 사실을 인지한 채 보수적으로 판단한다.
    """
    await emit_thought(session_id, AgentThought(
        agent_id="fundamental_analyst",
        role=AgentRole.FUNDAMENTAL_ANALYST,
        status=AgentStatus.ANALYZING,
        content=f"{ticker} OpenDART 재무 + 가격 구조 수집 중...",
    ))

    indicators = get_technical_indicators(ticker)
    stock_info = get_stock_info(ticker)
    financials = dart_api.get_latest_financials(ticker)

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

    # ── DART 재무 블록 (없으면 미사용 안내) ──────────────
    if financials.get("available"):
        raw = financials.get("raw", {}) or {}
        ratios = financials.get("ratios", {}) or {}

        def _won(v):
            return f"{v:,}원" if isinstance(v, (int, float)) and v is not None else "N/A"

        def _ratio(v):
            return f"{v:.2f}%" if isinstance(v, (int, float)) and v is not None else "N/A"

        fin_block = f"""[DART 재무제표 — {financials.get('year')}년 {financials.get('period_label')} (단위: 원)]
- 매출액: {_won(raw.get('revenue'))}
- 영업이익: {_won(raw.get('operating_income'))}
- 당기순이익: {_won(raw.get('net_income'))}
- 자산총계: {_won(raw.get('total_assets'))}
- 부채총계: {_won(raw.get('total_liabilities'))}
- 자본총계: {_won(raw.get('total_equity'))}
- 영업활동현금흐름: {_won(raw.get('cfo'))}

[DART 재무비율]
- 영업이익률: {_ratio(ratios.get('operating_margin_pct'))}
- 순이익률: {_ratio(ratios.get('net_margin_pct'))}
- ROE: {_ratio(ratios.get('roe_pct'))}
- 부채비율(부채/자본): {_ratio(ratios.get('debt_to_equity_pct'))}
- 자기자본비율: {_ratio(ratios.get('equity_ratio_pct'))}
- 유동비율: {_ratio(ratios.get('current_ratio_pct'))}"""
    else:
        fin_block = (
            "[DART 재무제표]\n"
            f"- 사용 불가 (사유: {financials.get('error') or '미상'})\n"
            "- 본 분석은 가격 구조와 섹터 정보에만 의존합니다."
        )

    await emit_thought(session_id, AgentThought(
        agent_id="fundamental_analyst",
        role=AgentRole.FUNDAMENTAL_ANALYST,
        status=AgentStatus.THINKING,
        content=(
            f"DART 재무 사용가능: {financials.get('available')} ({financials.get('period_label') or '-'})"
        ),
        metadata={
            "sector": stock_info.get("sector", ""),
            "industry": stock_info.get("industry", ""),
            "market": stock_info.get("market", ""),
            "dart_available": bool(financials.get("available")),
            "dart_period": financials.get("period_label"),
            "dart_year": financials.get("year"),
            "dart_ratios": financials.get("ratios", {}),
        },
    ))

    prompt = f"""당신은 한국 주식 펀더멘털 분석가입니다. 사실(재무제표)과 가격 컨텍스트를 결합해 판단합니다.

종목: {ticker} ({stock_info.get('name', '')})
시장: {stock_info.get('market', 'N/A')}
섹터: {stock_info.get('sector', 'N/A')}
산업: {stock_info.get('industry', 'N/A')}

{fin_block}

[가격 구조]
- 현재가: {_fmt_num(current_price, ',.0f')}원
- MA5: {_fmt_num(indicators.get('ma5'), ',.0f')}
- MA20: {_fmt_num(indicators.get('ma20'), ',.0f')}
- MA60: {_fmt_num(indicators.get('ma60'), ',.0f')}
- 52주 범위: {_fmt_num(low_52w, ',.0f')} ~ {_fmt_num(high_52w, ',.0f')}원
- 52주 범위 내 현재 위치: {range_position}
- 거래량: {int(indicators.get('volume') or 0):,}

판단 가이드:
- DART 데이터가 가용하면 영업이익률·ROE·부채비율을 핵심 근거로 삼으세요.
- 데이터 미가용 항목은 "데이터 부재"로 명시적으로 인정하고 신뢰도를 낮추세요.
- 섹터/산업 평균과의 비교는 일반 상식 수준에서만 보조로 사용하세요.

JSON만 출력:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "key_signals": ["근거1", "근거2", "근거3"], "risk_level": "LOW|MEDIUM|HIGH", "summary": "200자 이내 요약"}}"""

    try:
        out = await create_structured_response(
            system="당신은 한국 주식 펀더멘털 분석가입니다.",
            user=prompt,
            schema_model=AnalystOutput,
        )
        result = out.model_dump()
        result["agent"] = "fundamental_analyst"
        result["raw_data"] = {
            "stock_info": stock_info,
            "indicators": indicators,
            "range_position": range_position,
            "financials": financials,
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
    """감성 분석 에이전트.

    데이터 소스:
    - 네이버 검색 뉴스 RSS (회사명·티커 쿼리)
    - Google News RSS (한국어/한국 지역)
    - OpenDART 최근 30일 공시 이벤트 (정기/주요사항/지분/발행)

    공시는 단순 카운트가 아니라 **카테고리별 빈도와 직접 노출 (회의록 추적성)**.
    """
    await emit_thought(session_id, AgentThought(
        agent_id="sentiment_analyst",
        role=AgentRole.SENTIMENT_ANALYST,
        status=AgentStatus.ANALYZING,
        content=f"{company_name or ticker} 뉴스 + DART 공시 수집 중...",
    ))

    bundle = await fetch_news_and_disclosures(
        ticker=ticker,
        company_name=company_name,
        news_limit=30,
        disclosure_days=30,
    )
    news = bundle.get("news", []) or []
    disclosures = bundle.get("disclosures", []) or []

    if not news and not disclosures:
        await emit_thought(session_id, AgentThought(
            agent_id="sentiment_analyst",
            role=AgentRole.SENTIMENT_ANALYST,
            status=AgentStatus.DONE,
            content="뉴스/공시 수집 결과 없음 - 보수적 HOLD",
        ))
        return {
            "agent": "sentiment_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "summary": "수집된 뉴스/공시 없음",
            "news_count": 0,
            "disclosure_count": 0,
        }

    # 뉴스 블록 (최신 15개까지 LLM 에 노출 — 토큰 충분)
    news_lines = []
    for n in news[:15]:
        pub = (n.get("published") or "")[:19]
        src = n.get("source", "")
        title = (n.get("title") or "").strip()
        summary = (n.get("summary") or "").strip()
        line = f"- [{src}|{pub}] {title}"
        if summary and summary != title:
            line += f" — {summary[:160]}"
        news_lines.append(line)
    news_text = "\n".join(news_lines) if news_lines else "(뉴스 없음)"

    # 공시 블록 (전부 노출 — 보통 30일 30건 이내)
    disc_counts: dict[str, int] = {}
    for d in disclosures:
        cat = str(d.get("category", "기타"))
        disc_counts[cat] = disc_counts.get(cat, 0) + 1
    disc_count_str = ", ".join(f"{k}: {v}건" for k, v in sorted(disc_counts.items())) or "없음"

    disc_lines = []
    for d in disclosures[:20]:
        disc_lines.append(
            f"- [{d.get('rcept_dt','')}|{d.get('category','')}] "
            f"{d.get('report_nm','')} (제출: {d.get('flr_nm','')})"
        )
    disc_text = "\n".join(disc_lines) if disc_lines else "(최근 30일 공시 없음)"

    # ── 내부자/주요주주 시그널 분석 (강조 블록) ─────────────
    # NEUTRAL 이 아닌 항목만 폴라리티별 카운트 + 상세 노출.
    insider_counts: dict[str, int] = {}
    insider_details: list[dict] = []
    for d in disclosures:
        pol = str(d.get("insider_polarity") or "NEUTRAL")
        if pol == "NEUTRAL":
            continue
        insider_counts[pol] = insider_counts.get(pol, 0) + 1
        insider_details.append({
            "date": d.get("rcept_dt", ""),
            "polarity": pol,
            "label": dart_api.INSIDER_POLARITY_LABELS.get(pol, pol),
            "report_nm": d.get("report_nm", ""),
            "flr_nm": d.get("flr_nm", ""),
        })

    if insider_counts:
        insider_count_lines = []
        for pol, cnt in sorted(insider_counts.items(), key=lambda x: -x[1]):
            label = dart_api.INSIDER_POLARITY_LABELS.get(pol, pol)
            insider_count_lines.append(f"  · {label}: {cnt}건")
        insider_summary = "\n".join(insider_count_lines)

        insider_detail_lines = []
        for it in insider_details[:15]:
            insider_detail_lines.append(
                f"- [{it['date']}|{it['label']}] {it['report_nm']} (제출: {it['flr_nm']})"
            )
        insider_block = (
            f"[🚨 내부자/주요주주 시그널 — 최근 30일 {sum(insider_counts.values())}건 감지]\n"
            f"{insider_summary}\n"
            f"\n상세:\n"
            + "\n".join(insider_detail_lines)
        )
    else:
        insider_block = (
            "[내부자/주요주주 시그널]\n"
            "- 최근 30일간 자사주매입/처분, 5%룰, 임원거래 등 내부자 활동 없음 (중립)"
        )

    await emit_thought(session_id, AgentThought(
        agent_id="sentiment_analyst",
        role=AgentRole.SENTIMENT_ANALYST,
        status=AgentStatus.THINKING,
        content=f"뉴스 {len(news)}건 + 공시 {len(disclosures)}건 종합 감성 분석 중...",
        metadata={
            "news_count": len(news),
            "disclosure_count": len(disclosures),
            "disclosure_categories": disc_counts,
            "insider_signal_count": sum(insider_counts.values()),
            "insider_polarity_breakdown": insider_counts,
        },
    ))

    prompt = f"""당신은 한국 주식 감성·이벤트 분석가입니다.

종목: {ticker} ({company_name})
수집 시각: {bundle.get('fetched_at')}

[최근 뉴스 — 최신 {min(len(news), 15)}건 / 전체 {len(news)}건]
{news_text}

[OpenDART 공시 (최근 30일) — 카테고리 분포: {disc_count_str}]
{disc_text}

{insider_block}

판단 가이드 (중요도 순):
1. **내부자/주요주주 시그널은 일반 뉴스보다 신호 가치가 훨씬 높습니다.** 회사가
   자기주식을 직접 매입(특히 소각)하면 강한 매수 시그널입니다 — 경영진이 현재
   주가를 저평가로 보고 있다는 명확한 행동 증거이기 때문입니다.
2. 유상증자/메자닌(전환사채·신주인수권부사채·교환사채) 발행은 단기 주가
   희석 압력으로 통상 약세 신호입니다.
3. 5%룰 변동(주식등의대량보유)과 임원·주요주주 거래는 빈도 자체가 시장 관심도의
   대리 지표입니다 — 빈번할수록 변동성↑.
4. 최대주주 변동은 지배구조 이벤트로 단기 변동성을 키웁니다 (방향 미상이지만
   risk_level을 한 단계 높이세요).
5. 일반 뉴스 헤드라인은 톤(긍정/부정/중립)과 반복 언급도를 보세요.
6. 뉴스와 공시가 상반되면 **공시(원본 사실)를 우선**하세요.
7. 정기공시(분/반기/사업보고서) 단순 제출은 중립으로 처리.

JSON만 출력:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "sentiment_score": -1.0~1.0, "key_signals": ["근거1", "근거2", "근거3"], "event_flags": ["감지된 이벤트 키워드"], "summary": "200자 이내"}}"""

    try:
        out = await create_structured_response(
            system="당신은 한국 주식 감성·이벤트 분석가입니다.",
            user=prompt,
            schema_model=SentimentAnalystOutput,
        )
        result = out.model_dump()
        result["agent"] = "sentiment_analyst"
        result["news_count"] = len(news)
        result["disclosure_count"] = len(disclosures)
        result["disclosure_categories"] = disc_counts
        result["insider_polarity_breakdown"] = insider_counts
        result["insider_signal_count"] = sum(insider_counts.values())
        # 회의록·인스펙터용 원본 일부 보존 (상위 5건씩)
        result["news"] = news[:5]
        result["disclosures"] = disclosures[:8]
        result["insider_signals"] = insider_details[:10]
    except Exception as e:
        result = {
            "agent": "sentiment_analyst",
            "signal": "HOLD",
            "confidence": 0.3,
            "sentiment_score": 0.0,
            "summary": str(e)[:120],
            "news_count": len(news),
            "disclosure_count": len(disclosures),
        }

    await emit_thought(session_id, AgentThought(
        agent_id="sentiment_analyst",
        role=AgentRole.SENTIMENT_ANALYST,
        status=AgentStatus.DONE,
        content=(
            f"감성 분석 완료: {result.get('signal')} "
            f"(감성점수: {float(result.get('sentiment_score', 0) or 0):+.2f}, "
            f"뉴스 {len(news)} · 공시 {len(disclosures)})"
        ),
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
        out = await create_structured_response(
            system="당신은 거시경제 분석 전문가입니다.",
            user=prompt,
            schema_model=MacroAnalystOutput,
            fast=True,
        )
        result = out.model_dump()
        result["agent"] = "macro_analyst"
        result["market_data"] = market_summary
    except Exception as e:
        result = {
            "agent": "macro_analyst",
            "market_condition": "NEUTRAL",
            "recommendation": "CAUTION",
            "confidence": 0.3,
            "summary": str(e)[:100],
        }

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
        out = await create_structured_response(
            system="한국 주식 기술 분석가. 지표만 보고 시그널을 판단합니다.",
            user=prompt,
            schema_model=BacktestSignalOutput,
            fast=True,
        )
        return {
            "signal": out.signal,
            "confidence": out.confidence,
            "reason": out.reason,
        }
    except Exception:
        return {"signal": "HOLD", "confidence": 0.5, "reason": "오류"}

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

from datetime import datetime

from backend.core.events import AgentRole, AgentStatus, AgentThought, emit_thought
from backend.core.llm import create_structured_response
from data.market.fetcher import get_technical_indicators, get_stock_info, get_market_index, get_news_async, get_investor_flows, get_kr_rates_summary
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

    # 데이터 충분성 라벨 (1Y 이상이면 풀-스코프, 아니면 부분 모드)
    bars = indicators.get("bars_used") or 0
    has_year = bool(indicators.get("has_full_year_history"))
    coverage_note = (
        f"분석 윈도우: 약 {bars}거래일 ({'1년치 풀 데이터' if has_year else '1년 미만 — 12개월 모멘텀·52주 high/low 일부 미산출 가능'})"
    )

    prompt = f"""당신은 한국 주식 전문 기술적 분석가입니다.

[분석 기준 시각]
- 분석 기준일(as_of): {indicators.get('as_of')}
- 마지막 거래봉 날짜: {indicators.get('last_bar_date')}
- {coverage_note}
- 윈도우 설계: 252거래일(1Y) 표준 — Jegadeesh & Titman (1993) 모멘텀 연구 가이드라인.

[종목]
- {ticker} ({stock_info.get('name', '')})
- 현재가({indicators.get('last_bar_date')} 종가): {_fmt_num(indicators.get('current_price'), ',.0f')}원 (전일 대비 {_fmt_num(indicators.get('change_pct'), '+.2f', default='0.00')}%)

[기술 지표 — 시점·윈도우 명시]
- RSI(14거래일): {_fmt_num(indicators.get('rsi_14'), '.1f')}
- MACD(12-26-9 EMA): {_fmt_num(indicators.get('macd'), '.2f')} / Signal {_fmt_num(indicators.get('macd_signal'), '.2f')} / Hist {_fmt_num(indicators.get('macd_hist'), '.2f')}
- 볼린저 밴드(20거래일, ±2σ): 상단 {_fmt_num(indicators.get('bb_upper'), ',.0f')} / 중심 {_fmt_num(indicators.get('bb_middle'), ',.0f')} / 하단 {_fmt_num(indicators.get('bb_lower'), ',.0f')}
- 이동평균: MA5 {_fmt_num(indicators.get('ma5'), ',.0f')} / MA20 {_fmt_num(indicators.get('ma20'), ',.0f')} / MA60 {_fmt_num(indicators.get('ma60'), ',.0f')} / MA120 {_fmt_num(indicators.get('ma120'), ',.0f')} / MA200 {_fmt_num(indicators.get('ma200'), ',.0f')}
- 52주(252거래일) 최고/최저: {_fmt_num(indicators.get('high_52w'), ',.0f')} / {_fmt_num(indicators.get('low_52w'), ',.0f')}

[다중 호라이즌 모멘텀 — 현재가 대비 N개월 전 종가 수익률]
- 1개월(≈21거래일): {_fmt_num(indicators.get('mom_1m_pct'), '+.2f')}%
- 3개월(≈63거래일): {_fmt_num(indicators.get('mom_3m_pct'), '+.2f')}%
- 6개월(≈126거래일): {_fmt_num(indicators.get('mom_6m_pct'), '+.2f')}%
- 12개월(≈252거래일): {_fmt_num(indicators.get('mom_12m_pct'), '+.2f')}%

[변동성 — 손절 산정 근거]
- ATR(14): {_fmt_num(indicators.get('atr_14'), ',.0f')}원 ({_fmt_num(indicators.get('atr_pct'), '.2f')}% of price)
- 일간수익률 σ(20거래일): {_fmt_num(indicators.get('sigma_20d_pct'), '.2f')}%
- 직전 스윙로우(20거래일 최저): {_fmt_num(indicators.get('swing_low_20d'), ',.0f')}원 (현재가 대비 {_fmt_num(indicators.get('swing_low_drop_pct'), '.2f')}% 하락)

해석 가이드:
- 12개월 모멘텀이 +20% 이상이고 6/3/1개월도 모두 양(+) → "윈너 모멘텀" (Jegadeesh-Titman). 추세 추종.
- 12개월 -20% 이하 + 단기 모두 음(-) → 추세적 약세. 반등 기대 금물.
- 1개월·3개월 부호가 갈리면(예: 1M+/3M-) **단기 반등 vs 중기 하락 추세** 중 무엇이 우세인지 명시.
- MA200 위 + MA50(MA60 근사) > MA200 → 골든크로스 영역. 아래는 데드크로스.
- RSI 70+ 과매수 / 30- 과매도 (단, 강한 추세장에선 추세 반대 신호로 오해 금지).
- 52주 high/low가 None 이면 "1년 미만 데이터" 명시 후 confidence 낮춤.

위 지표를 분석하여 다음 JSON 형식으로만 답하세요:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "key_signals": ["근거1", "근거2", "근거3", "근거4", "근거5"], "risk_level": "LOW|MEDIUM|HIGH", "summary": "차트·지표 해석을 충분히 서술 — 600자 권장 (필요시 더 길게 허용)"}}"""

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
    # 추가: 직전 6개 보고서 시계열 (YoY/QoQ 추세 분석용)
    fin_history = dart_api.get_financials_history(ticker, n_periods=6)

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

        latest_fin_block = f"""[DART 최신 재무제표 — {financials.get('year')}년 {financials.get('period_label')} 보고서 (단위: 원)]
- 매출액: {_won(raw.get('revenue'))}
- 영업이익: {_won(raw.get('operating_income'))}
- 당기순이익: {_won(raw.get('net_income'))}
- 자산총계: {_won(raw.get('total_assets'))}
- 부채총계: {_won(raw.get('total_liabilities'))}
- 자본총계: {_won(raw.get('total_equity'))}
- 영업활동현금흐름: {_won(raw.get('cfo'))}

[DART 최신 재무비율]
- 영업이익률: {_ratio(ratios.get('operating_margin_pct'))}
- 순이익률: {_ratio(ratios.get('net_margin_pct'))}
- ROE(연환산): {_ratio(ratios.get('roe_pct'))}
- 부채비율(부채/자본): {_ratio(ratios.get('debt_to_equity_pct'))}
- 자기자본비율: {_ratio(ratios.get('equity_ratio_pct'))}
- 유동비율: {_ratio(ratios.get('current_ratio_pct'))}"""

        # 직전 6개 보고서 추세 — Piotroski (2000) F-Score 류 분석은 최소 4분기 시계열 요구.
        if fin_history and len(fin_history) >= 2:
            history_lines = ["[DART 재무 추세 — 최근 6개 보고서 (최신→과거)]"]
            history_lines.append(
                "기간             | 매출액(억원) | 영업익(억원) | 순익(억원) | 영업익률 | 순익률 | ROE(연환산) | 부채비율"
            )
            for f in fin_history:
                p = f"{f['year']}년 {f['period_label']}".ljust(14)
                r_ = f.get("raw", {}) or {}
                ra_ = f.get("ratios", {}) or {}
                def _eok(v):
                    return f"{v/1e8:>10,.0f}" if isinstance(v, (int, float)) and v is not None else "       N/A"
                def _pp(v):
                    return f"{v:>6.2f}%" if isinstance(v, (int, float)) and v is not None else "    N/A"
                history_lines.append(
                    f"{p} | {_eok(r_.get('revenue'))} | {_eok(r_.get('operating_income'))} | "
                    f"{_eok(r_.get('net_income'))} | {_pp(ra_.get('operating_margin_pct'))} | "
                    f"{_pp(ra_.get('net_margin_pct'))} | {_pp(ra_.get('roe_pct'))} | {_pp(ra_.get('debt_to_equity_pct'))}"
                )
            history_block = "\n".join(history_lines)
        else:
            history_block = "[DART 재무 추세] 시계열 데이터 부족 (직전 1개 보고서만 가용)"

        fin_block = latest_fin_block + "\n\n" + history_block
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

[분석 기준 시각]
- 분석 기준일: {datetime.now().strftime('%Y-%m-%d %H:%M KST')}
- 가격 데이터 기준봉: {indicators.get('last_bar_date')}
- 재무 데이터 윈도우: 직전 6개 보고서 (≈1.5년) — Piotroski (2000) F-Score 류 분석 가이드라인 (최소 4분기).

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
- **추세 분석 우선**: "재무 추세" 표에서 매출/영업익/순익의 YoY(전년 동기 대비) 또는 QoQ(직전 분기 대비) 방향을 명시하세요.
  · 예: "2024 3Q 영업익 1,200억원 → 2025 3Q 1,500억원, +25% YoY → 모멘텀 가속".
  · 마진(영업익률·순익률)이 분기마다 개선되는지 악화되는지를 한 줄로 요약.
- 데이터 미가용 항목은 "데이터 부재"로 명시적으로 인정하고 신뢰도를 낮추세요.
- 섹터/산업 평균과의 비교는 일반 상식 수준에서만 보조로 사용하세요.

JSON만 출력:
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "key_signals": ["근거1", "근거2", "근거3", "근거4", "근거5"], "risk_level": "LOW|MEDIUM|HIGH", "summary": "결론과 근거를 충분히 서술 — 600자 권장 (필요시 더 길게 허용)"}}"""

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
            "financials_history": fin_history,
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

    # 뉴스 블록 (수집된 모든 뉴스를 LLM 에 노출 — reasoning 모델은 충분한 컨텍스트 창 공간 확보Ƚ).
    news_lines = []
    for n in news:
        pub = (n.get("published") or "")[:19]
        src = n.get("source", "")
        title = (n.get("title") or "").strip()
        summary = (n.get("summary") or "").strip()
        line = f"- [{src}|{pub}] {title}"
        if summary and summary != title:
            line += f" — {summary}"
        news_lines.append(line)
    news_text = "\n".join(news_lines) if news_lines else "(뉴스 없음)"

    # 공시 블록 (전부 노출 — 보통 30일 30건 이내)
    disc_counts: dict[str, int] = {}
    for d in disclosures:
        cat = str(d.get("category", "기타"))
        disc_counts[cat] = disc_counts.get(cat, 0) + 1
    disc_count_str = ", ".join(f"{k}: {v}건" for k, v in sorted(disc_counts.items())) or "없음"

    disc_lines = []
    for d in disclosures:
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
        for it in insider_details:
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

[분석 기준 시각]
- 분석 기준일: {datetime.now().strftime('%Y-%m-%d %H:%M KST')}
- 데이터 수집 시각: {bundle.get('fetched_at')}
- 뉴스 윈도우: 최근 30일 (Tetlock 2007 / Loughran-McDonald 2011 — 뉴스 톤은 7-30일 수준에서 가격에 가장 강하게 반영).
- 공시 윈도우: 최근 30일 (한국 시장 공시 의무 신고 기한 ≈ 1-3 영업일, 30일이면 거의 모든 직전 이벤트 포함).

종목: {ticker} ({company_name})

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
{{"signal": "BUY|SELL|HOLD", "confidence": 0.0~1.0, "sentiment_score": -1.0~1.0, "key_signals": ["근거1", "근거2", "근거3", "근거4", "근거5"], "event_flags": ["감지된 이벤트 키워드"], "summary": "뉴스/공시/내부자 시그널을 종합한 충분한 서술 — 600자 권장"}}"""

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
    """매크로 분석 에이전트: 한국·미국 지수, 환율, 금리, 변동성, 외국인·기관 수급."""
    await emit_thought(session_id, AgentThought(
        agent_id="macro_analyst",
        role=AgentRole.MACRO_ANALYST,
        status=AgentStatus.ANALYZING,
        content="한국·미국 지수 / 환율 / 금리 / VKOSPI / 외국인·기관 수급 수집 중...",
    ))

    indices = get_market_index(days=30)
    flows = get_investor_flows(days=20)
    kr_macro = get_kr_rates_summary()  # BOK ECOS — 한국 시장금리 + 100대 핵심지표

    # 시리즈별로 1일·5일·20일 모멘텀을 계산해 LLM 컨텍스트에 채워 넣는다.
    # 30일치 받아놓고 1일 변동만 쓰던 기존 동작을 교체.
    def _series_block(name: str, df) -> str | None:
        try:
            if df is None or df.empty or "Close" not in df.columns:
                return None
            close = df["Close"].astype(float).dropna()
            if close.empty:
                return None
            latest = float(close.iloc[-1])
            def _pct(n: int) -> str:
                if len(close) <= n:
                    return "N/A"
                ref = float(close.iloc[-1 - n])
                if ref == 0:
                    return "N/A"
                return f"{(latest - ref) / ref * 100:+.2f}%"
            return f"{name}: {latest:,.2f} | 1D {_pct(1)} · 5D {_pct(5)} · 20D {_pct(20)}"
        except Exception:
            return None

    series_lines = [s for s in (
        _series_block(name, df) for name, df in (indices or {}).items()
    ) if s]
    market_block = "\n".join(f"- {line}" for line in series_lines) if series_lines else "- 지수 데이터 미수집"

    # 외국인·기관 수급 — BOK ECOS 우선(억원 단위), pykrx 폴백(원 단위).
    flow_source = (flows or {}).get("source", "none")
    flow_lines: list[str] = []

    def _eok_str(v):
        if v is None:
            return "N/A"
        # 억원 → 조원 환산 (1조 = 10000억)
        if abs(v) >= 10000:
            return f"{v/10000:+.2f}조원 ({v:+,.0f}억원)"
        return f"{v:+,.0f}억원"

    if flow_source == "BOK":
        for mkt_label in ("KOSPI", "KOSDAQ"):
            payload = flows.get(mkt_label) or {}
            last = payload.get("foreign_last_eokwon")
            d5 = payload.get("foreign_5d_eokwon")
            d20 = payload.get("foreign_20d_eokwon")
            if last is None and d5 is None and d20 is None:
                continue
            flow_lines.append(
                f"- {mkt_label} 외국인 순매수 (BOK ECOS) — 직전일 {_eok_str(last)} | 5D {_eok_str(d5)} | 20D {_eok_str(d20)}"
            )
        # 월별 KOSPI 분해 (기관/개인/외국인)
        mb = (flows or {}).get("monthly_breakdown") or {}
        if mb.get("months"):
            months = mb["months"]
            inst = mb.get("institution_eokwon", [])
            indiv = mb.get("individual_eokwon", [])
            forn = mb.get("foreigner_eokwon", [])
            flow_lines.append("- KOSPI 월별 투자자별 순매수 (단위: 억원)")
            for i, ym in enumerate(months[-6:]):
                idx = len(months) - len(months[-6:]) + i
                f_ = forn[idx] if idx < len(forn) else None
                k_ = inst[idx] if idx < len(inst) else None
                p_ = indiv[idx] if idx < len(indiv) else None
                flow_lines.append(
                    f"    · {ym}: 외국인 {_eok_str(f_)} / 기관 {_eok_str(k_)} / 개인 {_eok_str(p_)}"
                )
    elif flow_source == "pykrx":
        for mkt_label in ("KOSPI", "KOSDAQ"):
            payload = flows.get(mkt_label) or {}
            f_total = payload.get("foreign_total_won")
            i_total = payload.get("institution_total_won")
            if f_total is None and i_total is None:
                continue
            def _trillion(v):
                if v is None:
                    return "N/A"
                return f"{v / 1e12:+.2f}조원"
            flow_lines.append(
                f"- {mkt_label} 누적 순매수 (pykrx) — 외국인 {_trillion(f_total)} · 기관 {_trillion(i_total)}"
            )
    flow_block = "\n".join(flow_lines) if flow_lines else "- 수급 데이터 미수집"

    # 한국 시장금리 + BOK 100대 핵심지표 블록
    rates_lines: list[str] = []
    if kr_macro.get("enabled"):
        r = kr_macro.get("rates", {}) or {}
        if r:
            parts = []
            if r.get("kr3yt_last") is not None:
                parts.append(f"국고채 3Y {r['kr3yt_last']:.3f}%")
            if r.get("kr10yt_last") is not None:
                parts.append(f"10Y {r['kr10yt_last']:.3f}%")
            if r.get("kr_yield_curve_10y_minus_3y_bp") is not None:
                parts.append(f"10Y-3Y {r['kr_yield_curve_10y_minus_3y_bp']:+.1f}bp")
            if r.get("credit_spread_bp") is not None:
                parts.append(f"회사채 스프레드 {r['credit_spread_bp']:+.1f}bp")
            if r.get("kr3yt_20d_change_bp") is not None:
                parts.append(f"3Y 20D 변화 {r['kr3yt_20d_change_bp']:+.1f}bp")
            rates_lines.append("- 한국 시장금리: " + " · ".join(parts))

        # 100대 지표 — 분석에 의미 있는 항목만 정리
        ki = kr_macro.get("key_indicators", []) or []
        if ki:
            grouped: dict[str, list[str]] = {}
            for it in ki:
                cls = it.get("class", "기타")
                v = it.get("value")
                u = it.get("unit", "")
                ts = it.get("as_of", "")
                if v is None:
                    continue
                # 큰 숫자는 단위 정리
                if "십억원" in u:
                    val_str = f"{v/1000:,.1f}조원"
                elif "조원" in u:
                    val_str = f"{v:,.1f}조원"
                elif u == "%":
                    val_str = f"{v:.3f}%"
                else:
                    val_str = f"{v:,} {u}"
                grouped.setdefault(cls, []).append(f"{it.get('name','')} {val_str} ({ts})")
            for cls, items in grouped.items():
                rates_lines.append(f"- [{cls}] " + " | ".join(items[:8]))
    rates_block = "\n".join(rates_lines) if rates_lines else "- BOK ECOS 데이터 미수집(BOK_API_KEY 미설정 가능)"

    market_summary_short = " | ".join(
        line.split(" | ")[0] for line in series_lines[:3]
    ) if series_lines else "데이터 없음"

    await emit_thought(session_id, AgentThought(
        agent_id="macro_analyst",
        role=AgentRole.MACRO_ANALYST,
        status=AgentStatus.THINKING,
        content=f"시장 환경 분석: {market_summary_short}",
        metadata={
            "series_count": len(series_lines),
            "flows_available": bool(flow_lines),
            "flow_source": flow_source,
            "bok_enabled": bool(kr_macro.get("enabled")),
        },
    ))

    prompt = f"""당신은 한국 주식 거시 환경 분석가입니다. 아래 데이터를 종합해 한국 주식 투자 적합성을 판단하세요.

[분석 기준 시각]
- 분석 기준일: {datetime.now().strftime('%Y-%m-%d %H:%M KST')}
- 데이터 윈도우 가이드라인:
  · 글로벌 지수: 1D/5D/20D 모멘텀 (단기 추세, Whaley 2009 VIX 분석 표준).
  · 외국인 수급: 일별 5D/20D + 월별 6개월 (Choe-Kho-Stulz 1999 — 외국인 흐름은 5-60일 영역에서 지속성 강함).
  · 금리/스프레드: 일별 60거래일 + 100대 지표 최신값 (Estrella-Mishkin 1996 — 수익률곡선은 12개월 선행지표).
- 데이터는 시점 정보를 반드시 인용. 어제 vs 1주 전 vs 1개월 전 흐름을 구분해 서술할 것.

[글로벌 지수·환율·변동성 — 1일/5일/20일 모멘텀 (Yahoo/FDR)]
{market_block}

[한국 매크로 — 한국은행 ECOS 공식 통계]
{rates_block}

[외국인·기관 수급]
{flow_block}

판단 가이드:
- 미국 시장(SPX/NASDAQ) 모멘텀이 음(-)이면 한국도 위험회피 압력. 양(+)이면 위험선호.
- USD_KRW 5D/20D 상승(원화 약세) → 외국인 매도 유인. 하락 → 매수 유인.
- 한국 국고채 3Y 20D 변화가 +20bp 이상 급등 → 멀티플 압축, 성장주 약세.
- 회사채-국고채 스프레드 80bp 이상 확대 → 신용 위험 신호, risk_level 상향.
- 10Y-3Y 스프레드가 마이너스(역수익률곡선) → 경기 둔화 시그널.
- VIX 20 이상 → 글로벌 변동성 국면. recommendation은 CAUTION 이상으로 보수화.
- 외국인 5D 순매도 -1조원 이하 → 추세적 매도 압력으로 BEAR 방향에 가중.
- 외국인이 최근 3개월 연속 순매도 → 구조적 이탈, 매우 보수적으로.
- 데이터 결측 항목은 "데이터 부재"로 명시하고 confidence를 낮춘다.

JSON으로만 답하세요:
{{"market_condition": "BULL|BEAR|NEUTRAL", "confidence": 0.0~1.0, "risk_level": "LOW|MEDIUM|HIGH", "recommendation": "INVEST|CAUTION|AVOID", "key_factors": ["요인1(데이터 인용)", "요인2", "요인3", "요인4", "요인5"], "summary": "미국/환율/금리/수급/변동성을 종합한 충분한 서술 — 600자 권장, 결정타 명시"}}"""

    try:
        # macro 는 멀티시그널 종합 추론이 핵심 — reasoning 켜야 의미 있다.
        out = await create_structured_response(
            system="당신은 거시경제 분석 전문가입니다.",
            user=prompt,
            schema_model=MacroAnalystOutput,
        )
        result = out.model_dump()
        result["agent"] = "macro_analyst"
        result["market_data"] = market_summary_short
        result["raw_data"] = {
            "series_lines": series_lines,
            "flow_lines": flow_lines,
            "rates_lines": rates_lines,
            "flow_source": flow_source,
            "bok_summary": kr_macro.get("rates", {}) if kr_macro.get("enabled") else {},
            "monthly_breakdown": (flows or {}).get("monthly_breakdown") or {},
        }
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

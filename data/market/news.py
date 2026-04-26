"""
한국 주식 뉴스 + 공시 이벤트 통합 수집기.

설계 원칙
----------
- 공식/허용 채널만 사용: 네이버 금융 RSS, Google News RSS, OpenDART 공시.
- 종목토론방 등 비공식 스크래핑은 제외 (사용자 정책).
- 모든 외부 호출은 timeout/UA 헤더 + 실패 시 빈 결과로 격리 (garbage in 차단).
- 중복 제거: title 정규화(공백/구두점 제거 후 lower) 기준 dedupe.
- Look-ahead 안전: 결과는 published 내림차순 정렬, 호출자에게 시각도 함께 노출.
"""
from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime
from typing import Any
from urllib.parse import quote_plus

import feedparser
import httpx

from data.market import dart as dart_api
from data.market.fetcher import get_stock_info

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA, "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.5"}
_TIMEOUT = httpx.Timeout(10.0, connect=4.0)


def _normalize_title(s: str) -> str:
    s = re.sub(r"\s+", " ", s or "").strip().lower()
    s = re.sub(r"[\[\]\(\)·,.\-_/!?:'\"]", "", s)
    return s


def _parse_published(entry: Any) -> str:
    """피드 entry → ISO8601 문자열 (없으면 빈 문자열)."""
    for k in ("published_parsed", "updated_parsed"):
        t = getattr(entry, k, None) or (entry.get(k) if isinstance(entry, dict) else None)
        if t:
            try:
                return datetime.fromtimestamp(time.mktime(t)).isoformat()
            except Exception:
                pass
    raw = (entry.get("published") if isinstance(entry, dict) else getattr(entry, "published", "")) or ""
    return str(raw)


async def _fetch_text(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text
    except Exception:
        return ""


async def _fetch_feed(url: str) -> list[dict]:
    text = await _fetch_text(url)
    if not text:
        return []
    try:
        feed = feedparser.parse(text)
    except Exception:
        return []
    items: list[dict] = []
    for entry in (feed.entries or [])[:30]:
        try:
            title = re.sub(r"<[^>]+>", "", entry.get("title", "") or "").strip()
            summary = re.sub(r"<[^>]+>", "", entry.get("summary", "") or "").strip()
            link = entry.get("link", "") or ""
            published = _parse_published(entry)
            if not title:
                continue
            items.append({
                "title": title,
                "summary": summary[:500],
                "link": link,
                "published": published,
            })
        except Exception:
            continue
    return items


async def _google_news_kr(query: str) -> list[dict]:
    """Google News RSS (한국어, 한국 지역). 무료/공식 RSS."""
    if not query:
        return []
    q = quote_plus(query)
    url = f"https://news.google.com/rss/search?q={q}&hl=ko&gl=KR&ceid=KR:ko"
    items = await _fetch_feed(url)
    for it in items:
        it["source"] = "Google News"
    return items


async def _hankyung_finance_rss() -> list[dict]:
    """한국경제 증권 RSS (시장 전반 — 종목 필터링은 호출자가 수행)."""
    items = await _fetch_feed("https://www.hankyung.com/feed/finance")
    for it in items:
        it["source"] = "Hankyung"
    return items


async def _edaily_stock_rss() -> list[dict]:
    """이데일리 주식/펀드 RSS — 한국 증권 시장 특화 (50개 헤드라인)."""
    # HTTPS 인증서가 종종 끊기므로 HTTP 엔드포인트 사용 (이데일리 공식 배포 URL).
    items = await _fetch_feed("http://rss.edaily.co.kr/stock_news.xml")
    for it in items:
        it["source"] = "이데일리"
    return items


async def _mk_securities_rss() -> list[dict]:
    """매일경제 증권 RSS (50200011 = 증권 카테고리)."""
    items = await _fetch_feed("https://www.mk.co.kr/rss/50200011/")
    for it in items:
        it["source"] = "매일경제"
    return items


async def _fn_stock_rss() -> list[dict]:
    """파이낸셜뉴스 실시간 증권 RSS."""
    items = await _fetch_feed("https://www.fnnews.com/rss/r20/fn_realnews_stock.xml")
    for it in items:
        it["source"] = "파이낸셜뉴스"
    return items


def _filter_by_query(items: list[dict], queries: list[str]) -> list[dict]:
    """제목/요약에 쿼리(회사명·티커) 중 하나라도 포함된 항목만 반환."""
    qs = [q.lower() for q in queries if q]
    if not qs:
        return items
    out = []
    for it in items:
        text = (it.get("title", "") + " " + it.get("summary", "")).lower()
        if any(q in text for q in qs):
            out.append(it)
    return out


def _dedupe_news(items: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for it in items:
        key = _normalize_title(it.get("title", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def _sort_news_desc(items: list[dict]) -> list[dict]:
    def k(it):
        p = it.get("published", "")
        return p if isinstance(p, str) else ""
    return sorted(items, key=k, reverse=True)


async def fetch_news(ticker: str, company_name: str = "", limit: int = 25) -> list[dict]:
    """종목 관련 뉴스 통합 수집 (Google News kr 다중 쿼리 + 한국경제 증권 RSS 필터링).

    쿼리 전략:
    - 회사명 단독 (가장 광범위)
    - 회사명 + "주가" (가격 관련)
    - 회사명 + "실적" (펀더멘털 관련)
    - 티커 6자리 (보조)

    Returns:
        [{title, summary, link, published, source}, ...]  최신순, 중복 제거.
    """
    queries: list[str] = []
    if company_name:
        queries.append(company_name)
        queries.append(f"{company_name} 주가")
        queries.append(f"{company_name} 실적")
    if ticker:
        queries.append(ticker)

    tasks: list = [_google_news_kr(q) for q in queries[:4]]
    # 한국 증권 매체 4종 (필터링 대상 - 시장 전체 피드)
    tasks.append(_hankyung_finance_rss())
    tasks.append(_edaily_stock_rss())
    tasks.append(_mk_securities_rss())
    tasks.append(_fn_stock_rss())

    results = await asyncio.gather(*tasks, return_exceptions=True)
    google_items: list[dict] = []
    market_feed_items: list[dict] = []
    n_google = len(queries[:4])
    for idx, r in enumerate(results):
        if not isinstance(r, list):
            continue
        if idx < n_google:
            google_items.extend(r)
        else:
            market_feed_items.extend(r)

    # 시장 전체 피드는 회사명/티커 매칭 항목만 필터링
    filter_terms = [t for t in (company_name, ticker) if t]
    market_filtered = _filter_by_query(market_feed_items, filter_terms)

    merged = google_items + market_filtered
    merged = _dedupe_news(merged)
    merged = _sort_news_desc(merged)
    return merged[:limit]


async def fetch_disclosures(ticker: str, days: int = 30, limit: int = 30) -> list[dict]:
    """OpenDART 최근 공시 이벤트 (동기 래퍼 → 스레드)."""
    return await asyncio.to_thread(dart_api.get_recent_disclosures, ticker, days, limit)


async def fetch_news_and_disclosures(
    ticker: str, company_name: str = "", news_limit: int = 25, disclosure_days: int = 30,
) -> dict[str, Any]:
    """뉴스 + 공시 한 번에 (병렬).

    Returns:
        {
          "news": [...],
          "disclosures": [...],
          "ticker": str,
          "company_name": str,
          "fetched_at": str (ISO),
          "counts": {"news": int, "disclosures": int},
        }
    """
    if not company_name:
        try:
            info = get_stock_info(ticker)
            company_name = str(info.get("name", "") or "")
        except Exception:
            company_name = ""

    news_task = asyncio.create_task(fetch_news(ticker, company_name, news_limit))
    disc_task = asyncio.create_task(fetch_disclosures(ticker, disclosure_days, 30))
    news, disclosures = await asyncio.gather(news_task, disc_task, return_exceptions=True)

    if isinstance(news, Exception):
        news = []
    if isinstance(disclosures, Exception):
        disclosures = []

    return {
        "ticker": ticker,
        "company_name": company_name,
        "news": news,
        "disclosures": disclosures,
        "fetched_at": datetime.now().isoformat(),
        "counts": {"news": len(news), "disclosures": len(disclosures)},
    }


__all__ = [
    "fetch_news",
    "fetch_disclosures",
    "fetch_news_and_disclosures",
]

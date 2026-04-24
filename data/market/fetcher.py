"""
한국 주식 시장 데이터 수집 모듈
- FinanceDataReader: KOSPI/KOSDAQ 히스토리컬 데이터
- pykrx: KRX 공식 데이터
- 뉴스 RSS: 네이버/한국경제 주요 뉴스
"""
import asyncio
from datetime import datetime, timedelta
from functools import lru_cache

import math
import pandas as pd
import FinanceDataReader as fdr


def _safe_float(val) -> float | None:
    """NaN/Inf 를 None 으로 변환"""
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


@lru_cache(maxsize=128)
def get_ohlcv(ticker: str, start: str, end: str) -> pd.DataFrame:
    """KOSPI/KOSDAQ 종목 OHLCV 데이터 (캐시됨)"""
    df = fdr.DataReader(ticker, start, end)
    df.index = pd.to_datetime(df.index)
    return df


def get_market_index(days: int = 90) -> dict:
    """KOSPI, KOSDAQ 주요 지수 최근 데이터"""
    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    indices = {}
    try:
        indices["KOSPI"] = fdr.DataReader("KS11", start, end)
    except Exception:
        pass
    try:
        indices["KOSDAQ"] = fdr.DataReader("KQ11", start, end)
    except Exception:
        pass
    try:
        indices["USD_KRW"] = fdr.DataReader("USD/KRW", start, end)
    except Exception:
        pass
    return indices


@lru_cache(maxsize=1)
def _get_krx_listing() -> pd.DataFrame:
    """KRX 전체 종목 목록 (최초 1회 캐시) — fdr 기반, pykrx 폴백"""
    empty = pd.DataFrame(columns=["Code", "Name", "Market"])
    # fdr first — gives both Code and Name
    frames = []
    for market_key in ("KOSPI", "KOSDAQ"):
        try:
            df = fdr.StockListing(market_key)
            if df is not None and not df.empty:
                df = df.copy()
                df["Market"] = market_key
                col_map = {}
                for c in df.columns:
                    lc = c.lower()
                    if lc in ("code", "symbol", "종목코드"):
                        col_map[c] = "Code"
                    elif lc in ("name", "종목명"):
                        col_map[c] = "Name"
                if col_map:
                    df = df.rename(columns=col_map)
                frames.append(df)
        except BaseException:
            pass
    if frames:
        try:
            result = pd.concat(frames, ignore_index=True)
            if not result.empty and "Code" in result.columns:
                return result
        except BaseException:
            pass
    # pykrx fallback — codes only, no names
    try:
        from pykrx import stock as pykrx_stock
        today = datetime.now().strftime("%Y%m%d")
        rows = []
        for market_key in ("KOSPI", "KOSDAQ"):
            try:
                tickers = pykrx_stock.get_market_ticker_list(today, market=market_key)
                for t in tickers:
                    try:
                        name = pykrx_stock.get_market_ticker_name(t)
                    except BaseException:
                        name = ""
                    rows.append({"Code": t, "Name": name, "Market": market_key})
            except BaseException:
                pass
        if rows:
            return pd.DataFrame(rows)
    except BaseException:
        pass
    return empty


def search_stocks(query: str, limit: int = 10) -> list[dict]:
    """종목명 또는 코드로 종목 검색"""
    if not query or not query.strip():
        return []
    try:
        listing = _get_krx_listing()
        if listing.empty:
            return []
        mask = (
            listing["Code"].str.contains(query, case=False, na=False)
        )
        if "Name" in listing.columns:
            mask = mask | listing["Name"].str.contains(query, case=False, na=False)
        matches = listing[mask].head(limit)
        result = []
        for _, row in matches.iterrows():
            result.append({
                "code": str(row.get("Code", "")),
                "name": str(row.get("Name", "")),
                "market": str(row.get("Market", "")),
            })
        return result
    except BaseException:
        return []


def get_stock_info(ticker: str) -> dict:
    """KRX 종목 기본 정보"""
    try:
        listing = _get_krx_listing()
        row = listing[listing["Code"] == ticker]
        if row.empty:
            return {"ticker": ticker, "name": "Unknown"}
        r = row.iloc[0]
        return {
            "ticker": ticker,
            "name": r.get("Name", ""),
            "market": r.get("Market", ""),
            "sector": r.get("Sector", ""),
            "industry": r.get("Industry", ""),
        }
    except Exception as e:
        return {"ticker": ticker, "error": str(e)}


def get_technical_indicators(ticker: str, days: int = 120, as_of_date: str | None = None) -> dict:
    """기술 지표 계산 (MACD, RSI, 볼린저 밴드)
    
    as_of_date: "YYYY-MM-DD" 형식. 지정 시 해당 날짜까지의 데이터만 사용 (백테스트용, look-ahead 방지).
    """
    if as_of_date:
        end_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
    else:
        end_dt = datetime.now()
    end = end_dt.strftime("%Y-%m-%d")
    start = (end_dt - timedelta(days=days)).strftime("%Y-%m-%d")
    
    df = get_ohlcv(ticker, start, end)
    if df.empty or "Close" not in df.columns:
        return {"error": "데이터 없음"}

    close = df["Close"]
    
    # RSI
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, float("nan"))
    rsi = 100 - (100 / (1 + rs))
    
    # MACD
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal
    
    # 볼린저 밴드
    ma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    bb_upper = ma20 + 2 * std20
    bb_lower = ma20 - 2 * std20
    
    latest = df.iloc[-1]
    return {
        "ticker": ticker,
        "current_price": _safe_float(latest["Close"]),
        "change_pct": _safe_float((latest["Close"] - df.iloc[-2]["Close"]) / df.iloc[-2]["Close"] * 100) if len(df) > 1 else 0.0,
        "volume": int(latest.get("Volume", 0) or 0),
        "rsi_14": _safe_float(rsi.iloc[-1]) if not rsi.empty else None,
        "macd": _safe_float(macd.iloc[-1]) if not macd.empty else None,
        "macd_signal": _safe_float(signal.iloc[-1]) if not signal.empty else None,
        "macd_hist": _safe_float(hist.iloc[-1]) if not hist.empty else None,
        "bb_upper": _safe_float(bb_upper.iloc[-1]) if not bb_upper.empty else None,
        "bb_middle": _safe_float(ma20.iloc[-1]) if not ma20.empty else None,
        "bb_lower": _safe_float(bb_lower.iloc[-1]) if not bb_lower.empty else None,
        "ma5": _safe_float(close.rolling(5).mean().iloc[-1]),
        "ma20": _safe_float(close.rolling(20).mean().iloc[-1]),
        "ma60": _safe_float(close.rolling(60).mean().iloc[-1]) if len(close) >= 60 else None,
        "high_52w": _safe_float(close.rolling(min(252, len(close))).max().iloc[-1]),
        "low_52w": _safe_float(close.rolling(min(252, len(close))).min().iloc[-1]),
        "last_updated": datetime.now().isoformat(),
    }


async def get_news_async(ticker: str, company_name: str = "") -> list[dict]:
    """네이버 금융 뉴스 RSS (비동기)"""
    import feedparser
    
    queries = [ticker]
    if company_name:
        queries.append(company_name)
    
    news_items = []
    for query in queries[:1]:  # 쿼리 수 제한
        try:
            url = f"https://finance.yahoo.com/rss/headline?s={ticker}.KS"
            feed = feedparser.parse(url)
            for entry in feed.entries[:5]:
                news_items.append({
                    "title": entry.get("title", ""),
                    "summary": entry.get("summary", ""),
                    "published": entry.get("published", ""),
                    "link": entry.get("link", ""),
                })
        except Exception:
            pass
    
    return news_items

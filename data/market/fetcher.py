"""
한국 주식 시장 데이터 수집 모듈
- FinanceDataReader: KOSPI/KOSDAQ 히스토리컬 데이터
- pykrx: KRX 공식 데이터
- 뉴스 RSS: 네이버/한국경제 주요 뉴스
"""
import asyncio
from datetime import datetime, timedelta
from functools import lru_cache

import pandas as pd
import FinanceDataReader as fdr


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


def get_stock_info(ticker: str) -> dict:
    """KRX 종목 기본 정보"""
    try:
        listing = fdr.StockListing("KRX")
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


def get_technical_indicators(ticker: str, days: int = 120) -> dict:
    """기술 지표 계산 (MACD, RSI, 볼린저 밴드)"""
    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
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
        "current_price": float(latest["Close"]),
        "change_pct": float((latest["Close"] - df.iloc[-2]["Close"]) / df.iloc[-2]["Close"] * 100) if len(df) > 1 else 0,
        "volume": int(latest.get("Volume", 0)),
        "rsi_14": float(rsi.iloc[-1]) if not rsi.empty else None,
        "macd": float(macd.iloc[-1]) if not macd.empty else None,
        "macd_signal": float(signal.iloc[-1]) if not signal.empty else None,
        "macd_hist": float(hist.iloc[-1]) if not hist.empty else None,
        "bb_upper": float(bb_upper.iloc[-1]) if not bb_upper.empty else None,
        "bb_middle": float(ma20.iloc[-1]) if not ma20.empty else None,
        "bb_lower": float(bb_lower.iloc[-1]) if not bb_lower.empty else None,
        "ma5": float(close.rolling(5).mean().iloc[-1]),
        "ma20": float(close.rolling(20).mean().iloc[-1]),
        "ma60": float(close.rolling(60).mean().iloc[-1]) if len(close) >= 60 else None,
        "high_52w": float(close.rolling(min(252, len(close))).max().iloc[-1]),
        "low_52w": float(close.rolling(min(252, len(close))).min().iloc[-1]),
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

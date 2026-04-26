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


def get_market_universe(limit: int = 200, market: str = "ALL") -> list[dict]:
    """시장 스캔용 유니버스 목록을 반환한다.

    market: "KOSPI" | "KOSDAQ" | "ALL"
    """
    market_key = (market or "ALL").strip().upper()
    max_limit = max(1, min(int(limit or 1), 2_000))

    try:
        listing = _get_krx_listing()
        if listing.empty:
            return []

        df = listing.copy()
        if market_key in {"KOSPI", "KOSDAQ"}:
            df = df[df.get("Market", "").astype(str).str.upper() == market_key]

        if "Code" not in df.columns:
            return []

        rows: list[dict] = []
        for _, row in df.head(max_limit).iterrows():
            rows.append({
                "code": str(row.get("Code", "") or ""),
                "name": str(row.get("Name", "") or ""),
                "market": str(row.get("Market", "") or ""),
            })
        return rows
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

    # ATR(14) — Wilder's True Range. 손절 폭 산정용 변동성 지표.
    high_s = df["High"].astype(float) if "High" in df.columns else close
    low_s = df["Low"].astype(float) if "Low" in df.columns else close
    prev_close = close.shift(1)
    tr = pd.concat([
        (high_s - low_s).abs(),
        (high_s - prev_close).abs(),
        (low_s - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr14 = tr.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()

    # 일간수익률 표준편차(20거래일) — 변동성 보조 지표
    ret = close.pct_change()
    sigma20 = ret.rolling(20).std()

    # 직전 스윙 로우(20거래일 최저가) — 자연 손절 후보
    swing_low_20 = low_s.rolling(20).min()

    latest = df.iloc[-1]
    cur_price = _safe_float(latest["Close"])
    atr_val = _safe_float(atr14.iloc[-1]) if not atr14.empty else None
    sigma_val = _safe_float(sigma20.iloc[-1]) if not sigma20.empty else None
    swing_val = _safe_float(swing_low_20.iloc[-1]) if not swing_low_20.empty else None
    atr_pct = (atr_val / cur_price * 100) if (atr_val and cur_price) else None
    sigma_pct = (sigma_val * 100) if sigma_val is not None else None
    swing_drop_pct = ((cur_price - swing_val) / cur_price * 100) if (swing_val and cur_price) else None

    return {
        "ticker": ticker,
        "current_price": cur_price,
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
        # 변동성/손절 산정 지표
        "atr_14": atr_val,
        "atr_pct": _safe_float(atr_pct),
        "sigma_20d_pct": _safe_float(sigma_pct),
        "swing_low_20d": swing_val,
        "swing_low_drop_pct": _safe_float(swing_drop_pct),
        "last_updated": datetime.now().isoformat(),
    }


def _enrich_with_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """OHLCV df 에 MA / BB / RSI / MACD 컬럼을 추가한다 (in-place 안전).

    df.index 는 시계열 정렬되어 있어야 하며 'Close','High','Low','Volume' 컬럼이 있어야 한다.
    충분한 봉이 없으면 해당 지표는 NaN 으로 채워진다.
    """
    out = df.copy()
    close = out["Close"].astype(float)
    high = out.get("High", close).astype(float)
    low = out.get("Low", close).astype(float)

    # 이동평균
    out["ma5"] = close.rolling(5).mean()
    out["ma20"] = close.rolling(20).mean()
    out["ma60"] = close.rolling(60).mean()
    out["ma120"] = close.rolling(120).mean()

    # Bollinger Band (20, 2σ)
    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std(ddof=0)
    out["bb_mid"] = bb_mid
    out["bb_upper"] = bb_mid + 2 * bb_std
    out["bb_lower"] = bb_mid - 2 * bb_std

    # RSI(14) — Wilder's smoothing
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    avg_loss = loss.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = avg_gain / avg_loss.replace(0, float("nan"))
    out["rsi"] = 100 - (100 / (1 + rs))

    # MACD(12,26,9)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    out["macd"] = macd
    out["macd_signal"] = macd_signal
    out["macd_hist"] = macd - macd_signal

    # VWAP (running, 세션 단위 누적이 아닌 전체 누적)
    if "Volume" in out.columns:
        vol = out["Volume"].astype(float).fillna(0)
        typical = (high + low + close) / 3
        cum_vp = (typical * vol).cumsum()
        cum_v = vol.cumsum().replace(0, float("nan"))
        out["vwap"] = cum_vp / cum_v
    return out


def _series_to_points(
    df: pd.DataFrame,
    *,
    date_format: str = "%Y-%m-%d",
    display_bars: int | None = None,
) -> list[dict]:
    """Enriched OHLCV df → 차트용 포인트 리스트. display_bars 만큼 후미만 반환."""
    if df.empty:
        return []
    enriched = _enrich_with_indicators(df)
    if display_bars is not None and display_bars > 0:
        enriched = enriched.iloc[-display_bars:]

    fields = (
        "ma5", "ma20", "ma60", "ma120",
        "bb_upper", "bb_mid", "bb_lower",
        "rsi", "macd", "macd_signal", "macd_hist",
        "vwap",
    )
    result: list[dict] = []
    for idx, row in enriched.iterrows():
        close_val = _safe_float(row.get("Close"))
        if close_val is None:
            continue
        open_val = _safe_float(row.get("Open"))
        high_val = _safe_float(row.get("High"))
        low_val = _safe_float(row.get("Low"))
        volume = row.get("Volume", 0)
        try:
            stamp = idx.strftime(date_format)
        except BaseException:
            stamp = str(idx)
        point: dict = {
            "date": stamp,
            "open": open_val if open_val is not None else close_val,
            "high": high_val if high_val is not None else close_val,
            "low": low_val if low_val is not None else close_val,
            "close": close_val,
            "volume": int(float(volume)) if volume is not None and _safe_float(volume) is not None else 0,
        }
        for f in fields:
            point[f] = _safe_float(row.get(f))
        result.append(point)
    return result


def get_price_history(ticker: str, days: int = 180) -> list[dict]:
    """차트용 일봉 시계열 데이터 (OHLCV + 이동평균).

    하위호환용 래퍼. 새 코드는 ``get_daily_chart_series`` 사용 권장.
    """
    return get_daily_chart_series(ticker, display_bars=None, calendar_days=days)


def get_daily_chart_series(
    ticker: str,
    *,
    display_bars: int | None = None,
    calendar_days: int | None = None,
    indicator_lookback_bars: int = 130,
) -> list[dict]:
    """차트용 일봉 시계열 + 모든 지표 (MA/BB/RSI/MACD/VWAP) 사전계산.

    - ``display_bars`` 가 주어지면 마지막 N개 거래일만 반환 (지표 lookback 은 자동 보장).
    - ``calendar_days`` 만 주어지면 해당 calendar 기간을 그대로 반환.
    - 둘 다 주어지지 않으면 기본 180 calendar 일.
    """
    # 거래일 표시 윈도우 + lookback 만큼 calendar day 로 환산해 fetch
    if display_bars is not None:
        # 거래일 ≈ calendar 일 × 5/7 → 역산: bars × 7/5 + 마진 (휴장/공휴일)
        needed_bars = display_bars + indicator_lookback_bars
        fetch_calendar = int(needed_bars * 1.6) + 14
    elif calendar_days is not None:
        fetch_calendar = max(calendar_days, 30)
    else:
        fetch_calendar = 180

    end_dt = datetime.now()
    end = end_dt.strftime("%Y-%m-%d")
    start = (end_dt - timedelta(days=fetch_calendar)).strftime("%Y-%m-%d")

    df = get_ohlcv(ticker, start, end)
    if df.empty or "Close" not in df.columns:
        return []

    return _series_to_points(df, date_format="%Y-%m-%d", display_bars=display_bars)


def _yfinance_symbol_for(ticker: str) -> list[str]:
    """KRX 6자리 종목코드 → yfinance 심볼 후보 (우선순위 순)."""
    try:
        listing = _get_krx_listing()
        if not listing.empty and "Code" in listing.columns:
            row = listing[listing["Code"] == ticker]
            if not row.empty:
                market = str(row.iloc[0].get("Market", "")).upper()
                if market == "KOSPI":
                    return [f"{ticker}.KS", f"{ticker}.KQ"]
                if market == "KOSDAQ":
                    return [f"{ticker}.KQ", f"{ticker}.KS"]
    except BaseException:
        pass
    return [f"{ticker}.KS", f"{ticker}.KQ"]


def get_intraday_price_history(
    ticker: str,
    period: str = "1d",
    interval: str = "5m",
) -> list[dict]:
    """차트용 분봉 시계열 데이터 (yfinance 기반) + 모든 지표 사전계산.

    period: "1d" | "5d" | "1mo" 등 yfinance가 허용하는 값.
    interval: "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m".
    반환 항목의 ``date`` 필드는 ``YYYY-MM-DD HH:MM`` 형식이며 KST 기준이다.
    """
    try:
        import yfinance as yf
    except Exception:
        return []

    df = None
    last_err: BaseException | None = None
    for symbol in _yfinance_symbol_for(ticker):
        try:
            tk = yf.Ticker(symbol)
            tmp = tk.history(period=period, interval=interval, auto_adjust=False)
            if tmp is not None and not tmp.empty:
                df = tmp
                break
        except BaseException as exc:
            last_err = exc
            continue
    if df is None or df.empty:
        # 분봉 실패 시 빈 결과 — 호출 측이 일봉으로 폴백한다.
        if last_err is not None:
            pass
        return []

    # KST 변환. yfinance는 보통 tz-aware (Asia/Seoul) 인덱스를 돌려준다.
    try:
        if df.index.tz is None:
            df.index = df.index.tz_localize("Asia/Seoul")
        else:
            df.index = df.index.tz_convert("Asia/Seoul")
    except BaseException:
        pass

    return _series_to_points(df, date_format="%Y-%m-%d %H:%M", display_bars=None)


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

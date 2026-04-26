/**
 * 차트용 기술 지표 계산 유틸 (순수 함수, 클라이언트 측 계산)
 *
 * 모든 함수는 입력 길이와 동일한 길이의 배열을 반환하며, 워밍업 구간(데이터 부족)
 * 은 ``null`` 로 채워 Recharts 가 자동으로 라인 단절을 처리하도록 한다.
 */

export type Series = Array<number | null>;

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** 단순 이동평균 (Simple Moving Average) */
export function sma(values: Array<number | null>, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  let count = 0;
  const window: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isNum(v)) {
      window.push(v);
      sum += v;
      count++;
    } else {
      window.push(NaN);
    }
    if (window.length > period) {
      const drop = window.shift()!;
      if (Number.isFinite(drop)) {
        sum -= drop;
        count--;
      }
    }
    if (window.length === period && count === period) {
      out[i] = sum / period;
    }
  }
  return out;
}

/** 지수 이동평균 (Exponential Moving Average) */
export function ema(values: Array<number | null>, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  // 초기값: 첫 ``period`` 개의 SMA 로 시드
  let seed = 0;
  let seeded = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      out[i] = prev;
      continue;
    }
    if (prev === null) {
      seed += v;
      seeded++;
      if (seeded === period) {
        prev = seed / period;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's Smoothing (RSI/ATR 등에서 사용) */
function wilder(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** RSI (Relative Strength Index, Wilder 방식) */
export function rsi(closes: Array<number | null>, period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  const gains: number[] = new Array(closes.length).fill(0);
  const losses: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const c = closes[i];
    const p = closes[i - 1];
    if (!isNum(c) || !isNum(p)) continue;
    const diff = c - p;
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }
  // 초기 평균: 1..period 의 단순 평균
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** MACD (12,26,9) — line, signal, histogram */
export function macd(
  closes: Array<number | null>,
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: Series; signal: Series; hist: Series } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: Series = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return isNum(f) && isNum(s) ? f - s : null;
  });
  const signalLine = ema(macdLine, signal);
  const hist: Series = closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return isNum(m) && isNum(s) ? m - s : null;
  });
  return { macd: macdLine, signal: signalLine, hist };
}

/** Bollinger Bands (n,k) — upper / middle / lower */
export function bollinger(
  closes: Array<number | null>,
  period = 20,
  k = 2,
): { upper: Series; middle: Series; lower: Series; bandwidth: Series; percentB: Series } {
  const middle = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  const bandwidth: Series = new Array(closes.length).fill(null);
  const percentB: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = middle[i];
    if (!isNum(m)) continue;
    let sumSq = 0;
    let n = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = closes[j];
      if (!isNum(v)) continue;
      sumSq += (v - m) ** 2;
      n++;
    }
    if (n === 0) continue;
    const stddev = Math.sqrt(sumSq / n);
    const u = m + k * stddev;
    const l = m - k * stddev;
    upper[i] = u;
    lower[i] = l;
    bandwidth[i] = m === 0 ? null : (u - l) / m;
    const c = closes[i];
    if (isNum(c) && u !== l) {
      percentB[i] = (c - l) / (u - l);
    }
  }
  return { upper, middle, lower, bandwidth, percentB };
}

/** Stochastic Oscillator %K, %D */
export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3,
): { k: Series; d: Series } {
  const k: Series = new Array(closes.length).fill(null);
  for (let i = kPeriod - 1; i < closes.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    const range = hh - ll;
    k[i] = range === 0 ? 50 : ((closes[i] - ll) / range) * 100;
  }
  const d = sma(k, dPeriod);
  return { k, d };
}

/** ATR (Average True Range, Wilder) */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): Series {
  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
    } else {
      const a = highs[i] - lows[i];
      const b = Math.abs(highs[i] - closes[i - 1]);
      const c = Math.abs(lows[i] - closes[i - 1]);
      tr[i] = Math.max(a, b, c);
    }
  }
  return wilder(tr, period);
}

/**
 * VWAP — 분봉용. 일봉/장 전환 경계에서 누적이 리셋되도록 ``sessionKey`` 를
 * 인덱스별로 계산해 넘긴다 (예: 날짜 문자열).
 */
export function vwap(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  sessionKeys: string[],
): Series {
  const out: Series = new Array(closes.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  let lastKey: string | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (sessionKeys[i] !== lastKey) {
      cumPV = 0;
      cumV = 0;
      lastKey = sessionKeys[i];
    }
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const v = volumes[i] || 0;
    cumPV += tp * v;
    cumV += v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

/** OBV (On-Balance Volume) */
export function obv(closes: number[], volumes: number[]): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length === 0) return out;
  let acc = 0;
  out[0] = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) acc += volumes[i] || 0;
    else if (closes[i] < closes[i - 1]) acc -= volumes[i] || 0;
    out[i] = acc;
  }
  return out;
}

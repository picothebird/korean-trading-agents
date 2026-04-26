"use client";

/**
 * StockChartPro — 멀티패널 프로 차트 (TradingView 스타일).
 *
 * 디자인 원칙
 *  - 단일 호버 상태: 4개 패널이 ``syncId`` + 부모 ``onMouseMove`` 로 연동된다.
 *    개별 Tooltip 박스는 띄우지 않고, 각 패널 좌상단의 ``Pinned Readout`` 이
 *    호버 시점 값으로 갱신된다 (TradingView/HTS 패턴).
 *  - 정보 위계: 가격(메인) > 지표(MA/BB) > 보조(거래량/RSI/MACD).
 *  - 우측 가격축 폭 = 56px 고정 → 모든 패널의 좌우 정렬 유지.
 *  - 한국 컨벤션 컬러: 양봉=빨강(#e02a2a), 음봉=파랑(#2563eb).
 */

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Cell,
} from "recharts";
import type { StockChartPoint } from "@/types";
import {
  sma,
  rsi,
  macd as macdCalc,
  bollinger,
  vwap as vwapCalc,
} from "@/lib/indicators";

// ── 디자인 토큰 ────────────────────────────────────────────
const COLOR_UP = "#e02a2a";
const COLOR_DOWN = "#2563eb";
const COLOR_GRID = "rgba(15,23,42,0.06)";
const COLOR_TEXT = "var(--text-tertiary)";
const COLOR_MA5 = "#f59e0b";
const COLOR_MA20 = "#0ea5e9";
const COLOR_MA60 = "#16a34a";
const COLOR_MA120 = "#a855f7";
const COLOR_BB = "rgba(99,102,241,0.55)";
const COLOR_BB_FILL = "rgba(99,102,241,0.06)";
const COLOR_VWAP = "#ef4444";
const COLOR_RSI = "#7c3aed";
const COLOR_MACD = "#0ea5e9";
const COLOR_MACD_SIGNAL = "#f59e0b";

const AXIS_W = 56;

// ── 보조 함수 ─────────────────────────────────────────────
function fmtNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("ko-KR");
}

function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
  if (abs >= 1_0000) return `${(v / 1_0000).toFixed(1)}만`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Math.round(v).toString();
}

function fmtPriceAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}K`;
  return Math.round(v).toString();
}

// ── 타입 ─────────────────────────────────────────────────
interface ProRow extends StockChartPoint {
  idx: number;
  hl: [number, number];
  ma5p: number | null;
  ma20p: number | null;
  ma60p: number | null;
  ma120p: number | null;
  bbU: number | null;
  bbM: number | null;
  bbL: number | null;
  bbBand: [number, number] | null;
  vwap: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  isUp: boolean;
}

interface StockChartProProps {
  data: StockChartPoint[];
  resolution: "intraday" | "daily";
  height?: number;
  fmtDate: (s: string) => string;
}

// ── 캔들 SVG 렌더 ───────────────────────────────────────
function CandleShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ProRow;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || !Number.isFinite(height) || height <= 0) return null;
  const { open, close, high, low, isUp } = payload;
  const range = high - low;
  if (range <= 0) return null;
  const color = isUp ? COLOR_UP : COLOR_DOWN;
  const cx = x + width / 2;
  const openY = y + ((high - open) / range) * height;
  const closeY = y + ((high - close) / range) * height;
  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.max(1, Math.abs(closeY - openY));
  const bodyW = Math.max(1, width - 2);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyHeight} fill={color} stroke={color} />
    </g>
  );
}

function VolumeBarShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ProRow;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const color = payload.isUp ? COLOR_UP : COLOR_DOWN;
  const cx = x + width / 2;
  const w = Math.max(1, width - 2);
  return <rect x={cx - w / 2} y={y} width={w} height={height} fill={color} opacity={0.5} />;
}

// ── Pinned readout 배지 ─────────────────────────────────
function Tag({ label, value, color }: { label: string; value: string; color?: string }) {
  if (!value) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 3,
        padding: "1px 5px",
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(2px)",
        border: "1px solid var(--border-subtle, rgba(15,23,42,0.05))",
        borderRadius: 4,
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      {label && <span style={{ color: color ?? "var(--text-tertiary)", fontWeight: 700 }}>{label}</span>}
      <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}

function ReadoutRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 4,
        left: 6,
        right: AXIS_W + 4,
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {children}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────
export function StockChartPro({ data, resolution, height = 460, fmtDate }: StockChartProProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const rows: ProRow[] = useMemo(() => {
    if (data.length === 0) return [];
    const closes = data.map((d) => d.close);
    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);
    const volumes = data.map((d) => d.volume);

    // 백엔드에서 사전계산된 지표가 있는지 감지 (전체 봉의 마지막에 값이 있으면 OK).
    const last = data[data.length - 1];
    const hasBackendMA = last?.ma120 !== undefined;
    const hasBackendBB = last?.bb_upper !== undefined;
    const hasBackendRSI = last?.rsi !== undefined;
    const hasBackendMACD = last?.macd !== undefined;
    const hasBackendVWAP = last?.vwap !== undefined;

    // 백엔드 값이 없으면 클라이언트에서 폴백 계산 (구버전 호환).
    const ma5Cli = hasBackendMA ? null : sma(closes, 5);
    const ma20Cli = hasBackendMA ? null : sma(closes, 20);
    const ma60Cli = hasBackendMA ? null : sma(closes, 60);
    const ma120Cli = hasBackendMA ? null : sma(closes, 120);
    const bbCli = hasBackendBB ? null : bollinger(closes, 20, 2);
    const rCli = hasBackendRSI ? null : rsi(closes, 14);
    const mCli = hasBackendMACD ? null : macdCalc(closes, 12, 26, 9);
    const sessionKeys = data.map((d) => d.date.slice(0, 10));
    const vwCli =
      hasBackendVWAP || resolution !== "intraday"
        ? null
        : vwapCalc(highs, lows, closes, volumes, sessionKeys);

    return data.map((d, i) => {
      const ma5p = hasBackendMA ? d.ma5 ?? null : ma5Cli![i];
      const ma20p = hasBackendMA ? d.ma20 ?? null : ma20Cli![i];
      const ma60p = hasBackendMA ? d.ma60 ?? null : ma60Cli![i];
      const ma120p = hasBackendMA ? d.ma120 ?? null : ma120Cli![i];
      const bbU = hasBackendBB ? d.bb_upper ?? null : bbCli!.upper[i];
      const bbM = hasBackendBB ? d.bb_mid ?? null : bbCli!.middle[i];
      const bbL = hasBackendBB ? d.bb_lower ?? null : bbCli!.lower[i];
      const rsiVal = hasBackendRSI ? d.rsi ?? null : rCli![i];
      const macdVal = hasBackendMACD ? d.macd ?? null : mCli!.macd[i];
      const macdSig = hasBackendMACD ? d.macd_signal ?? null : mCli!.signal[i];
      const macdH = hasBackendMACD ? d.macd_hist ?? null : mCli!.hist[i];
      const vw =
        resolution === "intraday"
          ? hasBackendVWAP
            ? d.vwap ?? null
            : vwCli![i]
          : null;
      return {
        ...d,
        idx: i,
        hl: [d.low, d.high] as [number, number],
        ma5p,
        ma20p,
        ma60p,
        ma120p,
        bbU,
        bbM,
        bbL,
        bbBand: bbU != null && bbL != null ? ([bbL, bbU] as [number, number]) : null,
        vwap: vw,
        rsi: rsiVal,
        macd: macdVal,
        macdSignal: macdSig,
        macdHist: macdH,
        isUp: d.close >= d.open,
      };
    });
  }, [data, resolution]);

  if (rows.length === 0) return null;

  // 호버 인덱스가 없으면 마지막 봉을 readout 표시 기준으로 사용
  const cursorIdx =
    hoverIdx != null && hoverIdx >= 0 && hoverIdx < rows.length ? hoverIdx : rows.length - 1;
  const cur = rows[cursorIdx];
  const pct = ((cur.close - cur.open) / cur.open) * 100;

  // 비율 레이아웃: 메인 56% / 거래량 12% / RSI 16% / MACD 16%
  const mainH = Math.round(height * 0.56);
  const volH = Math.round(height * 0.12);
  const rsiH = Math.round(height * 0.16);
  const macdH = height - mainH - volH - rsiH;

  // 메인 패널 y 도메인 (BB 밴드 포함)
  const allMain: number[] = [];
  rows.forEach((r) => {
    allMain.push(r.high, r.low);
    if (r.bbU != null) allMain.push(r.bbU);
    if (r.bbL != null) allMain.push(r.bbL);
  });
  const yMin = Math.min(...allMain);
  const yMax = Math.max(...allMain);
  const yPad = (yMax - yMin) * 0.04;

  const onMove = (state: { isTooltipActive?: boolean; activeTooltipIndex?: number | string | null }) => {
    if (state?.isTooltipActive && state.activeTooltipIndex != null) {
      const idx = typeof state.activeTooltipIndex === "string"
        ? parseInt(state.activeTooltipIndex, 10)
        : state.activeTooltipIndex;
      if (Number.isFinite(idx)) setHoverIdx(idx as number);
    }
  };
  const onLeave = () => setHoverIdx(null);

  const xAxisCommon = {
    dataKey: "date" as const,
    tick: { fontSize: 9, fill: COLOR_TEXT } as const,
    axisLine: false as const,
    tickLine: false as const,
    interval: "preserveStartEnd" as const,
  };

  return (
    <div style={{ width: "100%", position: "relative" }}>
      {/* 상단 OHLC 헤드라인 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: 10,
          padding: "2px 6px 8px",
          fontSize: 11,
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.04em", fontWeight: 700 }}>
          {fmtDate(cur.date)}
        </span>
        <span>O <b style={{ color: "var(--text-primary)" }}>{fmtNum(cur.open)}</b></span>
        <span>H <b style={{ color: COLOR_UP }}>{fmtNum(cur.high)}</b></span>
        <span>L <b style={{ color: COLOR_DOWN }}>{fmtNum(cur.low)}</b></span>
        <span>
          C{" "}
          <b style={{ color: cur.isUp ? COLOR_UP : COLOR_DOWN }}>{fmtNum(cur.close)}</b>{" "}
          <span style={{ color: cur.isUp ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </span>
        </span>
        <span style={{ color: "var(--text-tertiary)" }}>
          Vol <b style={{ color: "var(--text-primary)" }}>{fmtCompact(cur.volume)}</b>
        </span>
      </div>

      {/* 메인 패널 */}
      <div style={{ position: "relative", height: mainH }}>
        <ReadoutRow>
          <Tag label="MA5" value={fmtNum(cur.ma5p)} color={COLOR_MA5} />
          <Tag label="MA20" value={fmtNum(cur.ma20p)} color={COLOR_MA20} />
          <Tag label="MA60" value={fmtNum(cur.ma60p)} color={COLOR_MA60} />
          <Tag label="MA120" value={fmtNum(cur.ma120p)} color={COLOR_MA120} />
          <Tag label="BB" value={`${fmtNum(cur.bbL)} – ${fmtNum(cur.bbU)}`} color={COLOR_BB} />
          {resolution === "intraday" && cur.vwap != null && (
            <Tag label="VWAP" value={fmtNum(cur.vwap)} color={COLOR_VWAP} />
          )}
        </ReadoutRow>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            syncId="kta-pro"
            margin={{ top: 28, right: 6, left: 0, bottom: 0 }}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
          >
            <CartesianGrid stroke={COLOR_GRID} strokeDasharray="3 3" />
            <XAxis {...xAxisCommon} hide />
            <YAxis
              orientation="right"
              domain={[yMin - yPad, yMax + yPad]}
              tick={{ fontSize: 9, fill: COLOR_TEXT }}
              tickFormatter={fmtPriceAxis}
              axisLine={false}
              tickLine={false}
              width={AXIS_W}
            />
            <Area
              type="linear"
              dataKey="bbBand"
              stroke="none"
              fill={COLOR_BB_FILL}
              isAnimationActive={false}
              connectNulls
            />
            <Line type="monotone" dataKey="bbU" stroke={COLOR_BB} strokeWidth={1} dot={false} strokeDasharray="2 3" isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="bbL" stroke={COLOR_BB} strokeWidth={1} dot={false} strokeDasharray="2 3" isAnimationActive={false} connectNulls />
            <Bar
              dataKey="hl"
              shape={(p: unknown) => <CandleShape {...(p as Parameters<typeof CandleShape>[0])} />}
              isAnimationActive={false}
            />
            <Line type="monotone" dataKey="ma5p" stroke={COLOR_MA5} strokeWidth={1.1} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="ma20p" stroke={COLOR_MA20} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="ma60p" stroke={COLOR_MA60} strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="ma120p" stroke={COLOR_MA120} strokeWidth={1.1} dot={false} isAnimationActive={false} connectNulls />
            {resolution === "intraday" && (
              <Line type="monotone" dataKey="vwap" stroke={COLOR_VWAP} strokeWidth={1.2} dot={false} strokeDasharray="4 2" isAnimationActive={false} connectNulls />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 거래량 패널 */}
      <div style={{ position: "relative", height: volH, borderTop: "1px solid var(--border-subtle, rgba(15,23,42,0.05))" }}>
        <ReadoutRow>
          <Tag label="Vol" value={fmtCompact(cur.volume)} />
        </ReadoutRow>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            syncId="kta-pro"
            margin={{ top: 18, right: 6, left: 0, bottom: 0 }}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
          >
            <XAxis {...xAxisCommon} hide />
            <YAxis
              orientation="right"
              tick={{ fontSize: 8, fill: COLOR_TEXT }}
              tickFormatter={fmtCompact}
              axisLine={false}
              tickLine={false}
              width={AXIS_W}
              tickCount={3}
            />
            <Bar
              dataKey="volume"
              shape={(p: unknown) => <VolumeBarShape {...(p as Parameters<typeof VolumeBarShape>[0])} />}
              isAnimationActive={false}
            >
              {rows.map((r, i) => (
                <Cell key={i} fill={r.isUp ? COLOR_UP : COLOR_DOWN} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* RSI 패널 */}
      <div style={{ position: "relative", height: rsiH, borderTop: "1px solid var(--border-subtle, rgba(15,23,42,0.05))" }}>
        <ReadoutRow>
          <Tag label="RSI(14)" value={cur.rsi == null ? "—" : cur.rsi.toFixed(2)} color={COLOR_RSI} />
          {cur.rsi != null && (
            <Tag
              label=""
              value={cur.rsi >= 70 ? "과매수" : cur.rsi <= 30 ? "과매도" : "중립"}
              color={cur.rsi >= 70 ? COLOR_UP : cur.rsi <= 30 ? COLOR_DOWN : COLOR_TEXT}
            />
          )}
        </ReadoutRow>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            syncId="kta-pro"
            margin={{ top: 18, right: 6, left: 0, bottom: 0 }}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
          >
            <CartesianGrid stroke={COLOR_GRID} strokeDasharray="3 3" />
            <XAxis {...xAxisCommon} hide />
            <YAxis
              orientation="right"
              domain={[0, 100]}
              ticks={[30, 70]}
              tick={{ fontSize: 8, fill: COLOR_TEXT }}
              axisLine={false}
              tickLine={false}
              width={AXIS_W}
            />
            <ReferenceArea y1={70} y2={100} fill={COLOR_UP} fillOpacity={0.05} />
            <ReferenceArea y1={0} y2={30} fill={COLOR_DOWN} fillOpacity={0.05} />
            <ReferenceLine y={70} stroke={COLOR_UP} strokeDasharray="3 3" strokeWidth={0.8} />
            <ReferenceLine y={30} stroke={COLOR_DOWN} strokeDasharray="3 3" strokeWidth={0.8} />
            <Line type="monotone" dataKey="rsi" stroke={COLOR_RSI} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* MACD 패널 */}
      <div style={{ position: "relative", height: macdH, borderTop: "1px solid var(--border-subtle, rgba(15,23,42,0.05))" }}>
        <ReadoutRow>
          <Tag label="MACD" value={cur.macd == null ? "—" : cur.macd.toFixed(2)} color={COLOR_MACD} />
          <Tag label="Signal" value={cur.macdSignal == null ? "—" : cur.macdSignal.toFixed(2)} color={COLOR_MACD_SIGNAL} />
          <Tag
            label="Hist"
            value={cur.macdHist == null ? "—" : cur.macdHist.toFixed(2)}
            color={cur.macdHist != null && cur.macdHist >= 0 ? COLOR_UP : COLOR_DOWN}
          />
        </ReadoutRow>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            syncId="kta-pro"
            margin={{ top: 18, right: 6, left: 0, bottom: 4 }}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
          >
            <CartesianGrid stroke={COLOR_GRID} strokeDasharray="3 3" />
            <XAxis {...xAxisCommon} tickFormatter={fmtDate} />
            <YAxis
              orientation="right"
              tick={{ fontSize: 8, fill: COLOR_TEXT }}
              axisLine={false}
              tickLine={false}
              width={AXIS_W}
              tickCount={3}
            />
            <ReferenceLine y={0} stroke="var(--border-default)" strokeWidth={0.8} />
            <Bar dataKey="macdHist" isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell
                  key={i}
                  fill={r.macdHist != null && r.macdHist >= 0 ? COLOR_UP : COLOR_DOWN}
                  fillOpacity={0.45}
                />
              ))}
            </Bar>
            <Line type="monotone" dataKey="macd" stroke={COLOR_MACD} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="macdSignal" stroke={COLOR_MACD_SIGNAL} strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

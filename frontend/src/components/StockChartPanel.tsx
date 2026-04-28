"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  Bar,
  Cell,
  ReferenceDot,
} from "recharts";
import { getStockChart } from "@/lib/api";
import type { StockChartPoint, StockChartResponse } from "@/types";
import { Empty, Icon } from "@/components/ui";
import { StockChartPro } from "@/components/StockChartPro";
import { IndicatorGuide } from "@/components/IndicatorGuide";

type Timeframe = "1d" | "5d" | "1w" | "2w" | "1m" | "3m" | "6m" | "1y" | "2y";

const INTRADAY_TIMEFRAMES = new Set<Timeframe>(["1d", "5d"]);

interface PredictionMarker {
  date: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence?: number;
}

interface TradeMarker {
  timestamp: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  status: string;
}

interface StockChartPanelProps {
  ticker: string;
  predictionMarkers?: PredictionMarker[];
  tradeMarkers?: TradeMarker[];
  compact?: boolean;
}

function fmtDate(v: string): string {
  if (!v) return v;
  // "YYYY-MM-DD HH:MM" 이면 시각 위주로 표시
  if (v.length >= 13 && v.includes(" ")) {
    const [d, t] = v.split(" ");
    const dParts = d.split("-");
    const dayLabel = dParts.length >= 3 ? `${dParts[1]}.${dParts[2]}` : d;
    return `${dayLabel} ${t}`;
  }
  const parts = v.split("-");
  if (parts.length < 3) return v;
  return `${parts[1]}.${parts[2]}`;
}

function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
  if (abs >= 1_0000) return `${(v / 1_0000).toFixed(1)}만`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Math.round(v).toString();
}

function PriceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: StockChartPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const pct = ((row.close - row.open) / row.open) * 100;
  const isUp = row.close >= row.open;

  return (
    <div
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "var(--shadow-lg)",
        fontVariantNumeric: "tabular-nums",
        minWidth: 160,
      }}
    >
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: isUp ? "#e02a2a" : "#2563eb", marginBottom: 4 }}>
        {row.close.toLocaleString("ko-KR")}원
        <span style={{ marginLeft: 6, fontSize: 11 }}>
          {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
        </span>
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 6, rowGap: 1, fontSize: 10, color: "var(--text-secondary)" }}>
        <span style={{ color: "var(--text-tertiary)" }}>시</span><span>{row.open.toLocaleString("ko-KR")}</span>
        <span style={{ color: "var(--text-tertiary)" }}>고</span><span style={{ color: "#e02a2a" }}>{row.high.toLocaleString("ko-KR")}</span>
        <span style={{ color: "var(--text-tertiary)" }}>저</span><span style={{ color: "#2563eb" }}>{row.low.toLocaleString("ko-KR")}</span>
        <span style={{ color: "var(--text-tertiary)" }}>거래량</span><span>{row.volume.toLocaleString("ko-KR")}</span>
        {row.ma20 != null && (<><span style={{ color: "#0ea5e9" }}>MA20</span><span>{Math.round(row.ma20).toLocaleString("ko-KR")}</span></>)}
        {row.ma60 != null && (<><span style={{ color: "#a855f7" }}>MA60</span><span>{Math.round(row.ma60).toLocaleString("ko-KR")}</span></>)}
      </div>
    </div>
  );
}

export function StockChartPanel({
  ticker,
  predictionMarkers = [],
  tradeMarkers = [],
  compact = false,
}: StockChartPanelProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("6m");
  // 차트 간단/상세 토글 (P3.C1)
  const [detailedMode, setDetailedMode] = useState(false);
  // 심플(라인) ↔ 프로(캔들+멀티패널) 전환
  const [proMode, setProMode] = useState(false);
  const [data, setData] = useState<StockChartPoint[]>([]);
  const [resolution, setResolution] = useState<"intraday" | "daily">("daily");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async (isBackground = false) => {
      if (!isBackground) {
        setLoading(true);
        setError(null);
      }
      try {
        const res: StockChartResponse = await getStockChart(ticker, timeframe);
        if (!cancelled) {
          const points = res.points ?? [];
          setData(points);
          setResolution(res.resolution ?? (INTRADAY_TIMEFRAMES.has(timeframe) ? "intraday" : "daily"));
          if (points.length === 0 && !isBackground) {
            setError(
              res.warning
                ? `데이터를 불러오지 못했습니다 (${res.warning}). 잠시 뒤 다시 시도하거나 다른 기간을 선택해 주십시오.`
                : "표시할 데이터가 없습니다.",
            );
          }
        }
      } catch (e: unknown) {
        if (!cancelled && !isBackground) {
          setError(e instanceof Error ? e.message : "차트를 불러오지 못했습니다.");
          setData([]);
        }
      } finally {
        if (!cancelled && !isBackground) setLoading(false);
      }
    };

    // Delay initial fetch slightly
    const t = setTimeout(() => void run(false), 300);
    // Background polling every 15s
    const poller = setInterval(() => void run(true), 15000);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(poller);
    };
  }, [ticker, timeframe]);

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const changePct = latest && prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const isIntraday = resolution === "intraday";

  const closeByDate = useMemo(() => {
    return new Map(data.map((p) => [p.date, p.close]));
  }, [data]);

  const mergedMarkers = useMemo(() => {
    const preds = predictionMarkers.map((m, idx) => ({
      id: `pred-${idx}-${m.date}`,
      date: m.date,
      type: m.signal,
      color: m.signal === "BUY" ? "var(--bull)" : m.signal === "SELL" ? "var(--bear)" : "var(--text-tertiary)",
      label: m.signal,
    }));
    const trades = tradeMarkers.map((m, idx) => ({
      id: `trade-${idx}-${m.timestamp}`,
      date: m.timestamp.slice(0, 10),
      type: m.side === "buy" ? "BUY" : "SELL",
      color: m.side === "buy" ? "var(--bull)" : "var(--bear)",
      label: m.side === "buy" ? "체결 매수" : "체결 매도",
    }));
    return [...preds, ...trades].filter((m) => closeByDate.has(m.date));
  }, [predictionMarkers, tradeMarkers, closeByDate]);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-sm)",
        padding: compact ? "10px 10px 8px" : "14px 14px 12px",
        marginTop: compact ? 0 : 10,
      }}
    >
      {/* 헤더: 좌측 타이틀+가격 / 우측 모드 토글 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            실시간 가격 차트
          </p>
          {latest && (
            <p style={{
              fontSize: 13, fontWeight: 700,
              color: changePct >= 0 ? "var(--bull)" : "var(--bear)",
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}>
              {latest.close.toLocaleString("ko-KR")}원
              <span style={{ marginLeft: 6, fontSize: 11 }}>
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </span>
            </p>
          )}
        </div>

        {/* 모드 토글 (세그먼트 스타일) */}
        <div style={{
          display: "inline-flex",
          padding: 2,
          background: "var(--bg-muted, rgba(15,23,42,0.04))",
          border: "1px solid var(--border-default)",
          borderRadius: 99,
          flexShrink: 0,
        }}>
          {([
            ["simple", "심플"],
            ["pro", "PRO"],
          ] as Array<[string, string]>).map(([key, label]) => {
            const active = (key === "pro") === proMode;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setProMode(key === "pro")}
                style={{
                  border: "none",
                  background: active ? "var(--bg-surface)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                  borderRadius: 99,
                  padding: "3px 10px",
                  cursor: "pointer",
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 타임프레임 행 — 헤더와 분리하여 충돌 방지 */}
      <div style={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: "1px solid var(--border-subtle, rgba(15,23,42,0.05))",
      }}>
        {([
          ["1d", "1D"],
          ["5d", "5D"],
          ["2w", "2W"],
          ["1m", "1M"],
          ["3m", "3M"],
          ["6m", "6M"],
          ["1y", "1Y"],
          ["2y", "2Y"],
        ] as Array<[Timeframe, string]>).map(([key, label]) => {
          const active = timeframe === key;
          return (
            <button
              key={key}
              onClick={() => setTimeframe(key)}
              style={{
                border: "none",
                background: active ? "var(--brand-subtle)" : "transparent",
                color: active ? "var(--brand)" : "var(--text-tertiary)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.02em",
                borderRadius: 6,
                padding: "3px 9px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div style={{ height: compact ? 180 : 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>차트를 불러오는 중…</p>
        </div>
      )}

      {!loading && error && (
        <div style={{ minHeight: compact ? 180 : 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Empty
            icon={<Icon name="warning" size={28} decorative />}
            title="차트를 불러오지 못했어요"
            body={error}
            compact
          />
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div style={{ minHeight: compact ? 180 : 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Empty
            icon={<Icon name="trend-up" size={28} decorative />}
            title="차트 데이터가 없습니다"
            body="다른 기간을 선택하거나 잠시 뒤 다시 시도해 주십시오."
            compact
          />
        </div>
      )}

      {!loading && !error && data.length > 0 && proMode && (
        <>
          <StockChartPro
            data={data}
            resolution={resolution}
            height={compact ? 380 : 500}
            fmtDate={fmtDate}
          />
          <IndicatorGuide isIntraday={isIntraday} proMode showMarkers />
        </>
      )}

      {!loading && !error && data.length > 0 && !proMode && (
        <>
          <div style={{ height: compact ? 145 : 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 2 }}>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  domain={["dataMin", "dataMax"]}
                />
                <Tooltip content={<PriceTooltip />} cursor={{ stroke: "var(--text-tertiary)", strokeDasharray: "2 2" }} />
                <Line type="monotone" dataKey="close" stroke="var(--text-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="ma20" stroke="#0ea5e9" strokeWidth={1.3} dot={false} isAnimationActive={false} />
                {detailedMode && (
                  <Line type="monotone" dataKey="ma60" stroke="#a855f7" strokeWidth={1.1} dot={false} strokeDasharray="4 3" isAnimationActive={false} />
                )}
                {mergedMarkers.map((m) => (
                  <ReferenceDot
                    key={m.id}
                    x={m.date}
                    y={closeByDate.get(m.date) ?? 0}
                    r={3}
                    fill={m.color}
                    stroke="var(--bg-surface)"
                    strokeWidth={1.5}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ height: compact ? 50 : 64, marginTop: 4 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 0, right: 10, left: 4, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 8, fill: "var(--text-tertiary)" }}
                  tickFormatter={fmtCompact}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickCount={3}
                />
                <Tooltip
                  cursor={{ fill: "rgba(15,23,42,0.04)" }}
                  formatter={(value: unknown) => [fmtCompact(Number(value)), "거래량"]}
                  labelFormatter={(v) => fmtDate(String(v))}
                  contentStyle={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    fontSize: 11,
                    padding: "6px 8px",
                  }}
                />
                <Bar dataKey="volume" radius={[1, 1, 0, 0]} isAnimationActive={false}>
                  {data.map((p, i) => {
                    const prev = i > 0 ? data[i - 1].close : p.open;
                    const up = p.close >= prev;
                    return (
                      <Cell key={i} fill={up ? "#e02a2a" : "#2563eb"} fillOpacity={0.5} />
                    );
                  })}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
            <LegendSwatch color="var(--text-primary)" label={isIntraday ? "가격" : "종가"} kind="line" />
            <LegendSwatch color="var(--brand)" label={isIntraday ? "MA20 (20봉 평균)" : "20일 평균"} kind="line" />
            {detailedMode && <LegendSwatch color="var(--text-tertiary)" label={isIntraday ? "MA60 (60봉 평균)" : "60일 평균"} kind="dashed" />}
            <LegendSwatch color="var(--bull)" label="예측·체결" kind="dot" />
            <button
              type="button"
              onClick={() => setDetailedMode((v) => !v)}
              style={{
                marginLeft: "auto",
                padding: "2px 8px", borderRadius: 99,
                border: "1px solid var(--border-default)",
                background: detailedMode ? "var(--brand-subtle)" : "transparent",
                color: detailedMode ? "var(--brand)" : "var(--text-tertiary)",
                fontSize: 9, fontWeight: 700, cursor: "pointer",
              }}
            >
              {detailedMode ? "간단 모드" : "상세 모드"}
            </button>
          </div>
          <IndicatorGuide isIntraday={isIntraday} proMode={false} detailedMode={detailedMode} showMarkers />
        </>
      )}
    </div>
  );
}

function LegendSwatch({ color, label, kind }: { color: string; label: string; kind: "line" | "dashed" | "dot" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {kind === "dot" ? (
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
      ) : kind === "dashed" ? (
        <svg width={22} height={6} aria-hidden style={{ flexShrink: 0 }}>
          <line x1={1} y1={3} x2={21} y2={3} stroke={color} strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width={22} height={6} aria-hidden style={{ flexShrink: 0 }}>
          <line x1={1} y1={3} x2={21} y2={3} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </svg>
      )}
      <span>{label}</span>
    </span>
  );
}

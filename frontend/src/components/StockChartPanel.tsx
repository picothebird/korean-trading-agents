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
  ReferenceDot,
} from "recharts";
import { getStockChart } from "@/lib/api";
import type { StockChartPoint } from "@/types";
import { Empty, Icon } from "@/components/ui";

type Timeframe = "1m" | "3m" | "6m" | "1y" | "2y";

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
  const parts = v.split("-");
  if (parts.length < 3) return v;
  return `${parts[1]}.${parts[2]}`;
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

  return (
    <div
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        padding: "8px 10px",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 1 }}>
        시가 {row.open.toLocaleString("ko-KR")} · 고가 {row.high.toLocaleString("ko-KR")}
      </p>
      <p style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 1 }}>
        저가 {row.low.toLocaleString("ko-KR")} · 종가 {row.close.toLocaleString("ko-KR")}
      </p>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 1 }}>
        거래량 {row.volume.toLocaleString("ko-KR")}
      </p>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
        MA20 {row.ma20 ? row.ma20.toLocaleString("ko-KR") : "-"} · MA60 {row.ma60 ? row.ma60.toLocaleString("ko-KR") : "-"}
      </p>
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
  const [data, setData] = useState<StockChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getStockChart(ticker, timeframe);
        if (!cancelled) setData(res.points ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "차트 조회 실패");
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [ticker, timeframe]);

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const changePct = latest && prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            실시간 가격 차트
          </p>
          {latest && (
            <p style={{ fontSize: 12, fontWeight: 700, color: changePct >= 0 ? "var(--bull)" : "var(--bear)", marginTop: 2 }}>
              {latest.close.toLocaleString("ko-KR")}원 {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {([
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
                  border: "1px solid var(--border-default)",
                  background: active ? "var(--brand-subtle)" : "transparent",
                  color: active ? "var(--brand)" : "var(--text-tertiary)",
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: 99,
                  padding: "2px 7px",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
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
            title="차트 데이터가 아직 없어요"
            body="다른 기간을 선택하거나 잠시 뒤 다시 시도해주세요."
            compact
          />
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <div style={{ height: compact ? 145 : 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 10, left: 4, bottom: 2 }}>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<PriceTooltip />} />
                <Line type="monotone" dataKey="close" stroke="var(--text-primary)" strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="ma20" stroke="var(--brand)" strokeWidth={1.4} dot={false} />
                {detailedMode && (
                  <Line type="monotone" dataKey="ma60" stroke="var(--text-tertiary)" strokeWidth={1.2} dot={false} strokeDasharray="4 4" />
                )}
                {mergedMarkers.map((m) => (
                  <ReferenceDot
                    key={m.id}
                    x={m.date}
                    y={closeByDate.get(m.date) ?? 0}
                    r={3}
                    fill={m.color}
                    stroke="none"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ height: compact ? 56 : 76, marginTop: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 0, right: 10, left: 4, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis
                  tick={{ fontSize: 8, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  formatter={(value: unknown) => [Number(value).toLocaleString("ko-KR"), "거래량"]}
                  labelFormatter={(v) => String(v)}
                />
                <Bar dataKey="volume" fill="var(--brand-border)" radius={[2, 2, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
            <LegendSwatch color="var(--text-primary)" label="종가" kind="line" />
            <LegendSwatch color="var(--brand)" label="20일 평균" kind="line" />
            {detailedMode && <LegendSwatch color="var(--text-tertiary)" label="60일 평균" kind="dashed" />}
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
          {/* 색상/지표 의미 호버 설명 (P3.C2/C3) */}
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 9, color: "var(--text-tertiary)", cursor: "pointer", listStyle: "none" }}>
              ❓ 선과 점의 의미
            </summary>
            <ul style={{ marginTop: 4, paddingLeft: 14, fontSize: 9, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <li><b>종가(검은 선)</b> — 매일 장 마감 시점의 가격</li>
              <li><b>20일 평균(파란 선)</b> — 단기 추세. 종가가 평균 위면 단기 강세</li>
              {detailedMode && <li><b>60일 평균(회색 점선)</b> — 중기 추세. 20일 평균이 60일을 위로 뚫으면 골든크로스</li>}
              <li><b>빨간 점</b> — AI 예측 지점 또는 실제 매수/매도 체결 지점</li>
            </ul>
          </details>
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

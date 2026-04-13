"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { motion } from "framer-motion";
import type { BacktestResult } from "@/types";

interface MetricProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
}

function Metric({ label, value, sub, positive }: MetricProps) {
  const color = positive === true ? "var(--bull)" : positive === false ? "var(--bear)" : "var(--text-primary)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 14px",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</p>}
    </motion.div>
  );
}

interface BacktestPanelProps {
  result: BacktestResult;
}

// Custom tooltip for recharts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{value: number}>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)", padding: "8px 12px", boxShadow: "var(--shadow-lg)",
    }}>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
        {payload[0].value.toLocaleString("ko-KR")}원
      </p>
    </div>
  );
}

export function BacktestPanel({ result }: BacktestPanelProps) {
  const m = result.metrics;
  const isProfit = m.total_return > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Metric label="총 수익률" value={`${m.total_return >= 0 ? "+" : ""}${m.total_return.toFixed(1)}%`} positive={m.total_return > 0} />
        <Metric label="연간 수익률" value={`${m.annualized_return >= 0 ? "+" : ""}${m.annualized_return.toFixed(1)}%`} positive={m.annualized_return > 0} />
        <Metric label="초과수익 α" value={`${m.alpha >= 0 ? "+" : ""}${m.alpha.toFixed(1)}%`} positive={m.alpha > 0} />
        <Metric label="샤프 비율" value={m.sharpe_ratio.toFixed(2)} positive={m.sharpe_ratio > 1 ? true : m.sharpe_ratio < 0 ? false : null} sub="1.0↑ 우수" />
        <Metric label="최대 낙폭" value={`${m.max_drawdown.toFixed(1)}%`} positive={m.max_drawdown > -10} sub="낮을수록 좋음" />
        <Metric label="승률" value={`${m.win_rate.toFixed(1)}%`} positive={m.win_rate > 55 ? true : m.win_rate < 45 ? false : null} />
        <Metric label="칼마 비율" value={m.calmar_ratio.toFixed(2)} positive={null} />
        <Metric label="손익비" value={m.profit_factor.toFixed(2)} positive={m.profit_factor > 1.5 ? true : m.profit_factor < 1 ? false : null} />
        <Metric label="총 거래" value={`${m.total_trades}회`} positive={null} />
      </div>

      {/* Equity curve */}
      {result.equity_curve?.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            수익 곡선
          </p>
          <div style={{
            background: "var(--bg-elevated)", borderRadius: "var(--radius-xl)",
            padding: "16px 8px 8px", border: "1px solid var(--border-subtle)",
          }}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={result.equity_curve} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isProfit ? "#F04452" : "#2B7EF5"} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={isProfit ? "#F04452" : "#2B7EF5"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => v.slice(5)}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                  width={44}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={10000000} stroke="var(--border-strong)" strokeDasharray="4 4" />
                <Area
                  type="monotone" dataKey="value"
                  stroke={isProfit ? "#F04452" : "#2B7EF5"} strokeWidth={2}
                  fill="url(#equityGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.6 }}>
        ⚠ 과거 수익률은 미래를 보장하지 않습니다 · 투자 결정은 본인 책임
      </p>
    </div>
  );
}


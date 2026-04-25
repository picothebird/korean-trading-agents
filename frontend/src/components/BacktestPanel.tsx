"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { motion } from "framer-motion";
import type { BacktestResult } from "@/types";
import { Icon } from "@/components/ui";

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
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 14px",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-sm)",
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

const MONITORING_THRESHOLDS = {
  hitRateGood: 58,
  hitRateWeak: 50,
  errorGood: 3.2,
  errorWeak: 5.0,
};

function getHitRateSignal(hitRate: number): boolean | null {
  if (hitRate >= MONITORING_THRESHOLDS.hitRateGood) return true;
  if (hitRate <= MONITORING_THRESHOLDS.hitRateWeak) return false;
  return null;
}

function getErrorSignal(avgAbsErrorPct: number): boolean | null {
  if (avgAbsErrorPct <= MONITORING_THRESHOLDS.errorGood) return true;
  if (avgAbsErrorPct >= MONITORING_THRESHOLDS.errorWeak) return false;
  return null;
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

function PredictionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { date: string; signal: string; hit: boolean; confidence: number; actualReturn: number; predictedReturn: number }; value: number; name?: string }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={{
      background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)", padding: "8px 12px", boxShadow: "var(--shadow-lg)",
    }}>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>{row.date}</p>
      <p style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 700, marginBottom: 2 }}>
        시그널: {row.signal} · 신뢰도 {(row.confidence * 100).toFixed(0)}%
      </p>
      <p style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 1 }}>
        예측 수익률 {row.predictedReturn >= 0 ? "+" : ""}{row.predictedReturn.toFixed(2)}%
      </p>
      <p style={{ fontSize: 10, color: row.actualReturn >= 0 ? "var(--bull)" : "var(--bear)", marginBottom: 1 }}>
        실제 수익률 {row.actualReturn >= 0 ? "+" : ""}{row.actualReturn.toFixed(2)}%
      </p>
      <p style={{ fontSize: 10, color: row.hit ? "var(--success)" : "var(--error)", fontWeight: 600 }}>
        {row.hit ? "예측 적중" : "예측 빗나감"}
      </p>
    </div>
  );
}

export function BacktestPanel({ result }: BacktestPanelProps) {
  const m = result.metrics;
  const isProfit = m.total_return > 0;
  const predictionTrace = result.prediction_trace ?? [];
  const predictionMonitoring = result.prediction_monitoring;
  const predictionChartData = predictionTrace.map((p) => ({
    date: p.prediction_date,
    actual: p.actual_price,
    predicted: p.predicted_price,
    signal: p.signal,
    hit: p.hit,
    confidence: p.confidence,
    actualReturn: p.actual_return_pct,
    predictedReturn: p.predicted_return_pct,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Plain-language summary line */}
      <div
        style={{
          padding: "12px 16px",
          background: m.total_return >= 0 ? "var(--bull-subtle)" : "var(--bear-subtle)",
          border: `1px solid ${m.total_return >= 0 ? "var(--bull-border)" : "var(--bear-border)"}`,
          borderRadius: "var(--radius-lg)",
          fontSize: 12,
          color: "var(--text-primary)",
          lineHeight: 1.55,
        }}
      >
        이 전략은 같은 기간 벤치마크 대비
        {" "}<strong style={{ color: m.alpha > 0 ? "var(--bull)" : "var(--bear)" }}>
          {m.alpha >= 0 ? "+" : ""}{m.alpha.toFixed(1)}%p
        </strong>{" "}
        의 초과 수익을 만들었고, 가장 컸던 손실은
        {" "}<strong>{m.max_drawdown.toFixed(1)}%</strong>{" "}
        였어요. 승률 <strong>{m.win_rate.toFixed(1)}%</strong> · {m.total_trades}회 거래.
      </div>

      {/* Headline KPIs (3 large) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Metric label="총 수익률" value={`${m.total_return >= 0 ? "+" : ""}${m.total_return.toFixed(1)}%`} positive={m.total_return > 0} />
        <Metric label="초과수익 α" value={`${m.alpha >= 0 ? "+" : ""}${m.alpha.toFixed(1)}%`} positive={m.alpha > 0} sub="vs 벤치마크" />
        <Metric label="샤프 비율" value={m.sharpe_ratio.toFixed(2)} positive={m.sharpe_ratio > 1 ? true : m.sharpe_ratio < 0 ? false : null} sub="1.0 이상이면 우수" />
      </div>

      {/* Secondary metrics (6 small) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Metric label="연간 수익률" value={`${m.annualized_return >= 0 ? "+" : ""}${m.annualized_return.toFixed(1)}%`} positive={m.annualized_return > 0} />
        <Metric label="최대 낙폭" value={`${m.max_drawdown.toFixed(1)}%`} positive={m.max_drawdown > -10} sub="작을수록 안전" />
        <Metric label="승률" value={`${m.win_rate.toFixed(1)}%`} positive={m.win_rate > 55 ? true : m.win_rate < 45 ? false : null} />
        <Metric label="칼마 비율" value={m.calmar_ratio.toFixed(2)} positive={null} />
        <Metric label="손익비" value={m.profit_factor.toFixed(2)} positive={m.profit_factor > 1.5 ? true : m.profit_factor < 1 ? false : null} />
        <Metric label="총 거래" value={`${m.total_trades}회`} positive={null} />
      </div>

      {/* Benchmark vs AI row */}
      {m.benchmark_return !== undefined && (
        <div style={{
          display: "flex", gap: 10, alignItems: "center",
          padding: "10px 14px", background: "var(--bg-elevated)",
          borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", flex: 1 }}>벤치마크 수익률</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {m.benchmark_return >= 0 ? "+" : ""}{m.benchmark_return.toFixed(1)}%
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            background: m.alpha > 0 ? "var(--success-subtle)" : "var(--error-subtle)",
            color: m.alpha > 0 ? "var(--success)" : "var(--error)",
          }}>
            AI {m.alpha > 0 ? "+" : ""}{m.alpha.toFixed(1)}% 초과
          </span>
        </div>
      )}

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
                    <stop offset="5%" stopColor={isProfit ? "var(--bull)" : "var(--bear)"} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={isProfit ? "var(--bull)" : "var(--bear)"} stopOpacity={0} />
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
                  stroke={isProfit ? "var(--bull)" : "var(--bear)"} strokeWidth={2}
                  fill="url(#equityGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Prediction monitoring */}
      {predictionChartData.length > 1 && (
        <div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            예측 vs 실제 (리밸런싱 기준)
          </p>

          {predictionMonitoring && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginBottom: 8,
            }}>
              <Metric
                label="예측 적중률"
                value={`${predictionMonitoring.hit_rate.toFixed(1)}%`}
                positive={getHitRateSignal(predictionMonitoring.hit_rate)}
                sub={`양호 ${MONITORING_THRESHOLDS.hitRateGood}% 이상`}
              />
              <Metric
                label="평균 예측 오차"
                value={`${predictionMonitoring.avg_abs_error_pct.toFixed(2)}%`}
                positive={getErrorSignal(predictionMonitoring.avg_abs_error_pct)}
                sub={`양호 ${MONITORING_THRESHOLDS.errorGood}% 이하`}
              />
              <Metric label="예측 포인트" value={`${predictionMonitoring.prediction_count}회`} positive={null} />
            </div>
          )}

          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 8, lineHeight: 1.5 }}>
            평가 기준은 월별 리밸런싱 기반 표본 수를 고려해 중립 구간을 두었습니다.
          </p>

          <div style={{
            background: "var(--bg-elevated)", borderRadius: "var(--radius-xl)",
            padding: "14px 8px 8px", border: "1px solid var(--border-subtle)",
          }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={predictionChartData} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => String(v).slice(5)}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}K`}
                  width={44}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<PredictionTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="실제 가격"
                  stroke="var(--bull)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="예측 가격"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.6 }}>
        <Icon name="warning" size={11} decorative /> 과거 수익률은 미래를 보장하지 않습니다 · 투자 결정은 본인 책임
      </p>
    </div>
  );
}


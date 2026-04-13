"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { clsx } from "clsx";
import type { BacktestResult, BacktestMetrics } from "@/types";

function MetricBadge({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean | null;
}) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p
        className={clsx(
          "mt-1 text-lg font-bold",
          good === true && "text-red-500",
          good === false && "text-blue-500",
          good === null && "text-gray-800"
        )}
      >
        {value}
      </p>
    </div>
  );
}

interface BacktestPanelProps {
  result: BacktestResult;
}

export function BacktestPanel({ result }: BacktestPanelProps) {
  const m = result.metrics;

  return (
    <div className="space-y-4">
      {/* 성과 지표 그리드 */}
      <div className="grid grid-cols-3 gap-2">
        <MetricBadge
          label="총 수익률"
          value={`${m.total_return >= 0 ? "+" : ""}${m.total_return.toFixed(1)}%`}
          good={m.total_return > 0}
        />
        <MetricBadge
          label="연간 수익률"
          value={`${m.annualized_return >= 0 ? "+" : ""}${m.annualized_return.toFixed(1)}%`}
          good={m.annualized_return > 0}
        />
        <MetricBadge
          label="초과 수익(α)"
          value={`${m.alpha >= 0 ? "+" : ""}${m.alpha.toFixed(1)}%`}
          good={m.alpha > 0}
        />
        <MetricBadge
          label="샤프 비율"
          value={m.sharpe_ratio.toFixed(2)}
          good={m.sharpe_ratio > 1 ? true : m.sharpe_ratio < 0 ? false : null}
        />
        <MetricBadge
          label="최대 낙폭"
          value={`${m.max_drawdown.toFixed(1)}%`}
          good={m.max_drawdown > -10 ? true : false}
        />
        <MetricBadge
          label="승률"
          value={`${m.win_rate.toFixed(1)}%`}
          good={m.win_rate > 55 ? true : m.win_rate < 45 ? false : null}
        />
        <MetricBadge label="칼마 비율" value={m.calmar_ratio.toFixed(2)} good={null} />
        <MetricBadge label="손익비" value={m.profit_factor.toFixed(2)} good={null} />
        <MetricBadge
          label="총 거래"
          value={`${m.total_trades}회`}
          good={null}
        />
      </div>

      {/* 수익 곡선 차트 */}
      {result.equity_curve?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-400">수익 곡선</p>
          <div className="rounded-2xl bg-gray-50 p-3">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={result.equity_curve}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) =>
                    `${(v / 10000).toFixed(0)}만`
                  }
                  width={50}
                />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number" ? `${v.toLocaleString("ko-KR")}원` : v
                  }
                  labelFormatter={(l) => `날짜: ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#equityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

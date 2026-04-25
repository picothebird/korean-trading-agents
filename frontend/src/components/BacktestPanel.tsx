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
import { Icon, Tooltip as InfoTooltip } from "@/components/ui";

interface MetricProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
  /** 지표 설명 — 주식 비전문가도 이해할 수 있도록. */
  hint?: string;
}

function Metric({ label, value, sub, positive, hint }: MetricProps) {
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
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
        {hint ? (
          <InfoTooltip content={hint} maxWidth={300}>
            <span style={{ borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>ℹ {label}</span>
          </InfoTooltip>
        ) : (
          label
        )}
      </p>
      <p style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</p>}
    </motion.div>
  );
}

interface BacktestPanelProps {
  result: BacktestResult;
  /** 어떤 전략으로 시뮬레이션했는지 — 라벨/설명 문구를 모드에 맞게 표시 */
  mode?: "agent" | "ma";
  /** 판단 주기(거래일) — 'AI 에이전트가 N일마다 분석' 안내에 사용 */
  decisionIntervalDays?: number;
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

export function BacktestPanel({ result, mode = "agent", decisionIntervalDays }: BacktestPanelProps) {
  const m = result.metrics;
  const isProfit = m.total_return > 0;
  const strategyName = mode === "agent" ? "AI 에이전트 전략" : "이동평균(MA) 규칙 전략";
  const strategyShort = mode === "agent" ? "AI 에이전트" : "MA 규칙";
  const strategyExplain =
    mode === "agent"
      ? `'분석' 탭에서 보던 그 9명의 AI 에이전트 팀이, 만약 과거 이 기간 동안 ${decisionIntervalDays ? `${decisionIntervalDays}거래일` : "정기적"}마다 같은 방식으로 회의를 열어 BUY/SELL/HOLD를 결정했다면 어떻게 됐을지 시뮬레이션한 결과예요. 즉, 사용자가 직접 전략을 만든 게 아니라 'AI 에이전트들의 판단 = 전략'으로 보고 과거 데이터로 돌려본 것입니다.`
      : "단기 이동평균선이 장기 이동평균선을 위로 돌파하면 매수, 아래로 깨면 매도하는 가장 고전적인 추세 추종 규칙으로 시뮬레이션한 결과입니다.";
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
      {/* '이 전략이 뭐냐?' 설명 — 사용자가 직접 만든 게 아님을 명확히 전달 */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--brand-subtle, rgba(99,102,241,0.08))",
          border: "1px solid var(--brand-border, rgba(99,102,241,0.25))",
          borderRadius: "var(--radius-lg)",
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name={mode === "agent" ? "robot" : "chart-bar"} size={14} decorative />
          여기서 말하는 '{strategyName}'이란?
        </p>
        <p>{strategyExplain}</p>
      </div>

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
        <strong>{strategyName}</strong>은 같은 기간 이 종목을 단순 보유만 했을 때 대비
        {" "}<strong style={{ color: m.alpha > 0 ? "var(--bull)" : "var(--bear)" }}>
          {m.alpha >= 0 ? "+" : ""}{m.alpha.toFixed(1)}%p
        </strong>{" "}
        더 {m.alpha >= 0 ? "높은" : "낮은"} 수익을 냈고, 가장 컸던 일시적 손실은
        {" "}<strong>{m.max_drawdown.toFixed(1)}%</strong>{" "}
        였어요. 승률 <strong>{m.win_rate.toFixed(1)}%</strong> · {m.total_trades}회 거래.
      </div>

      {/* 시뮬레이션 규칙 안내 */}
      <details
        style={{
          padding: "10px 14px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--text-primary)", fontSize: 12 }}>
          📖 이 시뮬레이션이 어떻게 돌아갈까요?
        </summary>
        <div style={{ marginTop: 8 }}>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li><strong>초기 자본</strong>: 1,000만원으로 시작합니다.</li>
            <li><strong>매수(BUY)</strong>: {strategyShort}이 매수 신호를 주면 현금 자원의 100%를 해당 종목으로 전환합니다 (수수료/호가 간격 반영).</li>
            <li><strong>매도(SELL)</strong>: 매도 신호 시 보유하는 총 주식을 전량 처분해 현금으로 돌아갑니다.</li>
            <li><strong>홀드(HOLD)</strong>: 아무 액션도 하지 않고 현재 상태를 유지합니다. 이미 매수한 상태에서 BUY가 다시 떨어져도 추가 매수하지 않고 계속 보유합니다 (신호 변화가 있을 때만 행동).</li>
            <li><strong>체결 지연</strong>: D일 신호는 실제 시장과 같이 D+1일 가격으로 체결됩니다.</li>
            <li><strong>벤치마크</strong>: 같은 기간 이 종목을 단순 사서 끝까지 보유(buy &amp; hold)했을 때의 수익률입니다. {strategyShort} 전략이 이것을 이겼으면 알파(α)가 양수.</li>
          </ul>
        </div>
      </details>

      {/* Headline KPIs (3 large) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Metric
          label="총 수익률"
          value={`${m.total_return >= 0 ? "+" : ""}${m.total_return.toFixed(1)}%`}
          positive={m.total_return > 0}
          hint="시뮬레이션 종료 시점의 평가금액이 초기 자본(1,000만원) 대비 몇 % 늘고 줄었는지. 수수료와 세금은 고려되지 않은 이론값입니다."
        />
        <Metric
          label="초과수익 α (알파)"
          value={`${m.alpha >= 0 ? "+" : ""}${m.alpha.toFixed(1)}%p`}
          positive={m.alpha > 0}
          sub="vs 단순보유(벤치마크)"
          hint={`이 ${strategyShort} 전략이 같은 기간 이 종목을 '사서 계속 보유'만 했을 때 대비 얼마나 더 벌었는지(퍼센트포인트 단위). 양수면 ${strategyShort}이 단순보유보다 높은 수익, 음수면 오히려 못 벌었다는 뜻. (α·알파는 투자 교과서의 표준 용어)`}
        />
        <Metric
          label="샤프 비율"
          value={m.sharpe_ratio.toFixed(2)}
          positive={m.sharpe_ratio > 1 ? true : m.sharpe_ratio < 0 ? false : null}
          sub="1.0 이상이면 우수"
          hint="수익을 변동성(위험)으로 나눈 값. 같은 수익이라도 장중 떨림이 클수록 샤프는 낮아집니다. 1은 괜찮음, 2 이상은 매우 우수."
        />
      </div>

      {/* Secondary metrics (6 small) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Metric
          label="연간 수익률"
          value={`${m.annualized_return >= 0 ? "+" : ""}${m.annualized_return.toFixed(1)}%`}
          positive={m.annualized_return > 0}
          hint="총 수익률을 1년 단위로 환산한 값. 기간이 6개월이면 2배, 2년이면 반으로 계산됩니다. 서로 다른 기간의 전략을 비교할 때 쓰입니다."
        />
        <Metric
          label="최대 낙폭 (MDD)"
          value={`${m.max_drawdown.toFixed(1)}%`}
          positive={m.max_drawdown > -10}
          sub="작을수록 안전"
          hint="시뮬레이션 중 평가금액의 최고점에서 최저점까지 일시적으로 얼마나 떨어졌는지. 임의의 순간 계좌에서 돈이 렌이어올 수 있는 수치입니다. -20% 이하는 권장할 만합니다."
        />
        <Metric
          label="승률"
          value={`${m.win_rate.toFixed(1)}%`}
          positive={m.win_rate > 55 ? true : m.win_rate < 45 ? false : null}
          hint="전체 거래 중 수익을 낸 거래의 비율. 단, 승률이 높다고 수익이 큰 건 아니에요(한 번의 큰 손실이 수십 번의 소액 수익을 날릴 수 있음). 손익비와 같이 보세요."
        />
        <Metric
          label="칼마 비율"
          value={m.calmar_ratio.toFixed(2)}
          positive={null}
          hint="연간 수익률 ÷ 최대낙폭. '일시적 고통 대비 얼마나 벌었니' 지표. 1 이상이면 양호, 3 이상이면 수퍼."
        />
        <Metric
          label="손익비"
          value={m.profit_factor.toFixed(2)}
          positive={m.profit_factor > 1.5 ? true : m.profit_factor < 1 ? false : null}
          hint="총 이익 ÷ 총 손실. 1보다 크면 돈을 벌었다는 의미이고, 2면 손실의 2배를 이익으로 거둡었다는 뜻입니다."
        />
        <Metric
          label="총 거래"
          value={`${m.total_trades}회`}
          positive={null}
          hint="시뮬레이션 동안 실제로 매수·매도한 횟수. 너무 적으면 트렌드에 딜을 수 있고, 너무 많으면 수수료와 세금이 많이 나갈 수 있어요."
        />
      </div>

      {/* Benchmark vs AI row */}
      {m.benchmark_return !== undefined && (
        <div style={{
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
          padding: "10px 14px", background: "var(--bg-elevated)",
          borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)",
        }}>
          <InfoTooltip
            content={`이 종목을 시작일에 사서 종료일까지 아무 거래 없이 그대로 보유(buy & hold)했을 때의 수익률. ${strategyShort} 전략이 이 단순 보유보다 돈을 잘 벌었는지 확인하는 기준선입니다.`}
            maxWidth={300}
          >
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", flex: 1, borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>
              ℹ 단순 보유(벤치마크) 수익률
            </span>
          </InfoTooltip>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {m.benchmark_return >= 0 ? "+" : ""}{m.benchmark_return.toFixed(1)}%
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            background: m.alpha > 0 ? "var(--success-subtle)" : "var(--error-subtle)",
            color: m.alpha > 0 ? "var(--success)" : "var(--error)",
          }}>
            {strategyShort}이 {m.alpha > 0 ? "+" : ""}{m.alpha.toFixed(1)}%p {m.alpha > 0 ? "더 벌었음" : "더 못 벌었음"}
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


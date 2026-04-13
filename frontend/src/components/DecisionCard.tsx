"use client";

import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import type { TradeDecision } from "@/types";

const ACTION_STYLE: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  BUY: {
    bg: "bg-red-50",
    text: "text-red-600",
    border: "border-red-200",
    label: "매수",
  },
  SELL: {
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-200",
    label: "매도",
  },
  HOLD: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
    label: "관망",
  },
};

interface DecisionCardProps {
  decision: TradeDecision | null;
}

export function DecisionCard({ decision }: DecisionCardProps) {
  if (!decision) return null;

  const style = ACTION_STYLE[decision.action] ?? ACTION_STYLE.HOLD;
  const confidencePct = Math.round(decision.confidence * 100);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={clsx(
          "rounded-3xl border-2 p-6",
          style.bg,
          style.border
        )}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">최종 결정</p>
            <div className="mt-1 flex items-center gap-3">
              <span
                className={clsx(
                  "text-4xl font-bold tracking-tight",
                  style.text
                )}
              >
                {style.label}
              </span>
              <span className="text-2xl font-bold text-gray-800">
                {decision.ticker}
              </span>
            </div>
          </div>

          {/* 신뢰도 원형 게이지 */}
          <div className="relative h-20 w-20">
            <svg
              className="h-20 w-20 -rotate-90 transform"
              viewBox="0 0 80 80"
            >
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
              />
              <motion.circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke={
                  decision.action === "BUY"
                    ? "#ef4444"
                    : decision.action === "SELL"
                    ? "#3b82f6"
                    : "#6b7280"
                }
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 32}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
                animate={{
                  strokeDashoffset:
                    2 * Math.PI * 32 * (1 - decision.confidence),
                }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <p className={clsx("text-lg font-bold", style.text)}>
                {confidencePct}%
              </p>
            </div>
          </div>
        </div>

        {/* 에이전트 투표 결과 */}
        {decision.agents_summary?.analyst_signals && (
          <div className="mt-4 flex gap-3">
            {Object.entries(decision.agents_summary.analyst_signals).map(
              ([action, count]) => (
                <div
                  key={action}
                  className="flex-1 rounded-2xl bg-white/70 px-3 py-2 text-center"
                >
                  <p className="text-xs text-gray-500">
                    {ACTION_STYLE[action]?.label ?? action}
                  </p>
                  <p className={clsx("text-xl font-bold", ACTION_STYLE[action]?.text)}>
                    {count}
                  </p>
                </div>
              )
            )}
          </div>
        )}

        {/* 결정 근거 */}
        <div className="mt-4 rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-medium text-gray-500">결정 근거</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {decision.reasoning}
          </p>
        </div>

        {/* 포지션 정보 */}
        {decision.agents_summary?.position_size_pct > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <p className="text-xs text-gray-400">비중</p>
              <p className="text-sm font-semibold text-gray-700">
                {decision.agents_summary.position_size_pct}%
              </p>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <p className="text-xs text-gray-400">리스크</p>
              <p className="text-sm font-semibold text-gray-700">
                {decision.agents_summary.risk_level}
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

"use client";

/**
 * StageTopLine — 무대 사이드바 최상단 한 줄 응답 (MS-S2).
 *
 * 분석 진행 중: "분석 진행 중 — N/9 완료, 약 M초 남음"
 * 분석 완료: "매수 73점 · 100만원 중 18만원 권장"
 */

import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought, TradeDecision } from "@/types";

interface StageTopLineProps {
  thoughts: AgentThought[];
  decision: TradeDecision | null;
  onClickHeadline?: () => void;
}

const SIGNAL_CFG: Record<string, { color: string; bg: string; label: string; dot: string }> = {
  BUY: { color: "var(--bull)", bg: "var(--bull-subtle)", label: "매수", dot: "var(--bull)" },
  SELL: { color: "var(--bear)", bg: "var(--bear-subtle)", label: "매도", dot: "var(--bear)" },
  HOLD: { color: "var(--hold)", bg: "var(--hold-subtle)", label: "관망", dot: "var(--hold)" },
};

/** 평균 thought 간격으로 남은 시간 추정 */
function estimateRemainingSeconds(thoughts: AgentThought[]): number | null {
  if (thoughts.length < 2) return null;
  const doneRoles = new Set(
    thoughts.filter((t) => t.status === "done").map((t) => t.role),
  );
  const remaining = 9 - doneRoles.size;
  if (remaining <= 0) return 0;
  // 최근 3개 thought의 평균 간격
  const last = thoughts.slice(-Math.min(thoughts.length, 6));
  const tStart = new Date(last[0].timestamp).getTime();
  const tEnd = new Date(last[last.length - 1].timestamp).getTime();
  if (tEnd <= tStart) return null;
  const avgMs = (tEnd - tStart) / Math.max(1, last.length - 1);
  return Math.round((avgMs * remaining) / 1000);
}

export function StageTopLine({ thoughts, decision, onClickHeadline }: StageTopLineProps) {
  const isFinal = !!decision;

  if (isFinal && decision) {
    const sigKey =
      decision.action === "BUY" || decision.action === "SELL" ? decision.action : "HOLD";
    const cfg = SIGNAL_CFG[sigKey];
    const score = Math.round(decision.confidence * 100);
    const sizePct = decision.agents_summary?.position_size_pct ?? 0;
    const wonPer1m = Math.round((1_000_000 * sizePct) / 100);
    const sizeLabel =
      sizePct > 0 ? `100만원 중 ${(wonPer1m / 10_000).toFixed(0)}만원 권장` : "권장 비중 0";
    return (
      <motion.button
        type="button"
        onClick={onClickHeadline}
        layout
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          textAlign: "left",
          background: cfg.bg,
          border: `1px solid ${cfg.color}`,
          borderRadius: "var(--stage-radius)",
          padding: "10px 12px",
          cursor: "pointer",
          width: "100%",
        }}
        aria-label={`${cfg.label} ${score}점, 클릭하면 회의록으로 이동`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              background: cfg.dot,
              borderRadius: "var(--stage-radius-sharp)",
            }}
          />
          <span
            className="stage-headline"
            style={{ fontSize: 22, color: cfg.color, fontVariantNumeric: "tabular-nums" }}
          >
            {cfg.label} {score}점
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {sizeLabel}
        </div>
        <div className="stage-label" style={{ marginTop: 2 }}>
          클릭 → 회의록 펼치기
        </div>
      </motion.button>
    );
  }

  // 진행 중 상태
  const doneRoles = new Set(thoughts.filter((t) => t.status === "done").map((t) => t.role));
  const doneCount = doneRoles.size;
  const remainingSec = estimateRemainingSeconds(thoughts);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="progress"
        layout
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "8px 4px 0",
        }}
      >
        <div className="stage-label">분석 진행 중</div>
        <div
          className="stage-headline"
          style={{ fontSize: 18, color: "var(--text-primary)" }}
        >
          {doneCount}<span style={{ color: "var(--text-tertiary)" }}>/9</span>{" "}
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
            에이전트 완료
          </span>
        </div>
        {remainingSec !== null && remainingSec > 0 && (
          <div className="stage-label" style={{ color: "var(--text-secondary)" }}>
            남은 시간 약 {remainingSec}초
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

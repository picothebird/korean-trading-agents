"use client";

/**
 * MeetingMinutes — 회의실(AgentStage) 안에서 분석 종료 시 보여주는 "닫는 카드".
 *
 * (분석 결과 본문은 분석 탭의 `AnalysisResult`로 일원화되었음.
 *  여기서는 라이브 무대가 끝났음을 알리고 본문 결과로 시선을 유도하는 역할만 함.)
 */

import { motion } from "framer-motion";
import type { TradeDecision } from "@/types";
import { Icon } from "@/components/ui";
import { useAgentStage, type StageMode } from "@/stores/useAgentStage";

interface MeetingMinutesProps {
  decision: TradeDecision;
  totalAgents?: number;
  mode: Exclude<StageMode, "live">;
  onTryPaper?: () => void;
}

const ACTION_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BUY: { label: "매수", color: "var(--bull)", bg: "var(--bull-subtle)", border: "var(--bull-border)" },
  SELL: { label: "매도", color: "var(--bear)", bg: "var(--bear-subtle)", border: "var(--bear-border)" },
  HOLD: { label: "관망", color: "var(--hold)", bg: "var(--hold-subtle)", border: "var(--border-default)" },
};

export function MeetingMinutes({ decision, onTryPaper }: MeetingMinutesProps) {
  const cfg = ACTION_CFG[decision.action] ?? ACTION_CFG.HOLD;
  const score = Math.round(decision.confidence * 100);
  const goLive = () => useAgentStage.getState().setMode("live", true);

  return (
    <motion.div
      role="region"
      aria-label="회의 종료"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 18px",
        background: "var(--bg-overlay)",
        border: `1px solid ${cfg.border}`,
        borderRadius: "var(--stage-radius-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            회의 종료
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{decision.ticker}</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            신뢰도 {score}%
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onTryPaper && (
            <button
              type="button"
              onClick={onTryPaper}
              style={{
                padding: "8px 14px",
                background: "var(--brand)",
                color: "var(--text-inverse)",
                border: "1px solid var(--brand)",
                borderRadius: "var(--stage-radius)",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="edit" size={13} decorative /> 모의 1주 시도</span>
            </button>
          )}
          <button
            type="button"
            onClick={goLive}
            style={{
              padding: "8px 14px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--stage-border)",
              borderRadius: "var(--stage-radius)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            라이브로 돌아가기
          </button>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
        9개 에이전트의 회의가 끝났어요.
        <b> 자세한 분석가 의견 · 강세/약세 토론 · 리스크 · GURU 정책</b>은
        화면 위쪽 <b>“상세 회의록”</b> 카드에서 펼쳐 볼 수 있습니다.
      </p>
    </motion.div>
  );
}

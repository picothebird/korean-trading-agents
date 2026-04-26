"use client";

/**
 * PipelineBar — 트레이딩 스페이스 헤더의 진행 표시 막대.
 *
 * 3개 단계(데이터 / 토론 / 결정) 각각의 진행률(완료 수 / 전체)을 시각화.
 * 기존 헤더의 "n/8 완료" / "DATA·DEBATE·DECISION" 배지 / "0/4" 카드를 대체.
 *
 * MS-A.A6 — docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-quater
 */

import { motion } from "framer-motion";
import type { AgentRole, AgentThought } from "@/types";
import {
  LAYER_ROLES,
  LAYER_SHORT,
  LAYER_LABEL,
} from "@/lib/agentLabels";

interface PipelineBarProps {
  thoughts: Map<AgentRole, AgentThought>;
  /** 컴팩트 모드(헤더용) */
  compact?: boolean;
}

const STAGE_COLOR = ["var(--brand)", "var(--warning)", "var(--success)"];

export function PipelineBar({ thoughts, compact = false }: PipelineBarProps) {
  const stages = LAYER_ROLES.map((roles, idx) => {
    const total = roles.length;
    const done = roles.filter((r) => thoughts.get(r)?.status === "done").length;
    const inProgress = roles.filter((r) => {
      const s = thoughts.get(r)?.status;
      return s && s !== "idle" && s !== "done";
    }).length;
    return { idx, total, done, inProgress, color: STAGE_COLOR[idx] };
  });

  if (compact) {
    return (
      <div
        role="progressbar"
        aria-label="에이전트 파이프라인 진행률"
        style={{ display: "flex", gap: 4, alignItems: "center" }}
      >
        {stages.map((s) => {
          const pct = s.total > 0 ? (s.done / s.total) * 100 : 0;
          const allDone = s.done === s.total;
          return (
            <div
              key={s.idx}
              title={`${LAYER_LABEL[s.idx]} · ${s.done}/${s.total}`}
              style={{
                width: 36,
                height: 4,
                borderRadius: 99,
                background: "var(--border-subtle)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <motion.div
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  height: "100%",
                  background: allDone ? "var(--success)" : s.color,
                  borderRadius: 99,
                }}
              />
              {s.inProgress > 0 && !allDone && (
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(90deg, transparent, ${s.color}55, transparent)`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {stages.map((s) => {
        const pct = s.total > 0 ? (s.done / s.total) * 100 : 0;
        const allDone = s.done === s.total;
        return (
          <div key={s.idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-tertiary)",
                width: 36,
                flexShrink: 0,
              }}
            >
              {LAYER_SHORT[s.idx]}
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 99,
                background: "var(--border-subtle)",
                overflow: "hidden",
              }}
            >
              <motion.div
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  height: "100%",
                  background: allDone ? "var(--success)" : s.color,
                  borderRadius: 99,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                fontVariantNumeric: "tabular-nums",
                color: "var(--text-secondary)",
                width: 32,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {s.done}/{s.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

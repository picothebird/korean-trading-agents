"use client";

/**
 * StageProgress — L1/L2/L3 단계별 진행률 (MS-S2).
 *
 * PipelineBar 흡수형. 단계별 활성/완료 도트 + 라벨.
 */

import { motion } from "framer-motion";
import type { AgentRole, AgentThought } from "@/types";
import { LAYER_ROLES, LAYER_LABEL } from "@/lib/agentLabels";

interface StageProgressProps {
  thoughts: AgentThought[];
}

interface LayerSummary {
  total: number;
  done: number;
  active: number;
}

function summarizeLayer(thoughts: AgentThought[], roles: AgentRole[]): LayerSummary {
  const last: Record<string, AgentThought> = {};
  for (const t of thoughts) {
    if (!roles.includes(t.role)) continue;
    last[t.role] = t;
  }
  let done = 0;
  let active = 0;
  for (const role of roles) {
    const t = last[role];
    if (!t) continue;
    if (t.status === "done") done++;
    else if (t.status !== "idle") active++;
  }
  return { total: roles.length, done, active };
}

export function StageProgress({ thoughts }: StageProgressProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      aria-label="단계별 진행률"
    >
      <div className="stage-label">진행률</div>
      {LAYER_ROLES.map((roles, i) => {
        const s = summarizeLayer(thoughts, roles);
        const isComplete = s.done === s.total;
        const isActive = s.active > 0;
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isComplete
                    ? "var(--success)"
                    : isActive
                    ? "var(--brand)"
                    : "var(--text-tertiary)",
                  letterSpacing: "-0.01em",
                }}
              >
                {LAYER_LABEL[i]}
              </span>
              <div style={{ display: "flex", gap: 3 }}>
                {Array.from({ length: s.total }).map((_, k) => {
                  const fillState = k < s.done ? "done" : k < s.done + s.active ? "active" : "idle";
                  const bg =
                    fillState === "done"
                      ? "var(--success)"
                      : fillState === "active"
                      ? "var(--brand)"
                      : "var(--bg-overlay)";
                  return (
                    <motion.span
                      key={k}
                      initial={false}
                      animate={
                        fillState === "active"
                          ? { opacity: [0.55, 1, 0.55] }
                          : { opacity: 1 }
                      }
                      transition={
                        fillState === "active"
                          ? { repeat: Infinity, duration: 1.6, ease: "easeInOut" }
                          : { duration: 0.18 }
                      }
                      style={{
                        width: 10,
                        height: 10,
                        background: bg,
                        border: "1px solid var(--stage-border)",
                        borderRadius: "var(--stage-radius-sharp)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <span
              className="stage-label"
              style={{
                color: isComplete ? "var(--success)" : "var(--text-tertiary)",
                fontVariantNumeric: "tabular-nums",
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

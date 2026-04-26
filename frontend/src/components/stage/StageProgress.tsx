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
  visibleRoles?: ReadonlyArray<AgentRole>;
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

export function StageProgress({ thoughts, visibleRoles }: StageProgressProps) {
  const visibleRoleSet = new Set<AgentRole>(visibleRoles ?? LAYER_ROLES.flat());
  const allLayers = LAYER_ROLES
    .map((roles, idx) => ({ idx, roles: roles.filter((role) => visibleRoleSet.has(role)) }))
    .filter((layer) => layer.roles.length > 0);

  // v3 polish: 동시에 진행 중(active)인 레이어만 노출. 모두 idle이면 첫 미완료
  // 레이어 1개만, 모두 done이면 마지막 레이어 1개만 노출.
  const layerSummaries = allLayers.map((layer) => ({
    layer,
    summary: summarizeLayer(thoughts, layer.roles),
  }));
  const activeLayers = layerSummaries.filter(
    (l) => l.summary.active > 0 || (l.summary.done > 0 && l.summary.done < l.summary.total),
  );
  const visibleLayers = (activeLayers.length > 0
    ? activeLayers
    : [
        layerSummaries.find((l) => l.summary.done < l.summary.total) ??
          layerSummaries[layerSummaries.length - 1],
      ]
  )
    .filter(Boolean)
    .map((l) => l!.layer);
  const allDone =
    layerSummaries.length > 0 &&
    layerSummaries.every((l) => l.summary.done === l.summary.total);

  if (allDone) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        opacity: 0.92,
      }}
      aria-label="단계별 진행률"
    >
      <div className="stage-label">진행률</div>
      {visibleLayers.map((layer) => {
        const s = summarizeLayer(thoughts, layer.roles);
        const isComplete = s.done === s.total;
        const isActive = s.active > 0;
        return (
          <div
            key={layer.idx}
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
                {LAYER_LABEL[layer.idx]}
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

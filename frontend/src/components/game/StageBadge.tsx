"use client";

/**
 * StageBadge — 캔버스 우측하단에 현재 진행 stage 표시.
 *
 * 규칙 (사용자 요청):
 *  - thoughts에서 가장 활발한 layer를 현재 stage로 표시.
 *  - 모두 done 이면 마지막 stage(3단계) 유지.
 *  - 모두 idle/빈 상태면 비표시.
 */

import { useMemo } from "react";
import type { AgentThought } from "@/types";
import { LAYER_ROLES, LAYER_SHORT } from "@/lib/agentLabels";

interface Props {
  thoughts: ReadonlyArray<AgentThought>;
}

function pickActiveStage(thoughts: ReadonlyArray<AgentThought>): number | null {
  if (thoughts.length === 0) return null;
  const last = new Map<string, AgentThought>();
  for (const t of thoughts) last.set(t.role, t);

  // layer별 (active, done, total)
  const summary = LAYER_ROLES.map((roles) => {
    let active = 0, done = 0;
    for (const role of roles) {
      const t = last.get(role);
      if (!t) continue;
      if (t.status === "done") done++;
      else if (t.status !== "idle") active++;
    }
    return { active, done, total: roles.length };
  });

  // 1) 진행 중인 layer 중 가장 마지막(=하위 stage 우선) 선택
  for (let i = summary.length - 1; i >= 0; i--) {
    if (summary[i].active > 0) return i;
  }
  // 2) 모두 done이면 마지막 stage 유지
  const allDone = summary.every((s) => s.done === s.total && s.total > 0);
  if (allDone) return LAYER_ROLES.length - 1;
  // 3) 일부만 done — 가장 진척된 layer
  let lastStarted = -1;
  for (let i = 0; i < summary.length; i++) {
    if (summary[i].done > 0 || summary[i].active > 0) lastStarted = i;
  }
  return lastStarted >= 0 ? lastStarted : null;
}

export function StageBadge({ thoughts }: Props) {
  const stage = useMemo(() => pickActiveStage(thoughts), [thoughts]);
  if (stage === null) return null;
  return (
    <div
      aria-label={`현재 진행 단계 ${LAYER_SHORT[stage]}`}
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 5,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: "rgba(28,31,38,0.88)",
        color: "#f6f7fa",
        borderRadius: 999,
        fontFamily: "Pretendard, -apple-system, system-ui, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.04em",
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#7dd3fc",
          boxShadow: "0 0 8px rgba(125,211,252,0.7)",
        }}
      />
      {LAYER_SHORT[stage]}
    </div>
  );
}

export default StageBadge;

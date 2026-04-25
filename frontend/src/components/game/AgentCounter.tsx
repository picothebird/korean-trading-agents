"use client";

/**
 * AgentCounter — 캔버스 좌상단 활성 에이전트 카운터
 *
 * thoughts 배열을 role별 마지막 status로 환원해 active/done/idle 개수 표시.
 * 활성 에이전트가 1명 이상이면 헤더에 펄싱 점.
 */

import { useMemo } from "react";
import type { AgentRole, AgentStatus, AgentThought } from "@/types";

interface Props {
  thoughts?: ReadonlyArray<AgentThought>;
}

const ALL_ROLES_COUNT = 9;
const ACTIVE: ReadonlyArray<AgentStatus> = [
  "thinking",
  "analyzing",
  "debating",
  "deciding",
];

export function AgentCounter({ thoughts }: Props) {
  const counts = useMemo(() => {
    const byRole: Partial<Record<AgentRole, AgentStatus>> = {};
    if (thoughts) {
      for (const t of thoughts) byRole[t.role] = t.status;
    }
    let active = 0;
    let done = 0;
    let idle = 0;
    for (const status of Object.values(byRole)) {
      if (!status) continue;
      if (ACTIVE.includes(status)) active++;
      else if (status === "done") done++;
      else idle++;
    }
    // thoughts에 등장하지 않은 나머지 역할은 idle
    const seen = Object.keys(byRole).length;
    idle += ALL_ROLES_COUNT - seen;
    return { active, done, idle };
  }, [thoughts]);

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        background: "rgba(255,255,255,0.92)",
        border: "1px solid var(--border-subtle, #d6d8dd)",
        borderRadius: 6,
        fontSize: 11,
        color: "#1c1f26",
        pointerEvents: "auto",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
      aria-label="에이전트 상태 카운터"
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 4,
          background: counts.active > 0 ? "#3182f6" : "#b8bcc6",
          animation: counts.active > 0 ? "agent-pulse 1.2s infinite" : "none",
        }}
      />
      <span style={{ fontWeight: 600 }}>활성 {counts.active}</span>
      <span style={{ color: "#5a5d66" }}>완료 {counts.done}</span>
      <span style={{ color: "#5a5d66" }}>대기 {counts.idle}</span>
      <style>{`@keyframes agent-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

export default AgentCounter;

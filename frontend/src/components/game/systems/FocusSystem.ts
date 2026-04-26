/**
 * FocusSystem — thoughts/decision을 카메라 포커스 이벤트로 변환
 * (v2 plan §C Phase 1).
 *
 * 정책:
 *  - decision 도착 → 모든 active actor를 감싸는 중심으로 fit 또는 가장 활발한
 *    role로 follow.
 *  - 새 thought가 도착하면 해당 role로 follow. wheel/drag 등 manual hold 중이면
 *    무시 (CameraSystem이 보장).
 *
 * 우선순위 (status):
 *   deciding(5) > debating(4) > analyzing(3) > thinking(2) > done(1) > idle(0)
 */

import type { AgentRole, AgentStatus, AgentThought } from "@/types";

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  deciding: 5,
  debating: 4,
  analyzing: 3,
  thinking: 2,
  done: 1,
  idle: 0,
};

export interface FocusTarget {
  role: AgentRole;
  status: AgentStatus;
  timestamp: string;
  priority: number;
}

/**
 * thoughts 배열에서 가장 우선순위가 높은 (status priority desc, timestamp desc)
 * 단일 타깃을 선택. tie-break은 timestamp 큰 쪽.
 */
export function pickFocusTarget(
  thoughts: ReadonlyArray<AgentThought>,
): FocusTarget | null {
  let best: FocusTarget | null = null;
  for (const t of thoughts) {
    const priority = STATUS_PRIORITY[t.status] ?? 0;
    if (
      !best ||
      priority > best.priority ||
      (priority === best.priority && t.timestamp > best.timestamp)
    ) {
      best = { role: t.role, status: t.status, timestamp: t.timestamp, priority };
    }
  }
  return best;
}

/**
 * 새 thought 시퀀스에서 "이전 시퀀스 대비 새로 도착한" 가장 높은 우선순위 항목.
 * 매번 fit zoom으로 돌아가지 않고 변경분만 포커스하는 데 사용.
 */
export function diffFocusTarget(
  prev: ReadonlyArray<AgentThought>,
  next: ReadonlyArray<AgentThought>,
): FocusTarget | null {
  const seen = new Set(prev.map((p) => `${p.role}@${p.timestamp}`));
  const additions = next.filter((t) => !seen.has(`${t.role}@${t.timestamp}`));
  return pickFocusTarget(additions);
}

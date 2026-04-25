/**
 * AgentTimeline — 모듈 타입.
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-quinquies (MS-B)
 */

import type { AgentRole, AgentStatus, AgentThought } from "@/types";

/** 줌 레벨 — 한 줄 밀도. */
export type TimelineZoom = "compact" | "comfortable" | "verbose";

/** 그룹 모드. */
export type TimelineGroupMode =
  | "none"      // 그룹 없음, 단일 시간순 리스트
  | "stage"     // 1단계/2단계/3단계
  | "agent";    // 에이전트별

/** 스토어 필터. */
export interface TimelineFilters {
  /** 검색어 (content + agent name) */
  query: string;
  /** 표시할 에이전트(빈 셋 = 전부) */
  roles: Set<AgentRole>;
  /** 표시할 상태(빈 셋 = 전부) */
  statuses: Set<AgentStatus>;
  /** 신호만 보기 */
  signalOnly: boolean;
}

/** 가상 리스트의 한 행. 그룹 헤더 또는 항목. */
export type TimelineRow =
  | { kind: "group"; key: string; label: string; count: number }
  | { kind: "entry"; key: string; thought: AgentThought; index: number };

export const DEFAULT_FILTERS: TimelineFilters = {
  query: "",
  roles: new Set<AgentRole>(),
  statuses: new Set<AgentStatus>(),
  signalOnly: false,
};

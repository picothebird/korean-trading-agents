/**
 * Agent UI labels — Single Source of Truth
 *
 * 모든 에이전트/상태/단계/신호의 한글 라벨은 이 파일에서만 정의됩니다.
 * 다른 컴포넌트는 직접 한글 문자열을 작성하지 말고 여기서 import 하세요.
 *
 * 백엔드 enum이 진실의 원천(SSOT)이고, 이 파일은 그 enum을 사용자 노출 라벨로 매핑합니다.
 *
 * 관련 문서: docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-quater (MS-A)
 */

import type { AgentRole, AgentStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────────
// Agent Role → 한글 표시 라벨
// ─────────────────────────────────────────────────────────────────────
export const AGENT_LABEL: Record<AgentRole, string> = {
  technical_analyst: "기술적 분석",
  fundamental_analyst: "펀더멘털 분석",
  sentiment_analyst: "감성 분석",
  macro_analyst: "거시 분석",
  bull_researcher: "강세 리서처",
  bear_researcher: "약세 리서처",
  risk_manager: "리스크 매니저",
  portfolio_manager: "포트폴리오 매니저",
  guru_agent: "구루 에이전트",
};

// ─────────────────────────────────────────────────────────────────────
// Agent Status → 한글 표시 라벨
// ─────────────────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "대기",
  thinking: "검토 중",
  analyzing: "분석 중",
  debating: "토론 중",
  deciding: "결정 중",
  done: "완료",
};

// 활동 중(=진행 표시 대상) 판정용
export const ACTIVE_STATUSES: AgentStatus[] = [
  "thinking",
  "analyzing",
  "debating",
  "deciding",
];

export function isActiveStatus(s: AgentStatus): boolean {
  return ACTIVE_STATUSES.includes(s);
}

// ─────────────────────────────────────────────────────────────────────
// Layer (1/2/3) — "단계" 표기
// ─────────────────────────────────────────────────────────────────────
export type LayerIndex = 0 | 1 | 2; // 0=L1, 1=L2, 2=L3

export const LAYER_ROLES: AgentRole[][] = [
  ["technical_analyst", "fundamental_analyst", "sentiment_analyst", "macro_analyst"],
  ["bull_researcher", "bear_researcher"],
  ["risk_manager", "portfolio_manager", "guru_agent"],
];

export const LAYER_LABEL: string[] = [
  "1단계 · 데이터 수집",
  "2단계 · 강세 vs 약세 토론",
  "3단계 · 리스크 & 결정",
];

export const LAYER_SHORT: string[] = ["1단계", "2단계", "3단계"];

export function layerOfRole(role: AgentRole): LayerIndex {
  for (let i = 0; i < LAYER_ROLES.length; i++) {
    if (LAYER_ROLES[i].includes(role)) return i as LayerIndex;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────
// Signal — 백엔드 metadata.signal 표준화
// 우선 backend가 채워주면 그걸 사용, 미설정 시 프론트 fallback heuristic
// ─────────────────────────────────────────────────────────────────────
export type AgentSignal = "bull" | "bear" | "risk" | "done";

export const SIGNAL_LABEL: Record<AgentSignal, { ko: string; cssVar: string }> = {
  bull: { ko: "매수 신호", cssVar: "var(--bull)" },
  bear: { ko: "매도 신호", cssVar: "var(--bear)" },
  risk: { ko: "리스크 경고", cssVar: "var(--warning)" },
  done: { ko: "결론", cssVar: "var(--success)" },
};

/**
 * thought.metadata.signal 추출 (백엔드 표준화 후 1차 사용)
 * 백엔드에서 미설정인 경우 null 반환 — 프론트는 이 경우 신호 배지 미표시
 */
export function extractSignal(metadata: Record<string, unknown> | undefined): AgentSignal | null {
  if (!metadata) return null;
  const raw = metadata.signal;
  if (raw === "bull" || raw === "bear" || raw === "risk" || raw === "done") {
    return raw;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Agent role → 표현 색상 (UI 일관성)
// 기존 AgentOffice의 dotColor 매핑을 SSOT로 옮김
// ─────────────────────────────────────────────────────────────────────
export const AGENT_COLOR: Record<AgentRole, string> = {
  technical_analyst: "#3182F6",
  fundamental_analyst: "#A855F7",
  sentiment_analyst: "#F5A623",
  macro_analyst: "#2FCA73",
  bull_researcher: "#F04452",
  bear_researcher: "#2B7EF5",
  risk_manager: "#F5A623",
  portfolio_manager: "#3182F6",
  guru_agent: "#7D6BFF",
};

// 모든 AgentRole 순회 (UI 카드/리스트용)
export const ALL_AGENT_ROLES: AgentRole[] = [
  "technical_analyst",
  "fundamental_analyst",
  "sentiment_analyst",
  "macro_analyst",
  "bull_researcher",
  "bear_researcher",
  "risk_manager",
  "portfolio_manager",
  "guru_agent",
];

export const TOTAL_AGENTS = ALL_AGENT_ROLES.length; // 9

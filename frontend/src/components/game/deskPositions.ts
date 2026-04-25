/**
 * deskPositions.ts — MS3 책상 좌표
 *
 * 9개 AgentRole에 대응하는 그리드 좌표. defaultOfficeMap의 30×20 안에서
 * 가운데 통로(col 14~15)를 비워두고 좌/우 영역에 배치.
 *
 * 좌표 단위: 타일 인덱스 (0~29 × 0~19). OfficeScene에서 픽셀 좌표로 변환.
 *
 * 그룹:
 *   분석가 4명 → 좌측 위쪽 (분석실)
 *   리서처 2명 → 우측 위쪽 (토론실)
 *   리스크/포트폴리오/구루 3명 → 우측 아래 (의사결정실)
 */

import type { AgentRole } from "@/types";

export interface DeskPosition {
  /** 0-based 타일 col */
  col: number;
  /** 0-based 타일 row */
  row: number;
}

export const DESK_POSITIONS: Record<AgentRole, DeskPosition> = {
  // 분석실 (좌측, 분석가 4명)
  technical_analyst: { col: 4, row: 4 },
  fundamental_analyst: { col: 9, row: 4 },
  sentiment_analyst: { col: 4, row: 8 },
  macro_analyst: { col: 9, row: 8 },

  // 토론실 (우측 상단, 리서처 2명)
  bull_researcher: { col: 19, row: 4 },
  bear_researcher: { col: 25, row: 4 },

  // 의사결정실 (우측 하단)
  risk_manager: { col: 19, row: 11 },
  portfolio_manager: { col: 22, row: 14 },
  guru_agent: { col: 25, row: 11 },
};

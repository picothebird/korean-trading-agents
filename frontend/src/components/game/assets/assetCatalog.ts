/**
 * Pixel Agents 캐릭터 스프라이트시트 카탈로그.
 * 출처: pixel-agents-ref (MIT, © 2026 Pablo De Lucca).
 *
 * 시트 구조 (`/game/pixel-agents/characters/char_N.png`):
 *   - 112 × 96 픽셀
 *   - 7 frames × 16px wide (가로) — 0:walk1, 1:walk2(=idle), 2:walk3, 3:type1, 4:type2, 5:read1, 6:read2
 *   - 3 direction rows × 32px tall (세로) — 0:down, 1:up, 2:right (left = right + flipX)
 *
 * 9 AgentRole → 6 char + 3 tint 변형 매핑 (v2 plan §A-3, §C Phase 3).
 * 동일 char에 다른 tint를 입혀 시각 다양성 확보.
 *
 * Phase 2에서는 자산 등록만, Phase 3의 `SpriteAgentActor`가 실제 사용.
 */

import type { AgentRole } from "@/types";

/** Phaser load.spritesheet 키 prefix. */
export const CHAR_KEY_PREFIX = "pa-char-";

export const CHAR_FRAME_WIDTH = 16;
export const CHAR_FRAME_HEIGHT = 32;
export const CHAR_SHEET_WIDTH = 112;
export const CHAR_SHEET_HEIGHT = 96;

/** 사용 가능한 char 인덱스 0~5. */
export const CHAR_IDS = [0, 1, 2, 3, 4, 5] as const;
export type CharId = (typeof CHAR_IDS)[number];

export interface CharSheetSpec {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
}

export const CHARACTER_SHEETS: CharSheetSpec[] = CHAR_IDS.map((id) => ({
  key: `${CHAR_KEY_PREFIX}${id}`,
  url: `/game/pixel-agents/characters/char_${id}.png`,
  frameWidth: CHAR_FRAME_WIDTH,
  frameHeight: CHAR_FRAME_HEIGHT,
}));

export const CHAR_FRAMES = {
  walk1: 0,
  idle: 1, // walk2 = 정자세
  walk3: 2,
  type1: 3,
  type2: 4,
  read1: 5,
  read2: 6,
} as const;

export type CharDir = "down" | "up" | "right" | "left";

/** dir → row + flipX 매핑. left는 right 행 + flipX. */
export function dirToRow(dir: CharDir): { row: 0 | 1 | 2; flipX: boolean } {
  switch (dir) {
    case "down":
      return { row: 0, flipX: false };
    case "up":
      return { row: 1, flipX: false };
    case "right":
      return { row: 2, flipX: false };
    case "left":
      return { row: 2, flipX: true };
  }
}

/** sheet의 (frameCol, row)를 0-based frame index로 변환. */
export function frameIndex(frameCol: number, row: 0 | 1 | 2): number {
  return row * 7 + frameCol;
}

/**
 * 9 AgentRole → 6 char + tint.
 * tint=0xffffff면 원본 색 그대로. 부족한 3 role(researcher.gov/strategist 등)에는
 * 채도 약간 다른 tint를 넣어 다양성 확보.
 */
export interface RoleSkin {
  charId: CharId;
  tint: number;
  /** 캐릭터 위에 표시할 작은 액세서리 색상 (Phase 5에서 사용). 옵션. */
  accentColor?: number;
}

export const ROLE_SKIN: Record<AgentRole, RoleSkin> = {
  technical_analyst: { charId: 0, tint: 0xffffff },
  fundamental_analyst: { charId: 1, tint: 0xffffff },
  sentiment_analyst: { charId: 2, tint: 0xffffff },
  macro_analyst: { charId: 3, tint: 0xffffff },
  bull_researcher: { charId: 4, tint: 0xffffff },
  bear_researcher: { charId: 4, tint: 0xff9aa0 }, // 같은 char 다른 톤
  risk_manager: { charId: 5, tint: 0xffffff },
  portfolio_manager: { charId: 0, tint: 0xc7d2fe }, // 살짝 푸른빛
  guru_agent: { charId: 2, tint: 0xfde68a }, // 살짝 황금빛
};

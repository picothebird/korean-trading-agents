/**
 * assets.ts — MS1 자산 카탈로그
 *
 * 키/경로/프레임 메타를 한 곳에 모아 OfficeScene/UI 양쪽에서 같은 식별자로 참조.
 * 경로는 `frontend/public/game/assets/`를 기준으로 하며, 런타임에는 `/game/assets/...`로 fetch.
 */

export const ASSET_BASE = "/game/assets/kenney" as const;

export type SpriteSheetSpec = {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
  cols: number;
  rows: number;
  total: number;
};

/** Kenney Tiny Town — 16×16 packed (margin/spacing 0). 12×11 = 132 frames. */
export const TINY_TOWN: SpriteSheetSpec = {
  key: "tiny-town",
  url: `${ASSET_BASE}/kenney_tiny-town/Tilemap/tilemap_packed.png`,
  frameWidth: 16,
  frameHeight: 16,
  margin: 0,
  spacing: 0,
  cols: 12,
  rows: 11,
  total: 132,
};

/** Kenney RPG Urban Pack — 16×16 packed. 27×18 = 486 frames. */
export const RPG_URBAN: SpriteSheetSpec = {
  key: "rpg-urban",
  url: `${ASSET_BASE}/kenney_rpg-urban-pack/Tilemap/tilemap_packed.png`,
  frameWidth: 16,
  frameHeight: 16,
  margin: 0,
  spacing: 0,
  cols: 27,
  rows: 18,
  total: 486,
};

/** 모든 스프라이트시트 (preload 루프용) */
export const ALL_SHEETS: ReadonlyArray<SpriteSheetSpec> = [TINY_TOWN, RPG_URBAN];

/**
 * Tiny Town 프레임 인덱스 헬퍼.
 * 좌상단(0,0)부터 행 우선. col + row * 12.
 */
export function ttFrame(col: number, row: number): number {
  return col + row * TINY_TOWN.cols;
}

/**
 * MS1 데모용 베이스 타일 ID들 (Tiny Town).
 * 추후 MS2에서 LDtk 맵 데이터가 정확한 인덱스를 제공.
 */
export const TT_TILES = {
  /** 풀밭 (밝은 녹색) */
  GRASS: ttFrame(0, 0),
  /** 흙길 (베이지) */
  DIRT: ttFrame(1, 0),
  /** 자갈/돌 */
  STONE: ttFrame(2, 0),
} as const;

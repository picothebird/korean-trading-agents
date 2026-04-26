/**
 * Furniture catalog — Pixel Agents 가구 자산 목록 (v2 plan §C Phase 4).
 *
 * pixel-agents-ref/webview-ui/public/assets/furniture/* 에서 큐레이션한 픽셀
 * 가구 sprite를 Phaser image 키로 등록한다. 그룹/회전/상태 머신은 단순화해
 * 각 sprite를 단일 키로 다룬다 (예: `DESK_FRONT`, `PC_FRONT_OFF`).
 *
 * 좌표/크기 단위: 16px 타일 (`MAP_TILE`). `width/height`는 픽셀(원본),
 * `footprintW/H`는 타일 수. 화면 표시는 `OfficeScene`의 `TILE_SCALE = 2`로
 * 자동 확대된다.
 *
 * 그림자/depth: backgroundTiles는 사용하지 않고 LayoutSystem이 row 기반 zY로
 * depth 부여 (DepthSystem 참조).
 */

export interface FurnitureSpec {
  /** Phaser 텍스처 키. file basename에서 확장자 제외. */
  id: string;
  /** /game/pixel-agents/furniture/{group}/{file} */
  url: string;
  /** 원본 픽셀 폭. */
  width: number;
  /** 원본 픽셀 높이. */
  height: number;
  /** 16px 타일 단위 가로 점유. */
  footprintW: number;
  /** 16px 타일 단위 세로 점유. */
  footprintH: number;
  /** 벽에 배치 가능한 가구 (벽 row=0,1 등에서 사용). */
  canPlaceOnWalls: boolean;
}

export const FURNITURE_CATALOG: ReadonlyArray<FurnitureSpec> = [
  // === Desks ===
  { id: "DESK_FRONT", url: "/game/pixel-agents/furniture/DESK/DESK_FRONT.png", width: 48, height: 32, footprintW: 3, footprintH: 2, canPlaceOnWalls: false },
  { id: "DESK_SIDE", url: "/game/pixel-agents/furniture/DESK/DESK_SIDE.png", width: 16, height: 64, footprintW: 1, footprintH: 4, canPlaceOnWalls: false },
  { id: "COFFEE_TABLE", url: "/game/pixel-agents/furniture/COFFEE_TABLE/COFFEE_TABLE.png", width: 32, height: 32, footprintW: 2, footprintH: 2, canPlaceOnWalls: false },
  // === PCs ===
  { id: "PC_FRONT_OFF", url: "/game/pixel-agents/furniture/PC/PC_FRONT_OFF.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "PC_FRONT_ON_1", url: "/game/pixel-agents/furniture/PC/PC_FRONT_ON_1.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "PC_FRONT_ON_2", url: "/game/pixel-agents/furniture/PC/PC_FRONT_ON_2.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "PC_FRONT_ON_3", url: "/game/pixel-agents/furniture/PC/PC_FRONT_ON_3.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "PC_SIDE", url: "/game/pixel-agents/furniture/PC/PC_SIDE.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "PC_BACK", url: "/game/pixel-agents/furniture/PC/PC_BACK.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  // === Chairs ===
  { id: "WOODEN_CHAIR_FRONT", url: "/game/pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "WOODEN_CHAIR_BACK", url: "/game/pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "WOODEN_CHAIR_SIDE", url: "/game/pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "CUSHIONED_BENCH", url: "/game/pixel-agents/furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png", width: 16, height: 16, footprintW: 1, footprintH: 1, canPlaceOnWalls: false },
  { id: "SOFA_FRONT", url: "/game/pixel-agents/furniture/SOFA/SOFA_FRONT.png", width: 32, height: 16, footprintW: 2, footprintH: 1, canPlaceOnWalls: false },
  { id: "SOFA_SIDE", url: "/game/pixel-agents/furniture/SOFA/SOFA_SIDE.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  // === Wall ===
  { id: "WHITEBOARD", url: "/game/pixel-agents/furniture/WHITEBOARD/WHITEBOARD.png", width: 32, height: 32, footprintW: 2, footprintH: 2, canPlaceOnWalls: true },
  { id: "BOOKSHELF", url: "/game/pixel-agents/furniture/BOOKSHELF/BOOKSHELF.png", width: 32, height: 16, footprintW: 2, footprintH: 1, canPlaceOnWalls: true },
  { id: "DOUBLE_BOOKSHELF", url: "/game/pixel-agents/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png", width: 32, height: 32, footprintW: 2, footprintH: 2, canPlaceOnWalls: true },
  { id: "CLOCK", url: "/game/pixel-agents/furniture/CLOCK/CLOCK.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: true },
  { id: "HANGING_PLANT", url: "/game/pixel-agents/furniture/HANGING_PLANT/HANGING_PLANT.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: true },
  // === Decor ===
  { id: "PLANT", url: "/game/pixel-agents/furniture/PLANT/PLANT.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "LARGE_PLANT", url: "/game/pixel-agents/furniture/LARGE_PLANT/LARGE_PLANT.png", width: 32, height: 48, footprintW: 2, footprintH: 3, canPlaceOnWalls: false },
  { id: "CACTUS", url: "/game/pixel-agents/furniture/CACTUS/CACTUS.png", width: 16, height: 32, footprintW: 1, footprintH: 2, canPlaceOnWalls: false },
  { id: "BIN", url: "/game/pixel-agents/furniture/BIN/BIN.png", width: 16, height: 16, footprintW: 1, footprintH: 1, canPlaceOnWalls: false },
];

export const FURNITURE_BY_ID: Readonly<Record<string, FurnitureSpec>> =
  Object.fromEntries(FURNITURE_CATALOG.map((f) => [f.id, f]));

// === Floors / walls ===
export interface FloorSpec {
  id: string;
  url: string;
}

export const FLOOR_CATALOG: ReadonlyArray<FloorSpec> = [
  { id: "floor_0", url: "/game/pixel-agents/floors/floor_0.png" }, // 기본 마루
  { id: "floor_1", url: "/game/pixel-agents/floors/floor_1.png" }, // 카펫
  // === Area rugs (16x16 base tile, 반복용) ===
  { id: "rug_warm",  url: "/game/pixel-agents/floors/rug_warm.png"  }, // 분석가실 — 따뜻한 우드
  { id: "rug_cool",  url: "/game/pixel-agents/floors/rug_cool.png"  }, // 토론장 — 회의실 청회색
  { id: "rug_mint",  url: "/game/pixel-agents/floors/rug_mint.png"  }, // 결정실 — 민트 카펫
  { id: "rug_royal", url: "/game/pixel-agents/floors/rug_royal.png" }, // 회장실 — 와인 럭셔리
];

export const WALL_CATALOG: ReadonlyArray<FloorSpec> = [
  { id: "wall_0", url: "/game/pixel-agents/walls/wall_0.png" },
];

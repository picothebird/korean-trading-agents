/**
 * defaultOfficeMap.ts — MS2 임시 디폴트 오피스 맵 (LDtk 도입 전 자리표시자)
 *
 * 30×20 그리드. 단일 레이어. Tiny Town 프레임 인덱스로 작성.
 *
 * @deprecated v2 plan §C Phase 4부터 `layout/tradingOfficePreset.ts`의
 *   `TRADING_OFFICE_LAYOUT` (ktt-office-layout@2)이 SSOT. 이 파일은 v1 grid
 *   폴백 + Minimap 타일 시각화 호환용으로만 잔존. 새 코드는 layout v2 사용.
 *
 * 좌표계: [row][col]. 0,0 = 좌상단.
 */

import { ttFrame } from "./assets";

export const MAP_COLS = 30;
export const MAP_ROWS = 20;
export const MAP_TILE = 16;

/** -1 = 빈 칸 (렌더하지 않음) */
export type TileIndex = number;

/** Tiny Town 프레임 약어 */
const FLOOR = ttFrame(1, 0); // 베이지 흙길 (실내 마루 대용)
const WALL_TOP = ttFrame(3, 3); // 빨간 지붕 좌측 (외벽 위)
const WALL_MID = ttFrame(4, 3); // 빨간 지붕 중앙
const WALL_BOT = ttFrame(0, 4); // 벽 하부
const DOOR = ttFrame(5, 5); // 문(흰색)
const PATH_DARK = ttFrame(2, 0); // 자갈 — 중앙 통로

/**
 * 30×20 디폴트 오피스 — 외벽 + 가운데 통로 + 좌우 데스크 영역 자리표시.
 * 가구·캐릭터는 별도 레이어(MS3·MS7)에서 추가됨.
 */
function buildLayout(): TileIndex[][] {
  const grid: TileIndex[][] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const row: TileIndex[] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      // 외벽
      if (r === 0) {
        row.push(WALL_TOP);
        continue;
      }
      if (r === 1) {
        row.push(WALL_MID);
        continue;
      }
      if (r === MAP_ROWS - 1) {
        row.push(WALL_BOT);
        continue;
      }
      if (c === 0 || c === MAP_COLS - 1) {
        row.push(WALL_BOT);
        continue;
      }

      // 가운데 통로 (col 14~15)
      if (c === 14 || c === 15) {
        row.push(PATH_DARK);
        continue;
      }

      // 그 외 = 마루
      row.push(FLOOR);
    }
    grid.push(row);
  }

  // 정문 (남쪽 가운데)
  grid[MAP_ROWS - 1][14] = DOOR;
  grid[MAP_ROWS - 1][15] = DOOR;

  return grid;
}

export const DEFAULT_OFFICE_LAYOUT: ReadonlyArray<ReadonlyArray<TileIndex>> =
  buildLayout();

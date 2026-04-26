/**
 * DepthSystem — z-order 계산 (v2 plan §C Phase 4, B-7).
 *
 * 등장 객체의 row(=Y in tile units)를 기반으로 depth를 부여해 "위쪽이 더 멀리"
 * 보이도록 한다. 동일 row면 가구 → 캐릭터 순.
 *
 *   depth = ENTITY_BASE + row * 10 + offset
 *
 * 라벨/말풍선은 항상 BUBBLE/LABEL depth (DEPTH 상수).
 */

import { DEPTH } from "./depth";

const ROW_FACTOR = 10;

export function depthForEntity(row: number, offset = 0): number {
  return DEPTH.ENTITY_BASE + Math.max(0, row) * ROW_FACTOR + offset;
}

export function depthForFloor(): number {
  return DEPTH.FLOOR;
}

export function depthForWall(row: number): number {
  // 벽은 row 기준 + WALL_BACK base. 캐릭터 뒤로 그려짐.
  return DEPTH.WALL_BACK + Math.max(0, row);
}

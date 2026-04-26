/**
 * Office layout v2 — `ktt-office-layout@2` 스키마 (v2 plan §C Phase 4).
 *
 * 기존 `ktt-office-map@1` (mapLoader.ts)는 단일 grid + 폴백 도형 책상을 가정한
 * 미니멀 스키마. v2는 floor 변형/벽/가구/좌석/존을 SSOT로 표현한다.
 *
 * 좌표 단위는 16px 타일 (`MAP_TILE`). 실제 화면은 `TILE_SCALE=2`로 32px 환산.
 *
 * 스키마:
 *   floors: 0=floor_0, 1=floor_1, -1=void(배경 노출). 길이 = cols*rows.
 *   walls: 같은 길이의 boolean 배열 (1=벽).
 *   furniture: 가구 인스턴스 (id, col, row, optional flipX).
 *   seats: AgentRole → (col, row) 책상 좌석 중심.
 *   zones: 룸 구획 (이름, 색, 좌상/우하 코너).
 */

import type { AgentRole } from "@/types";

export const OFFICE_LAYOUT_VERSION = "ktt-office-layout@2" as const;

export interface OfficeLayoutV2 {
  schema: typeof OFFICE_LAYOUT_VERSION;
  cols: number;
  rows: number;
  /** length = cols*rows. -1 = void, 그 외는 FLOOR_CATALOG index. */
  floors: ReadonlyArray<number>;
  /** length = cols*rows. true = 벽 sprite. */
  walls: ReadonlyArray<boolean>;
  furniture: ReadonlyArray<LayoutFurniture>;
  seats: Readonly<Record<AgentRole, LayoutSeat>>;
  zones: ReadonlyArray<LayoutZone>;
}

export interface LayoutFurniture {
  /** FURNITURE_CATALOG.id */
  type: string;
  col: number;
  row: number;
  flipX?: boolean;
  /** 이 가구의 클릭 가능한 인터랙션 라벨(옵션). */
  label?: string;
}

export interface LayoutSeat {
  col: number;
  row: number;
  /** 좌석 라벨 (UI 표시용). */
  label?: string;
}

export interface LayoutZone {
  name: string;
  /** 0xRRGGBB. */
  color: number;
  col0: number;
  row0: number;
  col1: number;
  row1: number;
  /** 옵션: zone 안에 깔리는 area rug. tileSprite로 16x16 텍스처 반복. */
  rug?: LayoutRug;
}

export interface LayoutRug {
  /** FLOOR_CATALOG.id (예: rug_warm). */
  texture: string;
  /** 좌상단 col (tile). */
  col: number;
  /** 좌상단 row (tile). */
  row: number;
  /** rug 가로 tile 수. */
  cols: number;
  /** rug 세로 tile 수. */
  rows: number;
}

/** 좌상단 (0,0)에서 cell index 계산. */
export function cellIndex(cols: number, col: number, row: number): number {
  return row * cols + col;
}

/** 좌석을 monomial cell 키로 변환. */
export function seatKey(seat: LayoutSeat): string {
  return `${seat.col},${seat.row}`;
}

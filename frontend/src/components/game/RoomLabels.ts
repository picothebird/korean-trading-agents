/**
 * RoomLabels.ts — MS시각적 룸 구획
 *
 * 30×20 디폴트 오피스에서 9개 책상이 3개 그룹으로 클러스터됨:
 *   분석실 (좌측)   — technical/fundamental/sentiment/macro 4명
 *   토론실 (우상단) — bull/bear 2명
 *   의사결정실 (우하단) — risk/portfolio/guru 3명
 *
 * 각 그룹 상단에 룸 이름 + 반투명 영역 박스를 그려 시각적 구획.
 * Phaser scrollFactor 1 (맵과 함께 이동). depth는 디오라마 위(−1 미만), 캐릭터 아래.
 */

import Phaser from "phaser";

const TILE_SCALE = 2;
const SCREEN_TILE = 16 * TILE_SCALE;

export interface RoomZone {
  name: string;
  /** 그리드 좌표 (col, row) inclusive 범위 */
  col0: number;
  row0: number;
  col1: number;
  row1: number;
  /** 라벨 색상 (hex) */
  color: number;
}

export const ROOM_ZONES: ReadonlyArray<RoomZone> = [
  { name: "분석실", col0: 2, row0: 2, col1: 12, row1: 10, color: 0x3182f6 },
  { name: "토론실", col0: 17, row0: 2, col1: 27, row1: 7, color: 0xf04452 },
  {
    name: "의사결정실",
    col0: 17,
    row0: 9,
    col1: 27,
    row1: 17,
    color: 0xa855f7,
  },
];

export interface RoomLabelsHandle {
  destroy(): void;
}

export function createRoomLabels(scene: Phaser.Scene): RoomLabelsHandle {
  const objects: Phaser.GameObjects.GameObject[] = [];

  for (const zone of ROOM_ZONES) {
    const x0 = zone.col0 * SCREEN_TILE;
    const y0 = zone.row0 * SCREEN_TILE;
    const w = (zone.col1 - zone.col0 + 1) * SCREEN_TILE;
    const h = (zone.row1 - zone.row0 + 1) * SCREEN_TILE;

    // 영역 박스 (반투명 fill + 1px outline)
    const box = scene.add
      .rectangle(x0 + w / 2, y0 + h / 2, w, h, zone.color, 0.06)
      .setStrokeStyle(1, zone.color, 0.4);
    objects.push(box);

    // 룸 이름 라벨 (좌상단 안쪽)
    const labelBg = scene.add
      .rectangle(x0 + 6, y0 + 6, 70, 18, zone.color, 0.92)
      .setOrigin(0, 0);
    objects.push(labelBg);
    const label = scene.add.text(x0 + 8, y0 + 7, zone.name, {
      fontFamily: "Pretendard, system-ui, sans-serif",
      fontSize: "11px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    objects.push(label);
  }

  return {
    destroy() {
      for (const obj of objects) obj.destroy();
    },
  };
}

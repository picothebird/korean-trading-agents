/**
 * LayoutSystem — OfficeLayoutV2를 Phaser scene에 그린다 (v2 plan §C Phase 4, v3 polish).
 *
 * v3 변경:
 *   - 바닥/벽 sprite 사용 안 함 → 깔끔한 단색 rectangle.
 *     (pixel-agents floor sprite의 어두운 seam 라인이 시야를 어지럽혀 제거)
 *   - 룸별 톤(zone color)을 매우 옅게 적용해 자연스러운 영역 구분.
 *   - 격자 라인 일체 제거. 외곽/내벽은 진한 회색 rectangle.
 *   - 룸 nameplate (방 이름판) 을 룸 좌상에 in-world로 배치 — 외부 floating 라벨 제거.
 *   - 가구 sprite는 그대로 유지.
 */

import type Phaser from "phaser";
import { FURNITURE_BY_ID } from "../assets/furnitureCatalog";
import {
  cellIndex,
  type OfficeLayoutV2,
  type LayoutZone,
} from "../layout/OfficeLayoutTypes";
import { depthForEntity, depthForFloor, depthForWall } from "./DepthSystem";

const SOURCE_TILE = 16;

/** 룸 바닥 톤(매우 옅게). v3에서 미사용 — DOM nameplate로 대체됨. 후방 호환 export. */
function tintFloor(zoneColor: number): number {
  const r = (zoneColor >> 16) & 0xff;
  const g = (zoneColor >> 8) & 0xff;
  const b = zoneColor & 0xff;
  const mix = (v: number) => Math.round(v * 0.08 + 246 * 0.92);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}
void tintFloor;

const DEFAULT_FLOOR = 0xf2f3f7;
const WALL_COLOR = 0x3d4250;

/** 0xRRGGBB 색을 amount(0~1)만큼 어둡게. */
function darken(color: number, amount: number): number {
  const r = Math.max(0, Math.round(((color >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((color >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((color & 0xff) * (1 - amount)));
  return (r << 16) | (g << 8) | b;
}

export interface LayoutRenderHandle {
  destroy(): void;
}

export interface LayoutRenderOptions {
  tileScale: number;
  container?: Phaser.GameObjects.Container;
  /** 룸 nameplate를 in-world로 그릴지. 기본 true. */
  drawNameplates?: boolean;
}

/** 셀 (col,row)이 zones 중 어느 zone에 속하는지. v3 미사용 — 후방 호환. */
function findZone(
  zones: ReadonlyArray<LayoutZone>,
  col: number,
  row: number,
): LayoutZone | null {
  for (const z of zones) {
    if (col >= z.col0 && col <= z.col1 && row >= z.row0 && row <= z.row1) return z;
  }
  return null;
}
void findZone;

export function renderLayout(
  scene: Phaser.Scene,
  layout: OfficeLayoutV2,
  opts: LayoutRenderOptions,
): LayoutRenderHandle {
  const tilePx = SOURCE_TILE * opts.tileScale;
  const created: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
    created.push(obj);
    if (opts.container) opts.container.add(obj);
    return obj;
  };

  // === 1. 바닥 — v3.2: zone 별 색상으로 룸 구분.
  // 벽 sprite 없이 바닥 톤만으로 시각적 구획. zone 영역에 zone.color, 그 외엔 DEFAULT_FLOOR.
  // 각 zone 위에 매우 옅은 가로 plank seam 라인을 깔아 단조로움 제거.
  {
    const totalW = layout.cols * tilePx;
    const totalH = layout.rows * tilePx;
    // 베이스 fallback (zone 미지정 영역)
    const base = scene.add.rectangle(
      totalW / 2,
      totalH / 2,
      totalW,
      totalH,
      DEFAULT_FLOOR,
      1,
    );
    base.setDepth(depthForFloor());
    add(base);

    // zone별 컬러 바닥
    for (const z of layout.zones) {
      const w = (z.col1 - z.col0 + 1) * tilePx;
      const h = (z.row1 - z.row0 + 1) * tilePx;
      const cx = z.col0 * tilePx + w / 2;
      const cy = z.row0 * tilePx + h / 2;
      const zoneFloor = scene.add.rectangle(cx, cy, w, h, z.color, 1);
      zoneFloor.setDepth(depthForFloor() + 0.1);
      add(zoneFloor);

      // 매 row 가로 seam 라인 (매우 연하게) — plank 결 시뮬레이션
      const seamColor = darken(z.color, 0.06);
      for (let r = z.row0 + 1; r <= z.row1; r++) {
        const seam = scene.add.rectangle(cx, r * tilePx, w, 1, seamColor, 0.5);
        seam.setDepth(depthForFloor() + 0.2);
        add(seam);
      }

      // 짝수 row 미세 톤 변화 band (plank 폭 2 row)
      const bandColor = darken(z.color, 0.04);
      for (let r = z.row0; r <= z.row1; r += 2) {
        const band = scene.add.rectangle(
          cx,
          r * tilePx + tilePx / 2,
          w,
          tilePx,
          bandColor,
          0.5,
        );
        band.setDepth(depthForFloor() + 0.15);
        add(band);
      }

      // zone 경계 — 옅은 구획선 (좌우 인접 zone 사이만)
      // 우측 경계
      if (z.col1 < layout.cols - 1) {
        const sep = scene.add.rectangle(
          (z.col1 + 1) * tilePx,
          cy,
          2,
          h,
          0xb8bcc6,
          0.35,
        );
        sep.setDepth(depthForFloor() + 0.3);
        add(sep);
      }
      // 하단 경계
      if (z.row1 < layout.rows - 1) {
        const sep = scene.add.rectangle(
          cx,
          (z.row1 + 1) * tilePx,
          w,
          2,
          0xb8bcc6,
          0.35,
        );
        sep.setDepth(depthForFloor() + 0.3);
        add(sep);
      }

      // === Area rug — 16x16 텍스처를 N×M tile 영역에 tileSprite로 깔기 ===
      if (z.rug && scene.textures.exists(z.rug.texture)) {
        const rug = z.rug;
        const rx = rug.col * tilePx;
        const ry = rug.row * tilePx;
        const rw = rug.cols * tilePx;
        const rh = rug.rows * tilePx;
        const rugSprite = scene.add.tileSprite(
          rx,
          ry,
          rw,
          rh,
          rug.texture,
        );
        rugSprite.setOrigin(0, 0);
        rugSprite.setTileScale(opts.tileScale, opts.tileScale);
        // 바닥 위, 가구 아래
        rugSprite.setDepth(depthForFloor() + 0.5);
        add(rugSprite);
      }
    }
  }

  // (구버전: zone별 색 floor + 복도 fallback 루프 제거됨)

  // === 2. 벽 (얇은 라인) ===
  // 타일 사이즈의 30%로 얇게 그리고, 이웃한 벽 세달을 보고 수평/수직 방향으로
  // rectangle 폭을 조정 (수평 벽은 가로 길게, 수직 벽은 세로 길게).
  const wallThickness = Math.max(2, Math.round(tilePx * 0.3));
  const isWall = (c: number, r: number) => {
    if (c < 0 || c >= layout.cols || r < 0 || r >= layout.rows) return false;
    return layout.walls[cellIndex(layout.cols, c, r)];
  };
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (!isWall(c, r)) continue;
      const hasH = isWall(c - 1, r) || isWall(c + 1, r); // 수평 연결
      const hasV = isWall(c, r - 1) || isWall(c, r + 1); // 수직 연결
      // 세그먼트 크기 결정: 교차점은 양방향 종숨 두께.
      const w = hasH || (!hasH && !hasV) ? tilePx : wallThickness;
      const h = hasV || (!hasH && !hasV) ? tilePx : wallThickness;
      const rect = scene.add.rectangle(
        c * tilePx + tilePx / 2,
        r * tilePx + tilePx / 2,
        w,
        h,
        WALL_COLOR,
        1,
      );
      rect.setDepth(depthForWall(r));
      add(rect);
    }
  }

  // === 3. 룸 nameplate — v3: Phaser text 제거. DOM overlay에서 렌더.
  // (사용자 피드백: 색박스 표시 제거 + 폰트 깨짐 → DOM에서 처리)

  // === 4. 가구 sprite ===
  for (const item of layout.furniture) {
    const spec = FURNITURE_BY_ID[item.type];
    if (!spec) continue;
    if (!scene.textures.exists(spec.id)) continue;
    const screenW = spec.width * opts.tileScale;
    const screenH = spec.height * opts.tileScale;
    const x = item.col * tilePx + screenW / 2;
    const y = item.row * tilePx + screenH / 2;
    const sprite = scene.add.image(x, y, spec.id);
    sprite.setScale(opts.tileScale);
    if (item.flipX) sprite.setFlipX(true);
    const baseRow = item.row + (spec.footprintH - 1);
    sprite.setDepth(depthForEntity(baseRow, -1));
    add(sprite);
  }

  return {
    destroy() {
      for (const obj of created) obj.destroy();
      created.length = 0;
    },
  };
}

/**
 * 레거시 호환 stub — v3에서는 zone overlay를 별도로 그리지 않음.
 * 호출자가 destroy()만 호출해도 안전하게 동작.
 */
export function renderZoneOverlays(
  _scene: Phaser.Scene,
  _zones: ReadonlyArray<LayoutZone>,
  _tilePx: number,
  _alpha = 0.06,
): LayoutRenderHandle {
  return { destroy() {} };
}

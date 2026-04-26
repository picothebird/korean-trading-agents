/**
 * WorldMetrics — 월드 크기 SSOT (v2 plan §C Phase 1, B-1 회피).
 *
 * OfficeScene이 externalMap 또는 fallback 상수에서 cols/rows를 읽고 픽셀 단위
 * 월드 크기를 도출. getCameraInfo, centerCameraOnMap, FocusSystem 모두 본 함수만
 * 호출하도록 단일화한다.
 *
 * 입력:
 *  - externalMap: { cols, rows } | null  (null이면 fallback)
 *  - fallback: 디폴트 30×20
 *  - tile px (`SCREEN_TILE = MAP_TILE * TILE_SCALE`)
 *
 * 출력:
 *  - cols, rows
 *  - tilePx (한 칸 픽셀)
 *  - worldWidth = cols * tilePx
 *  - worldHeight = rows * tilePx
 *  - centerX, centerY = 월드 중앙
 */

export interface WorldMetricsInput {
  externalMap: { cols?: number; rows?: number } | null;
  fallbackCols: number;
  fallbackRows: number;
  tilePx: number;
}

export interface WorldMetrics {
  cols: number;
  rows: number;
  tilePx: number;
  worldWidth: number;
  worldHeight: number;
  centerX: number;
  centerY: number;
}

const MIN_DIM = 4;

export function getWorldMetrics(input: WorldMetricsInput): WorldMetrics {
  const cols = clamp(
    input.externalMap?.cols ?? input.fallbackCols,
    MIN_DIM,
    input.fallbackCols * 4,
  );
  const rows = clamp(
    input.externalMap?.rows ?? input.fallbackRows,
    MIN_DIM,
    input.fallbackRows * 4,
  );
  const tilePx = input.tilePx;
  const worldWidth = cols * tilePx;
  const worldHeight = rows * tilePx;
  return {
    cols,
    rows,
    tilePx,
    worldWidth,
    worldHeight,
    centerX: worldWidth / 2,
    centerY: worldHeight / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * 카메라가 월드 전체를 화면에 담도록 하는 줌 계산.
 * 화면 폭/높이 중 더 빡빡한 쪽을 기준으로 결정. 1.0 이상은 1.0으로 클램프
 * (월드가 화면보다 작아 확대할 필요는 없음).
 */
export function computeFitZoom(
  metrics: WorldMetrics,
  viewWidth: number,
  viewHeight: number,
  options?: { padding?: number; max?: number; min?: number },
): number {
  const padding = options?.padding ?? 16;
  const max = options?.max ?? 1;
  const min = options?.min ?? 0.25;
  if (viewWidth <= 0 || viewHeight <= 0) return 1;
  const zx = (viewWidth - padding * 2) / metrics.worldWidth;
  const zy = (viewHeight - padding * 2) / metrics.worldHeight;
  const z = Math.min(zx, zy);
  if (!Number.isFinite(z) || z <= 0) return 1;
  return Math.min(max, Math.max(min, Math.round(z * 100) / 100));
}

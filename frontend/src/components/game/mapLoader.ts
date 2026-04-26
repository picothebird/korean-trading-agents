/**
 * mapLoader.ts — MS9 외부 맵 데이터 로더
 *
 * `public/game/maps/office.json`에서 30×20 타일 그리드를 fetch.
 * 스키마는 LDtk 호환을 염두에 둔 단순 형태(`ktt-office-map@1`).
 * 향후 LDtk Editor에서 export한 `.ldtk` JSON을 같은 인터페이스로 반환하는 어댑터를 추가하면
 * OfficeScene 코드를 수정하지 않고 외부 LDtk 프로젝트 사용 가능.
 *
 * 스키마:
 * ```
 * {
 *   "schema": "ktt-office-map@1",
 *   "ldtkCompatible": true,
 *   "cols": 30,
 *   "rows": 20,
 *   "tileSize": 16,
 *   "tileset": "tiny-town",
 *   "layers": [
 *     { "name": "floor", "type": "tiles", "data": number[][] }
 *   ]
 * }
 * ```
 *
 * 실패 시 null 반환 → OfficeScene이 DEFAULT_OFFICE_LAYOUT 폴백.
 */

export interface OfficeMapData {
  cols: number;
  rows: number;
  tileSize: number;
  tileset: string;
  layers: Array<{ name: string; type: "tiles"; data: number[][] }>;
}

export const OFFICE_MAP_URL = "/game/maps/office.json";

/**
 * 외부 맵 JSON을 fetch. 실패 시 null.
 * - HTTP 비-200 → null
 * - JSON 파싱 실패 → null
 * - 스키마 불일치 → null (행/열 수 검증)
 */
export async function loadOfficeMap(
  url = OFFICE_MAP_URL,
): Promise<OfficeMapData | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isOfficeMapData(json)) return null;
    return json;
  } catch {
    return null;
  }
}

function isOfficeMapData(v: unknown): v is OfficeMapData {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.cols !== "number" || typeof o.rows !== "number") return false;
  // v2 plan §C polish: 비현실적 작은 크기 차단 (cols/rows ≥ 4).
  if (o.cols < 4 || o.rows < 4) return false;
  if (typeof o.tileSize !== "number") return false;
  if (typeof o.tileset !== "string") return false;
  if (!Array.isArray(o.layers) || o.layers.length === 0) return false;
  const first = o.layers[0] as Record<string, unknown> | undefined;
  if (!first || !Array.isArray(first.data)) return false;
  const grid = first.data as unknown[];
  if (grid.length !== o.rows) return false;
  const firstRow = grid[0] as unknown[];
  if (!Array.isArray(firstRow) || firstRow.length !== o.cols) return false;
  return true;
}

/** 동기 검증/캐스트. Phaser cache에서 꺼낸 JSON에 사용. */
export function validateOfficeMap(v: unknown): OfficeMapData | null {
  return isOfficeMapData(v) ? v : null;
}

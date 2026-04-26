/**
 * DEPTH — Phaser GameObject z-order 상수.
 *
 * Phase 0 (v2 plan §C, B-7 회피). 라벨이 가구·캐릭터에 가리지 않도록 강제 톤.
 * Phase 4의 DepthSystem이 동일 enum을 사용해 zY (월드 row) 기반 가변 depth를
 * `ENTITY_BASE + zY`로 부여한다.
 *
 * 규칙:
 *  - 0~49: 바닥 (floor 타일, 영역 색상 페인트)
 *  - 50~99: 벽 뒤 (캐릭터보다 뒤에 그려질 벽, 그림자)
 *  - 100~899: 엔티티 (`ENTITY_BASE + row`로 살짝 깊이 가변)
 *  - 900~999: 벽 앞·전경 가구
 *  - 1000~1099: 말풍선
 *  - 1100~1199: 라벨 / 룸 이름
 *  - 2000+: HUD 오버레이 (Phaser 스코프)
 */

export const DEPTH = {
  FLOOR: 0,
  WALL_BACK: 50,
  ENTITY_BASE: 100,
  WALL_FRONT: 900,
  BUBBLE: 1000,
  LABEL: 1100,
  HUD_OVERLAY: 2000,
} as const;

export type DepthLayer = (typeof DEPTH)[keyof typeof DEPTH];

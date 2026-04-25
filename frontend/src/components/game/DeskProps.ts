/**
 * DeskProps.ts — MS7 디오라마
 *
 * 각 책상 자리(AgentRole)에 데스크 가구 prop을 픽셀 프리미티브로 합성해 배치.
 * 외부 스프라이트시트 의존 없이 결정성 보장 (MS6 캐릭터 합성과 동일 전략).
 *
 * 렌더 순서: drawDefaultOffice() → spawnActors()에서 createDeskProps → AgentActor.
 * 따라서 floor 위, 캐릭터 아래에 자연스럽게 깔림 (depth 조작 불필요).
 *
 * 시각 구성 (캐릭터 발 아래/뒤편):
 *   ┌──────┐    ← 모니터 (어두운 회색, 8×6)
 *   ╞══════╡    ← 책상 상판 (목재, 28×4)
 *   │      │    ← 책상 다리 (어두운 갈색, 24×3)
 *   ╶ 식물      ← 모서리 화분 (녹색 4px 동그라미 + 갈색 화분)
 *
 * 좌표 기준: 캐릭터 중심 (x, y).
 */

import Phaser from "phaser";

const DESK_TOP_W = 28;
const DESK_TOP_H = 4;
const DESK_LEG_W = 24;
const DESK_LEG_H = 3;
const MONITOR_W = 8;
const MONITOR_H = 6;

const DESK_TOP_COLOR = 0xa57044;
const DESK_LEG_COLOR = 0x4f3422;
const MONITOR_BODY = 0x1f232b;
const MONITOR_SCREEN = 0x4ec3ff;
const PLANT_LEAF = 0x2fa15a;
const PLANT_POT = 0x8c5a3a;

export interface DeskPropsHandle {
  destroy(): void;
}

/**
 * 캐릭터 (x, y) 위치에 대해 책상 + 모니터 + 화분을 합성.
 * 책상은 캐릭터 발 약간 뒤(y+8)에 위치해 캐릭터가 책상 앞에 앉아있는 듯 보이게 함.
 */
export function createDeskProps(
  scene: Phaser.Scene,
  x: number,
  y: number,
): DeskPropsHandle {
  const objects: Phaser.GameObjects.GameObject[] = [];

  // 책상 다리 (가장 뒤)
  const legY = y + 14;
  const leg = scene.add.rectangle(
    x,
    legY,
    DESK_LEG_W,
    DESK_LEG_H,
    DESK_LEG_COLOR,
  );
  objects.push(leg);

  // 책상 상판
  const topY = y + 10;
  const top = scene.add.rectangle(
    x,
    topY,
    DESK_TOP_W,
    DESK_TOP_H,
    DESK_TOP_COLOR,
  );
  top.setStrokeStyle(1, 0x14181f, 0.5);
  objects.push(top);

  // 모니터 본체 — 책상 좌측
  const monX = x - DESK_TOP_W / 2 + MONITOR_W / 2 + 2;
  const monY = topY - DESK_TOP_H / 2 - MONITOR_H / 2;
  const monBody = scene.add.rectangle(
    monX,
    monY,
    MONITOR_W,
    MONITOR_H,
    MONITOR_BODY,
  );
  objects.push(monBody);
  // 화면 (1px 작게)
  const monScreen = scene.add.rectangle(
    monX,
    monY,
    MONITOR_W - 2,
    MONITOR_H - 2,
    MONITOR_SCREEN,
    0.85,
  );
  objects.push(monScreen);

  // 화분 — 책상 우측
  const potX = x + DESK_TOP_W / 2 - 4;
  const potY = topY - DESK_TOP_H / 2 - 2;
  const pot = scene.add.rectangle(potX, potY + 2, 4, 4, PLANT_POT);
  objects.push(pot);
  const leaf = scene.add.circle(potX, potY - 2, 3, PLANT_LEAF);
  objects.push(leaf);

  return {
    destroy() {
      for (const obj of objects) obj.destroy();
    },
  };
}

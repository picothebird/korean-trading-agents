/**
 * OfficeSceneController — React HUD가 OfficeScene을 호출할 때 쓰는 좁은 인터페이스.
 * Phaser 객체를 React 트리에 직접 노출하지 않고 method bag만 전달.
 *
 * v2 plan §C Phase 1에서 fit/follow/free 카메라 모드 + 자동 포커스 메서드 추가.
 * 기존 5개 메서드는 후방 호환을 위해 그대로 유지.
 */

import type { AgentRole } from "@/types";

export type CameraMode = "fit" | "free" | "follow";

export interface OfficeSceneController {
  zoomBy(delta: number): void;
  resetCamera(): void;
  panCameraTo(worldX: number, worldY: number): void;
  getCameraInfo(): {
    scrollX: number;
    scrollY: number;
    zoom: number;
    viewWidth: number;
    viewHeight: number;
    worldWidth: number;
    worldHeight: number;
  } | null;
  setAgentClickHandler(handler: ((role: AgentRole) => void) | null): void;

  // Phase 1 추가
  fitToWorld(): void;
  setCameraMode(mode: CameraMode): void;
  getCameraMode(): CameraMode;
  focusAgent(role: AgentRole, opts?: { instant?: boolean }): void;
  focusZone(worldX: number, worldY: number, opts?: { instant?: boolean }): void;

  // Phase 4 추가 — 미니맵/HUD가 layout v2 좌석/존을 SSOT로 읽기 위함.
  getSeats(): Array<{ role: AgentRole; x: number; y: number; label?: string }>;
  getZones(): Array<{ name: string; color: number; x: number; y: number; w: number; h: number }>;

  // v3 추가 — DOM overlay (이름표/말풍선/룸 nameplate) 동기화.
  getOverlaySnapshot(): {
    cam: { scrollX: number; scrollY: number; zoom: number; viewW: number; viewH: number };
    agents: Array<{ role: AgentRole; nameX: number; nameY: number; bubbleX: number; bubbleY: number; bubbleText: string; bubbleVisible: boolean }>;
    zones: Array<{ name: string; x: number; y: number }>;
  } | null;
}

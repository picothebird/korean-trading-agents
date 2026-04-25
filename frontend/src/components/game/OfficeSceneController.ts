/**
 * OfficeSceneController — React HUD가 OfficeScene을 호출할 때 쓰는 좁은 인터페이스.
 * Phaser 객체를 React 트리에 직접 노출하지 않고 method bag만 전달.
 */

import type { AgentRole } from "@/types";

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
  };
  setAgentClickHandler(handler: ((role: AgentRole) => void) | null): void;
}

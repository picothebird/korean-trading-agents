/**
 * IAgentActor — 에이전트 액터 시각 객체의 좁은 인터페이스.
 *
 * Phase 0 (v2 plan §C). OfficeScene/FocusSystem이 actor 구현에 직접 결합되지
 * 않도록 추출. 현 `AgentActor`(도형 합성)와 향후 `SpriteAgentActor`(픽셀
 * 스프라이트) 모두 동일 시그니처로 호환된다.
 *
 * 시그니처 보장:
 *  - x, y: 월드 좌표 (책상 중심)
 *  - role: 9 AgentRole 중 하나
 *  - setStatus / showMessage / pulse / destroy / onPointerDown
 *
 * 좌표는 readonly. 이동이 필요하면 Phase 5b에서 별도 메서드 추가.
 */

import type { AgentRole, AgentStatus } from "@/types";

export interface IAgentActor {
  readonly role: AgentRole;
  readonly x: number;
  readonly y: number;
  setStatus(status: AgentStatus): void;
  showMessage(text: string, durationMs?: number): void;
  pulse(time: number): void;
  onPointerDown(handler: () => void): void;
  destroy(): void;
  /** v3 DOM overlay: 캐릭터 머리 위 anchor (말풍선용 월드 좌표). 미구현 시 fallback. */
  getLabelAnchor?(): { x: number; y: number };
  /** v3 DOM overlay: 캐릭터 아래 이름표 anchor. */
  getNameAnchor?(): { x: number; y: number };
  /** v3 DOM overlay: 현재 말풍선 상태. */
  getBubble?(): { text: string; visible: boolean };
}

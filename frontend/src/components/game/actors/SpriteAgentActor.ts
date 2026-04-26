/**
 * SpriteAgentActor — Pixel Agents 스프라이트 기반 에이전트 액터 (v2 plan §C Phase 3).
 *
 * `IAgentActor` 구현. 도형 합성판 `AgentActor`와 동일한 외부 시그니처를 유지해
 * `OfficeScene`에서 1:1 교체 가능. Container를 상속하지 않고 개별 GameObject를
 * 합성하는 패턴을 따른다 (typings 마찰 회피, AgentActor 주석 참조).
 *
 * 시각 구성:
 *   sprite (16×32 캐릭터, walk2=idle 프레임으로 시작)
 *   shadow (발 아래 ellipse)
 *   stateDot (머리 위 우측, status별 색)
 *   glow (활성 상태에서 펄싱)
 *   label (캐릭터 아래 이름)
 *   bubble (활성 상태에서 발화 시)
 *
 * 애니메이션 (Phase 3):
 *   - idle: walk2 frame 정지
 *   - active 상태: walk1 ↔ walk3 (200ms 주기) 또는 type1↔type2 / read1↔read2 교차
 *
 * status → animation 매핑:
 *   idle/done       → idle (정자세)
 *   thinking        → read 토글 (책 읽는 모션)
 *   analyzing       → type 토글 (타이핑)
 *   debating        → walk 토글 + 좌우 step
 *   deciding        → idle + bob (body 흔들기)
 */

import Phaser from "phaser";
import type { AgentRole, AgentStatus } from "@/types";
import { AGENT_LABEL } from "@/lib/agentLabels";
import type { IAgentActor } from "./IAgentActor";
import {
  CHAR_FRAMES,
  CHAR_KEY_PREFIX,
  ROLE_SKIN,
  dirToRow,
  frameIndex,
} from "../assets/assetCatalog";
import { DEPTH } from "../systems/depth";

const SPRITE_SCALE = 3; // 16×32 → 48×96 화면 픽셀 (v3: 더 크게)
const SHADOW_W = 26;
const SHADOW_H = 7;
const STATE_DOT_RADIUS = 4;
const HIT_W = 40;
const HIT_H = 96;

const ACTIVE_STATUSES = new Set<AgentStatus>([
  "thinking",
  "analyzing",
  "debating",
  "deciding",
]);

const STATUS_TINT: Record<AgentStatus, number> = {
  idle: 0xb8bcc6,
  thinking: 0x3182f6,
  analyzing: 0x7d6bff,
  debating: 0xf04452,
  deciding: 0xa855f7,
  done: 0x2fca73,
};

type AnimKind = "idle" | "read" | "type" | "walk";

const STATUS_ANIM: Record<AgentStatus, AnimKind> = {
  idle: "idle",
  thinking: "read",
  analyzing: "type",
  debating: "walk",
  deciding: "idle",
  done: "idle",
};

export class SpriteAgentActor implements IAgentActor {
  readonly role: AgentRole;
  readonly x: number;
  readonly y: number;
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly stateDot: Phaser.GameObjects.Arc;
  private readonly glow: Phaser.GameObjects.Arc;
  private readonly hitRect: Phaser.GameObjects.Rectangle;
  private bubbleTextValue: string | null = null;
  private bubbleVisible = false;
  private bubbleHideTimer: Phaser.Time.TimerEvent | null = null;
  private currentStatus: AgentStatus = "idle";
  private animKind: AnimKind = "idle";
  private animPhase = 0;
  private lastAnimTick = 0;
  private lastPulseTick = 0;
  private spriteBaseY: number;
  private wanderPhase: number;
  private wanderX = 0;
  private wanderY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, role: AgentRole) {
    this.scene = scene;
    this.role = role;
    this.x = x;
    this.y = y;
    this.wanderPhase = Math.random() * Math.PI * 2;

    const skin = ROLE_SKIN[role];
    const key = `${CHAR_KEY_PREFIX}${skin.charId}`;

    // 스프라이트가 없는 경우 폴백 처리는 OfficeScene에서 — 여기서는 존재 가정.
    // 좌표는 캐릭터 발(下단)이 책상 중심 y에 오도록 살짝 위로 올림.
    this.spriteBaseY = y - 4;
    this.sprite = scene.add.sprite(
      x,
      this.spriteBaseY,
      key,
      frameIndex(CHAR_FRAMES.idle, dirToRow("down").row),
    );
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.setOrigin(0.5, 0.5);
    if (skin.tint !== 0xffffff) {
      this.sprite.setTint(skin.tint);
    }
    this.sprite.setDepth(DEPTH.ENTITY_BASE);

    // 그림자
    this.shadow = scene.add.ellipse(
      x,
      y + 38,
      SHADOW_W,
      SHADOW_H,
      0x000000,
      0.28,
    );
    this.shadow.setDepth(DEPTH.ENTITY_BASE - 1);

    // 글로우
    const shirtColor = skin.tint === 0xffffff ? 0x3182f6 : skin.tint;
    this.glow = scene.add.circle(x, y + 6, 32, shirtColor, 0.18);
    this.glow.setVisible(false);
    this.glow.setDepth(DEPTH.ENTITY_BASE - 2);

    // 상태 점 — 머리 위 우측
    this.stateDot = scene.add.circle(
      x + 12,
      this.spriteBaseY - 44,
      STATE_DOT_RADIUS,
      STATUS_TINT.idle,
    );
    this.stateDot.setStrokeStyle(1, 0xffffff, 0.95);
    this.stateDot.setDepth(DEPTH.LABEL);

    // 라벨/버블 — v3: Phaser text 제거. DOM overlay에서 렌더링.
    void AGENT_LABEL; // import 유지

    // 클릭 hit area
    this.hitRect = scene.add.rectangle(x, y, HIT_W, HIT_H, 0x000000, 0);
    this.hitRect.setInteractive({ useHandCursor: true });
    this.hitRect.setDepth(DEPTH.LABEL + 1);
  }

  /** DOM overlay 말풍선 anchor — 좌석 고정 좌표의 머리 위 (동적 sprite.y 아닌 고정값 사용). */
  getLabelAnchor(): { x: number; y: number } {
    // sprite 시작점: y - 4. 스프라이트 display height = 96 (16×32 × scale 3),
    // origin (0.5, 0.5) → 머리 끝 = sprite center y - 48.
    return { x: this.x, y: this.y - 4 - 48 };
  }
  /** DOM overlay 이름표 anchor — 좌석 고정 좌표 캠릭터 발끝. */
  getNameAnchor(): { x: number; y: number } {
    // 발끝 세계 y = sprite center y + 48 = (this.y - 4) + 48 = this.y + 44.
    return { x: this.x, y: this.y + 44 };
  }
  getBubble(): { text: string; visible: boolean } {
    return { text: this.bubbleTextValue ?? "", visible: this.bubbleVisible && !!this.bubbleTextValue };
  }

  onPointerDown(handler: () => void): void {
    this.hitRect.on("pointerdown", handler);
  }

  showMessage(text: string, durationMs = 7000): void {
    const trimmed = text.length > 80 ? text.slice(0, 78) + "…" : text;
    this.bubbleTextValue = trimmed;
    this.bubbleVisible = true;
    if (this.bubbleHideTimer) {
      this.bubbleHideTimer.remove(false);
    }
    this.bubbleHideTimer = this.scene.time.delayedCall(durationMs, () => {
      this.bubbleVisible = false;
      this.bubbleHideTimer = null;
    });
  }

  setStatus(status: AgentStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    this.animKind = STATUS_ANIM[status];
    this.stateDot.setFillStyle(STATUS_TINT[status]);
    const active = ACTIVE_STATUSES.has(status);
    this.glow.setVisible(active);
  }

  /** Scene update에서 매 프레임 호출. animation + glow + wander.
   *  CPU 보호: 33ms (≈30fps) 미만 호출은 스킵. 9 actors × 60fps Math.cos/sin 폭주를 막는다. */
  pulse(time: number): void {
    if (time - this.lastPulseTick < 33) return;
    this.lastPulseTick = time;
    // wander
    let nextWx = 0;
    let nextWy = 0;
    if (ACTIVE_STATUSES.has(this.currentStatus)) {
      const tw = time / 2400;
      nextWx = Math.round(Math.cos(tw + this.wanderPhase) * 2);
      nextWy = Math.round(Math.sin(tw * 1.3 + this.wanderPhase) * 1);
    }
    const dx = nextWx - this.wanderX;
    const dy = nextWy - this.wanderY;
    if (dx !== 0 || dy !== 0) {
      this.sprite.setX(this.sprite.x + dx);
      this.sprite.setY(this.sprite.y + dy);
      this.shadow.setX(this.shadow.x + dx);
      this.glow.setX(this.glow.x + dx).setY(this.glow.y + dy);
      this.stateDot.setX(this.stateDot.x + dx);
      this.hitRect.setX(this.hitRect.x + dx).setY(this.hitRect.y + dy);
      this.spriteBaseY += dy;
    }
    this.wanderX = nextWx;
    this.wanderY = nextWy;

    // animation frame stepping (250ms 주기)
    if (time - this.lastAnimTick > 250) {
      this.lastAnimTick = time;
      this.animPhase ^= 1;
      this.applyAnimFrame();
    }

    // glow pulse
    if (this.glow.visible) {
      const t = (time % 800) / 800;
      const scale = 1 + Math.sin(t * Math.PI * 2) * 0.08;
      this.glow.setScale(scale);
    }
  }

  private applyAnimFrame(): void {
    const dirRow = dirToRow("down").row;
    let frameCol: number;
    switch (this.animKind) {
      case "type":
        frameCol = this.animPhase === 0 ? CHAR_FRAMES.type1 : CHAR_FRAMES.type2;
        break;
      case "read":
        frameCol = this.animPhase === 0 ? CHAR_FRAMES.read1 : CHAR_FRAMES.read2;
        break;
      case "walk":
        frameCol = this.animPhase === 0 ? CHAR_FRAMES.walk1 : CHAR_FRAMES.walk3;
        break;
      case "idle":
      default:
        frameCol = CHAR_FRAMES.idle;
        break;
    }
    this.sprite.setFrame(frameIndex(frameCol, dirRow));
  }

  destroy(): void {
    this.bubbleHideTimer?.remove(false);
    this.sprite.destroy();
    this.shadow.destroy();
    this.glow.destroy();
    this.stateDot.destroy();
    this.hitRect.destroy();
    void this.scene;
  }
}

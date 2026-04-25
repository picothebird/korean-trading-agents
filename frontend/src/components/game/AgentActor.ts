/**
 * AgentActor — MS3 액터 + MS6 픽셀 캐릭터
 *
 * 9개 AgentRole에 대응하는 책상 자리에 배치되는 시각 객체.
 * MS3 = 정적 책상 / MS4 = 클릭+말풍선 / MS5 = 테마 / MS6 = 픽셀 캐릭터 합성.
 *
 * 픽셀 캐릭터 (MS6):
 *   ┌──┐      ← 머리 (살색 8×8 정사각형 + 머리카락)
 *   ├──┤
 *   │██│      ← 셔츠 (역할 색상, 12×10)
 *   │██│
 *   ╰─╯       ← 다리 (어두운 회색 8×4)
 *    ▼        ← 그림자 타원
 *
 * 모든 요소는 정수 픽셀에 정렬되어 픽셀아트 톤 유지. 외부 스프라이트시트 의존 없음.
 *
 * 상태 변화: idle/done = 채도 0.65, active = 1.0 + 글로우 펄싱.
 */

import Phaser from "phaser";
import type { AgentRole, AgentStatus } from "@/types";
import { AGENT_COLOR, AGENT_LABEL } from "@/lib/agentLabels";

// 캐릭터 픽셀 사이즈 (정수 정렬을 위해 짝수)
const HEAD_W = 8;
const HEAD_H = 8;
const BODY_W = 12;
const BODY_H = 10;
const LEG_W = 8;
const LEG_H = 4;
const SHADOW_W = 16;
const SHADOW_H = 4;
const HIT_W = 20;
const HIT_H = 26; // 클릭 hit area

const SKIN_COLOR = 0xfbd1a2;
const HAIR_COLOR = 0x3a2615;
const LEG_COLOR = 0x2f3340;
const SHADOW_COLOR = 0x000000;
const STROKE_COLOR = 0x14181f;

const STATE_DOT_RADIUS = 3;

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

/**
 * 픽셀 캐릭터 합성. Phaser.GameObjects.Container 미상속 (typings 마찰 회피).
 */
export class AgentActor {
  readonly role: AgentRole;
  readonly x: number;
  readonly y: number;
  private readonly scene: Phaser.Scene;
  private readonly hitRect: Phaser.GameObjects.Rectangle; // 투명, 클릭 영역
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly legs: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.GameObjects.Rectangle; // 셔츠 (역할 색)
  private readonly bodyOutline: Phaser.GameObjects.Rectangle;
  private readonly head: Phaser.GameObjects.Rectangle;
  private readonly hair: Phaser.GameObjects.Rectangle;
  private readonly headOutline: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly stateDot: Phaser.GameObjects.Arc;
  private readonly glow: Phaser.GameObjects.Arc;
  private bubbleText: Phaser.GameObjects.Text | null = null;
  private bubbleHideTimer: Phaser.Time.TimerEvent | null = null;
  private currentStatus: AgentStatus = "idle";
  private bodyBaseY: number;
  private headBaseY: number;
  private hairBaseY: number;
  private headOutlineBaseY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, role: AgentRole) {
    this.scene = scene;
    this.role = role;
    this.x = x;
    this.y = y;

    const shirtColor = parseInt(AGENT_COLOR[role].replace("#", ""), 16);

    // 글로우 (활성 상태일 때만 표시) — 전체 캐릭터를 감싸는 큰 원
    this.glow = scene.add.circle(x, y, 18, shirtColor, 0.2);
    this.glow.setVisible(false);

    // 그림자 (발 아래)
    const feetY = y + LEG_H + BODY_H / 2 - 1;
    this.shadow = scene.add.ellipse(
      x,
      feetY + 2,
      SHADOW_W,
      SHADOW_H,
      SHADOW_COLOR,
      0.25,
    );

    // 다리 (셔츠 아래)
    const legsY = y + BODY_H / 2 + LEG_H / 2 - 1;
    this.legs = scene.add.rectangle(x, legsY, LEG_W, LEG_H, LEG_COLOR);

    // 셔츠 (역할 색)
    const bodyY = y;
    this.body = scene.add.rectangle(x, bodyY, BODY_W, BODY_H, shirtColor);
    this.bodyOutline = scene.add
      .rectangle(x, bodyY, BODY_W, BODY_H)
      .setStrokeStyle(1, STROKE_COLOR, 0.7);
    this.bodyBaseY = bodyY;

    // 머리 (살색)
    const headY = y - BODY_H / 2 - HEAD_H / 2 + 1;
    this.head = scene.add.rectangle(x, headY, HEAD_W, HEAD_H, SKIN_COLOR);
    // 머리카락 — 머리 위 4px
    this.hair = scene.add.rectangle(
      x,
      headY - HEAD_H / 2 + 2,
      HEAD_W,
      4,
      HAIR_COLOR,
    );
    this.headOutline = scene.add
      .rectangle(x, headY, HEAD_W, HEAD_H)
      .setStrokeStyle(1, STROKE_COLOR, 0.7);
    this.headBaseY = headY;
    this.hairBaseY = headY - HEAD_H / 2 + 2;
    this.headOutlineBaseY = headY;

    // 상태 점 (머리 위 우측)
    this.stateDot = scene.add.circle(
      x + HEAD_W / 2 + STATE_DOT_RADIUS - 1,
      headY - HEAD_H / 2 - STATE_DOT_RADIUS,
      STATE_DOT_RADIUS,
      STATUS_TINT.idle,
    );
    this.stateDot.setStrokeStyle(1, 0xffffff, 0.95);

    // 이름 라벨
    this.label = scene.add.text(x, feetY + 6, AGENT_LABEL[role], {
      fontFamily: "Pretendard, system-ui, sans-serif",
      fontSize: "10px",
      color: "#1c1f26",
      backgroundColor: "rgba(255,255,255,0.85)",
      padding: { left: 4, right: 4, top: 1, bottom: 1 },
    });
    this.label.setOrigin(0.5, 0);

    // 클릭 hit area (보이지 않는 큰 사각형 — 캐릭터 전체 덮음)
    this.hitRect = scene.add.rectangle(x, y, HIT_W, HIT_H, 0x000000, 0);
    this.hitRect.setInteractive({ useHandCursor: true });
  }

  /** 클릭 콜백 등록 (PhaserCanvas → React 패널 연결용). */
  onPointerDown(handler: () => void): void {
    this.hitRect.on("pointerdown", handler);
  }

  /** 말풍선 표시 (MS4). 길이 ≤ 80자로 잘라 본체 위에 잠시 띄움. */
  showMessage(text: string, durationMs = 5000): void {
    const trimmed = text.length > 80 ? text.slice(0, 78) + "…" : text;
    if (!this.bubbleText) {
      this.bubbleText = this.scene.add.text(
        this.x,
        this.y - BODY_H / 2 - HEAD_H - 8,
        trimmed,
        {
          fontFamily: "Pretendard, system-ui, sans-serif",
          fontSize: "10px",
          color: "#1c1f26",
          backgroundColor: "rgba(255,255,255,0.96)",
          padding: { left: 6, right: 6, top: 3, bottom: 3 },
          wordWrap: { width: 160, useAdvancedWrap: true },
          align: "center",
        },
      );
      this.bubbleText.setOrigin(0.5, 1);
      this.bubbleText.setDepth(1000);
    } else {
      this.bubbleText.setText(trimmed);
      this.bubbleText.setVisible(true);
    }
    if (this.bubbleHideTimer) {
      this.bubbleHideTimer.remove(false);
    }
    this.bubbleHideTimer = this.scene.time.delayedCall(durationMs, () => {
      this.bubbleText?.setVisible(false);
      this.bubbleHideTimer = null;
    });
  }

  setStatus(status: AgentStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    this.stateDot.setFillStyle(STATUS_TINT[status]);
    const active = ACTIVE_STATUSES.has(status);
    this.glow.setVisible(active);
    const alpha = active || status === "done" ? 1 : 0.7;
    this.body.setAlpha(alpha);
    this.head.setAlpha(alpha);
    this.hair.setAlpha(alpha);
    this.legs.setAlpha(alpha);
  }

  /** Scene update에서 명시 호출. 글로우 펄스 + 활성 상태 머리/몸통 호흡 bob. */
  pulse(time: number): void {
    // 활성 상태에서만 머리/몸통 ±1px bob (1200ms)
    if (this.currentStatus !== "idle") {
      const tb = (time % 1200) / 1200;
      const offset = Math.round(Math.sin(tb * Math.PI * 2));
      this.body.setY(this.bodyBaseY + offset);
      this.head.setY(this.headBaseY + offset);
      this.hair.setY(this.hairBaseY + offset);
      this.headOutline.setY(this.headOutlineBaseY + offset);
    }
    if (!this.glow.visible) return;
    const t = (time % 800) / 800;
    const scale = 1 + Math.sin(t * Math.PI * 2) * 0.08;
    this.glow.setScale(scale);
  }

  destroy(): void {
    this.bubbleHideTimer?.remove(false);
    this.bubbleText?.destroy();
    this.glow.destroy();
    this.shadow.destroy();
    this.legs.destroy();
    this.body.destroy();
    this.bodyOutline.destroy();
    this.head.destroy();
    this.hair.destroy();
    this.headOutline.destroy();
    this.hitRect.destroy();
    this.stateDot.destroy();
    this.label.destroy();
    void this.scene; // 참조 유지 표시
  }
}

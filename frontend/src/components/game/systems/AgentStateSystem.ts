/**
 * AgentStateSystem — 액터 상태별 작은 effect 오버레이 (v2 plan §C Phase 5a).
 *
 * 캐릭터 머리 위에 status를 직관적으로 표시하는 이모지/아이콘 텍스트 1개를
 * 띄운다. 캐릭터 자체는 움직이지 않는다 (책상 고정). 부드러운 fade in/out 으로
 * 상태 전환을 표시.
 *
 *   thinking   → 💭
 *   analyzing  → 📊
 *   debating   → 💬
 *   deciding   → ⚖️
 *   done       → ✅
 *   idle       → (숨김)
 *
 * Phaser scene update tick에서 호출.
 */

import type Phaser from "phaser";
import type { AgentRole, AgentStatus } from "@/types";
import type { IAgentActor } from "../actors/IAgentActor";
import { DEPTH } from "./depth";

const STATUS_ICON: Record<AgentStatus, string> = {
  idle: "",
  thinking: "💭",
  analyzing: "📊",
  debating: "💬",
  deciding: "⚖️",
  done: "✅",
};

const ICON_OFFSET_Y = -56;

interface IconHandle {
  text: Phaser.GameObjects.Text;
  status: AgentStatus;
}

export class AgentStateSystem {
  private icons: Map<AgentRole, IconHandle> = new Map();
  private statusByRole: Map<AgentRole, AgentStatus> = new Map();
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** OfficeScene이 thoughts 적용 후 호출. */
  setStatus(role: AgentRole, status: AgentStatus): void {
    this.statusByRole.set(role, status);
  }

  /** scene update tick에서 호출 — 액터 좌표 위에 아이콘 동기화. */
  sync(actors: ReadonlyMap<AgentRole, IAgentActor>): void {
    for (const [role, actor] of actors) {
      const status = this.statusByRole.get(role) ?? "idle";
      const icon = STATUS_ICON[status];
      let handle = this.icons.get(role);
      if (!icon) {
        if (handle) handle.text.setVisible(false);
        continue;
      }
      if (!handle) {
        const text = this.scene.add.text(actor.x, actor.y + ICON_OFFSET_Y, icon, {
          fontSize: "20px",
          fontFamily: "system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'",
        });
        text.setOrigin(0.5, 1);
        text.setDepth(DEPTH.LABEL - 1);
        handle = { text, status };
        this.icons.set(role, handle);
      } else if (handle.status !== status) {
        handle.text.setText(icon);
        handle.status = status;
      }
      handle.text.setPosition(actor.x, actor.y + ICON_OFFSET_Y);
      handle.text.setVisible(true);
    }
  }

  destroy(): void {
    for (const h of this.icons.values()) h.text.destroy();
    this.icons.clear();
    this.statusByRole.clear();
  }
}

"use client";

/**
 * HudControls — 줌/리셋/사운드 (캔버스 우상단)
 */

import { useState } from "react";
import { Icon } from "@/components/ui";
import type { OfficeSceneController } from "./OfficeSceneController";
import { isSfxEnabled, setSfxEnabled, playSfx } from "./sfx";

interface Props {
  controller: OfficeSceneController | null;
}

const BTN_STYLE: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "1px solid var(--border-subtle, #d6d8dd)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.92)",
  color: "#1c1f26",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  lineHeight: 1,
};

export function HudControls({ controller }: Props) {
  const disabled = !controller;
  const [muted, setMuted] = useState(() => !isSfxEnabled());
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSfxEnabled(!next);
    if (!next) playSfx("select"); // 음소거 해제 시 확인 톤
  };
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 5,
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        title="확대"
        aria-label="확대"
        disabled={disabled}
        onClick={() => controller?.zoomBy(0.2)}
        style={BTN_STYLE}
      >
        +
      </button>
      <button
        type="button"
        title="축소"
        aria-label="축소"
        disabled={disabled}
        onClick={() => controller?.zoomBy(-0.2)}
        style={BTN_STYLE}
      >
        −
      </button>
      <button
        type="button"
        title="카메라 리셋"
        aria-label="카메라 리셋"
        disabled={disabled}
        onClick={() => controller?.resetCamera()}
        style={{ ...BTN_STYLE, fontSize: 11, fontWeight: 500 }}
      >
        ⌂
      </button>
      <button
        type="button"
        title={muted ? "사운드 켜기" : "사운드 끄기"}
        aria-label={muted ? "사운드 켜기" : "사운드 끄기"}
        onClick={toggleMute}
        style={{ ...BTN_STYLE, fontSize: 11, fontWeight: 500 }}
      >
        <Icon name={muted ? "volume-off" : "volume"} size={14} decorative />
      </button>
    </div>
  );
}

export default HudControls;

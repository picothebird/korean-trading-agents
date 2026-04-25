"use client";

/**
 * HudControls — MS4+ 줌/리셋 버튼 (캔버스 우상단)
 */

import type { OfficeSceneController } from "./OfficeSceneController";

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
    </div>
  );
}

export default HudControls;

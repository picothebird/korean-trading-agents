"use client";

/**
 * HudControls — 줌/리셋/카메라모드/사운드 (캔버스 우상단).
 *
 * v2 plan §C Phase 6: fit/follow/free 모드 표시기 + "전체 보기" 버튼.
 * 자동 포커스가 사용자 시점을 가져갈 때 free 모드로 강등되므로, 사용자가
 * 명시적으로 "fit"으로 돌아갈 수단이 필요.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import type { OfficeSceneController, CameraMode } from "./OfficeSceneController";
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

const MODE_BADGE: Record<CameraMode, { label: string; bg: string }> = {
  fit: { label: "FIT", bg: "#e8f0fe" },
  follow: { label: "FOLLOW", bg: "#fff7e0" },
  free: { label: "FREE", bg: "#f1f3f5" },
};

export function HudControls({ controller }: Props) {
  const disabled = !controller;
  const [muted, setMuted] = useState(() => !isSfxEnabled());
  const [mode, setMode] = useState<CameraMode>("fit");

  // 카메라 모드 폴링 (300ms) — controller 메서드 호출만으로 가벼움.
  useEffect(() => {
    if (!controller) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const m = controller.getCameraMode();
      setMode((prev) => (prev === m ? prev : m));
    };
    tick();
    const id = window.setInterval(tick, 300);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [controller]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSfxEnabled(!next);
    if (!next) playSfx("select");
  };
  const badge = MODE_BADGE[mode];
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
      <div
        title={`카메라 모드: ${badge.label}`}
        aria-label={`카메라 모드 ${badge.label}`}
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#5a5d66",
          background: badge.bg,
          border: "1px solid var(--border-subtle, #d6d8dd)",
          borderRadius: 6,
          padding: "2px 4px",
          textAlign: "center",
          letterSpacing: 0.4,
        }}
      >
        {badge.label}
      </div>
      <button
        type="button"
        title="전체 보기 (Fit)"
        aria-label="전체 보기"
        disabled={disabled}
        onClick={() => controller?.fitToWorld()}
        style={{ ...BTN_STYLE, fontSize: 11, fontWeight: 500 }}
      >
        ⛶
      </button>
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
        title="카메라 리셋 (Fit)"
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

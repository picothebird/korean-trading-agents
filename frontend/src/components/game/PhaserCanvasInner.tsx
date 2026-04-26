"use client";

/**
 * PhaserCanvasInner — 실제 Phaser.Game 인스턴스를 마운트하는 client-only 컴포넌트.
 * PhaserCanvas에서 dynamic({ ssr: false })로만 로드됨.
 */

import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import type { AgentRole, AgentThought } from "@/types";
import { ALL_AGENT_ROLES } from "@/lib/agentLabels";
import type { OfficeScene as OfficeSceneType } from "./OfficeScene";
import type { OfficeSceneController } from "./OfficeSceneController";

/** "#RRGGBB" / "#RGB" / "rgb(r,g,b)" → 0xRRGGBB. 실패 시 null. */
function cssColorToHex(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = hex[0],
        g = hex[1],
        b = hex[2];
      return parseInt(r + r + g + g + b + b, 16);
    }
    if (hex.length === 6) return parseInt(hex, 16);
    return null;
  }
  const m = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    const r = Math.min(255, parseInt(m[1], 10));
    const g = Math.min(255, parseInt(m[2], 10));
    const b = Math.min(255, parseInt(m[3], 10));
    return (r << 16) | (g << 8) | b;
  }
  return null;
}

interface Props {
  thoughts?: ReadonlyArray<AgentThought>;
  onAgentClick?: (role: AgentRole) => void;
  visibleRoles?: ReadonlyArray<AgentRole>;
  onReady?: (controller: OfficeSceneController | null) => void;
}

export default function PhaserCanvasInner({
  thoughts,
  onAgentClick,
  visibleRoles,
  onReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<unknown>(null); // Phaser.Game (런타임 import이라 unknown)
  const sceneRef = useRef<OfficeSceneType | null>(null);
  const thoughtsRef = useRef<ReadonlyArray<AgentThought>>(thoughts ?? []);
  const visibleRolesRef = useRef<ReadonlyArray<AgentRole>>(visibleRoles ?? ALL_AGENT_ROLES);
  const clickHandlerRef = useRef<((role: AgentRole) => void) | undefined>(
    onAgentClick,
  );
  const visibleRolesKey = (visibleRoles ?? ALL_AGENT_ROLES).join("|");

  // thoughts가 바뀔 때마다 scene에 적용 (game/scene 미준비 시 ref만 갱신)
  useEffect(() => {
    thoughtsRef.current = thoughts ?? [];
    if (sceneRef.current && thoughts && thoughts.length > 0) {
      sceneRef.current.applyThoughts(thoughts);
    }
  }, [thoughts]);

  // onAgentClick 갱신
  useEffect(() => {
    clickHandlerRef.current = onAgentClick;
    sceneRef.current?.setAgentClickHandler(
      onAgentClick ? (role) => clickHandlerRef.current?.(role) : null,
    );
  }, [onAgentClick]);

  useEffect(() => {
    visibleRolesRef.current = visibleRoles ?? ALL_AGENT_ROLES;
  }, [visibleRoles]);

  // MS5: 테마(--bg-canvas) 동기화. 마운트 시 1회 + data-theme 변경 시 재반영.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyTheme = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-canvas")
        .trim();
      const hex = cssColorToHex(raw);
      if (hex !== null) sceneRef.current?.setBackgroundColor(hex);
    };
    applyTheme();
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // effect-scoped game holder. shared gameRef는 외부 접근 용도만,
    // cleanup은 반드시 이 effect가 만든 인스턴스만 책임진다 (strict mode 더블 마운트 안전).
    let localGame: Phaser.Game | null = null;
    let localRo: ResizeObserver | null = null;

    void (async () => {
      const Phaser = (await import("phaser")).default;
      const { OfficeScene } = await import("./OfficeScene");
      if (cancelled || !hostRef.current) return;

      const host = hostRef.current;
      const sceneInstance = new OfficeScene(visibleRolesRef.current);
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        width: host.clientWidth || 320,
        height: host.clientHeight || 240,
        backgroundColor: "#f6f7f9",
        // Phaser 내부 RAF 루프를 30fps로 cap — CPU 폭주 방어.
        // 분석 화면은 게임이 아니라 시각화이므로 30fps로 충분히 부드러움.
        fps: { target: 30, forceSetTimeOut: false, smoothStep: true, min: 15 },
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        // MS4: 입력 활성화 (휠 줌 + 드래그 팬 + 액터 클릭)
        input: { keyboard: false, mouse: true, touch: true, gamepad: false },
        scene: [sceneInstance],
        pixelArt: true,
        antialias: false,
        banner: false,
      });
      // cleanup이 이미 실행됐다면 즉시 폐기.
      if (cancelled) {
        try { game.destroy(true); } catch { /* no-op */ }
        return;
      }
      localGame = game;
      gameRef.current = game;
      sceneRef.current = sceneInstance;

      // 클릭 핸들러 등록 (있는 경우)
      if (clickHandlerRef.current) {
        sceneInstance.setAgentClickHandler((role) =>
          clickHandlerRef.current?.(role),
        );
      }


      // 컨트롤러를 부모에게 전달 (HUD 등이 사용)
      if (onReady) {
        const controller: OfficeSceneController = {
          zoomBy: (d) => sceneInstance.zoomBy(d),
          resetCamera: () => sceneInstance.resetCamera(),
          panCameraTo: (x, y) => sceneInstance.panCameraTo(x, y),
          getCameraInfo: () => sceneInstance.getCameraInfo(),
          setAgentClickHandler: (h) => sceneInstance.setAgentClickHandler(h),
          fitToWorld: () => sceneInstance.fitToWorld(),
          setCameraMode: (m) => sceneInstance.setCameraMode(m),
          getCameraMode: () => sceneInstance.getCameraMode(),
          focusAgent: (role, opts) => sceneInstance.focusAgent(role, opts),
          focusZone: (x, y, opts) => sceneInstance.focusZone(x, y, opts),
          focusStage: (idx, opts) => sceneInstance.focusStage(idx, opts),
          getSeats: () => sceneInstance.getSeats(),
          getZones: () => sceneInstance.getZones(),
          getOverlaySnapshot: () => sceneInstance.getOverlaySnapshot(),
        };
        onReady(controller);
      }
      // 초기 thoughts 적용 (scene.create 이전 호출도 pendingSnapshots로 안전)
      const initial = thoughtsRef.current;
      if (initial.length > 0) {
        sceneInstance.applyThoughts(initial);
      }

      // 부모 크기 변경에 맞춰 캔버스 리사이즈
      localRo = new ResizeObserver(() => {
        if (!host || !game.scale) return;
        game.scale.resize(host.clientWidth, host.clientHeight);
      });
      localRo.observe(host);
    })();

    return () => {
      cancelled = true;
      onReady?.(null);
      // shared ref 정리 (다른 인스턴스가 덮어쓰지 않은 경우만).
      if (gameRef.current === localGame) {
        gameRef.current = null;
        sceneRef.current = null;
      }
      try { localRo?.disconnect(); } catch { /* no-op */ }
      if (localGame) {
        try { localGame.destroy(true); } catch { /* no-op */ }
        localGame = null;
      }
    };
  }, [onReady, visibleRolesKey]);

  return (
    <div
      ref={hostRef}
      data-phaser-host-inner
      style={{ width: "100%", height: "100%" }}
    />
  );
}

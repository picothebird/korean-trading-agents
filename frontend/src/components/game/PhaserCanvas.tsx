"use client";

/**
 * PhaserCanvas — MS0 부트스트랩 + MS3 props 전달
 *
 * Next.js 16 / Turbopack 환경에서 Phaser는 SSR 불가능 (window/canvas 의존).
 * 따라서 dynamic import + ssr:false로 마운트한다.
 *
 * 반응형: ResizeObserver로 부모 컨테이너 크기를 추적해 game.scale.resize 호출.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentRole, AgentThought } from "@/types";
import { ALL_AGENT_ROLES } from "@/lib/agentLabels";
import type { OfficeSceneController } from "./OfficeSceneController";
import { HudControls } from "./HudControls";
import { Minimap } from "./Minimap";
import { AgentCounter } from "./AgentCounter";

// Phaser는 동적 로드만 사용. 컴포넌트 자체는 client-only.
const PhaserCanvasInner = dynamic(() => import("./PhaserCanvasInner"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted, #888)",
        fontSize: 12,
      }}
    >
      픽셀 오피스 로딩 중…
    </div>
  ),
});

interface Props {
  thoughts?: ReadonlyArray<AgentThought>;
  onAgentClick?: (role: AgentRole) => void;
  /** 무대에 표시할 역할 목록. 미지정 시 전체 역할 표시. */
  visibleRoles?: ReadonlyArray<AgentRole>;
  /** HUD 표시 여부 (기본 true). 작은 미리보기에서는 false 권장. */
  showHud?: boolean;
}

export function PhaserCanvas({ thoughts, onAgentClick, visibleRoles, showHud = true }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [controller, setController] = useState<OfficeSceneController | null>(
    null,
  );
  const activeRoles = useMemo<ReadonlyArray<AgentRole>>(
    () => (visibleRoles && visibleRoles.length > 0 ? visibleRoles : ALL_AGENT_ROLES),
    [visibleRoles],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      el.style.minHeight = "240px";
    }
  }, []);

  return (
    <div
      ref={containerRef}
      data-phaser-host
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 240,
        overflow: "hidden",
        borderRadius: 8,
        background: "var(--bg-canvas, #f6f7f9)",
      }}
    >
      <PhaserCanvasInner
        thoughts={thoughts}
        onAgentClick={onAgentClick}
        visibleRoles={activeRoles}
        onReady={setController}
      />
      {showHud && (
        <>
          <AgentCounter thoughts={thoughts} totalRoles={activeRoles.length} />
          <HudControls controller={controller} />
          <Minimap controller={controller} thoughts={thoughts} visibleRoles={activeRoles} />
        </>
      )}
    </div>
  );
}

export default PhaserCanvas;

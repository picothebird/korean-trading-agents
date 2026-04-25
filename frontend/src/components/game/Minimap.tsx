"use client";

/**
 * Minimap — MS4+ 미니맵 (캔버스 우하단)
 *
 * - 30×20 그리드를 1셀=4px로 그려 120×80 SVG 출력
 * - 외벽/통로/마루를 단색으로 구분
 * - 9 에이전트 책상 위치를 AGENT_COLOR 도트로 표시 (현재 status에 따라 채도 조정)
 * - 카메라 뷰포트를 사각형으로 표시 (controller.getCameraInfo() 폴링)
 * - 미니맵 클릭 → controller.panCameraTo(worldX, worldY)
 */

import { useEffect, useRef, useState } from "react";
import type { AgentRole, AgentStatus, AgentThought } from "@/types";
import { AGENT_COLOR } from "@/lib/agentLabels";
import {
  DEFAULT_OFFICE_LAYOUT,
  MAP_COLS,
  MAP_ROWS,
} from "./defaultOfficeMap";
import { DESK_POSITIONS } from "./deskPositions";
import { ttFrame } from "./assets";
import type { OfficeSceneController } from "./OfficeSceneController";

const CELL = 4; // SVG cell size
const VIEW_W = MAP_COLS * CELL; // 120
const VIEW_H = MAP_ROWS * CELL; // 80

const WALL_TOP = ttFrame(3, 3);
const WALL_MID = ttFrame(4, 3);
const WALL_BOT = ttFrame(0, 4);
const PATH_DARK = ttFrame(2, 0);
const DOOR = ttFrame(5, 5);

function tileColor(frame: number): string {
  if (frame === WALL_TOP || frame === WALL_MID) return "#9a3a3a";
  if (frame === WALL_BOT) return "#5a5d66";
  if (frame === PATH_DARK) return "#c9c9cf";
  if (frame === DOOR) return "#f1d27a";
  // FLOOR 등
  return "#e6dfd0";
}

const ACTIVE_STATUS_BORDER: Record<AgentStatus, string> = {
  idle: "#b8bcc6",
  thinking: "#3182f6",
  analyzing: "#7d6bff",
  debating: "#f04452",
  deciding: "#a855f7",
  done: "#2fca73",
};

interface Props {
  controller: OfficeSceneController | null;
  thoughts?: ReadonlyArray<AgentThought>;
}

interface Viewport {
  x: number; // SVG coord
  y: number;
  w: number;
  h: number;
}

export function Minimap({ controller, thoughts }: Props) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const rafRef = useRef<number | null>(null);

  // 카메라 정보 폴링 (60fps requestAnimationFrame, 컨트롤러 변경 시 정리)
  useEffect(() => {
    if (!controller) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const info = controller.getCameraInfo();
      if (info.worldWidth > 0 && info.worldHeight > 0) {
        setViewport({
          x: (info.scrollX / info.worldWidth) * VIEW_W,
          y: (info.scrollY / info.worldHeight) * VIEW_H,
          w: (info.viewWidth / info.worldWidth) * VIEW_W,
          h: (info.viewHeight / info.worldHeight) * VIEW_H,
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [controller]);

  // role → status 맵 (마지막 thought 채택)
  const statusByRole: Partial<Record<AgentRole, AgentStatus>> = {};
  if (thoughts) {
    for (const t of thoughts) {
      statusByRole[t.role] = t.status;
    }
  }

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!controller) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const sy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const info = controller.getCameraInfo();
    const worldX = (sx / VIEW_W) * info.worldWidth;
    const worldY = (sy / VIEW_H) * info.worldHeight;
    controller.panCameraTo(worldX, worldY);
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        zIndex: 5,
        background: "rgba(255,255,255,0.92)",
        border: "1px solid var(--border-subtle, #d6d8dd)",
        borderRadius: 6,
        padding: 4,
        pointerEvents: "auto",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <svg
        width={VIEW_W}
        height={VIEW_H}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ display: "block", cursor: "pointer" }}
        onClick={handleClick}
        aria-label="미니맵"
      >
        {/* 타일 */}
        {DEFAULT_OFFICE_LAYOUT.map((row, r) =>
          row.map((frame, c) => (
            <rect
              key={`${r}-${c}`}
              x={c * CELL}
              y={r * CELL}
              width={CELL}
              height={CELL}
              fill={tileColor(frame)}
            />
          )),
        )}
        {/* 책상 도트 */}
        {Object.entries(DESK_POSITIONS).map(([role, pos]) => {
          const status = statusByRole[role as AgentRole] ?? "idle";
          const cx = pos.col * CELL + CELL / 2;
          const cy = pos.row * CELL + CELL / 2;
          return (
            <circle
              key={role}
              cx={cx}
              cy={cy}
              r={CELL * 0.7}
              fill={AGENT_COLOR[role as AgentRole]}
              stroke={ACTIVE_STATUS_BORDER[status]}
              strokeWidth={1}
            />
          );
        })}
        {/* 카메라 뷰포트 */}
        {viewport && (
          <rect
            x={viewport.x}
            y={viewport.y}
            width={viewport.w}
            height={viewport.h}
            fill="rgba(49,130,246,0.12)"
            stroke="#3182f6"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}

export default Minimap;

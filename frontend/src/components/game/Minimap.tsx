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
import { ROOM_ZONES } from "./RoomLabels";
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
  visibleRoles?: ReadonlyArray<AgentRole>;
}

interface SeatDot {
  role: AgentRole;
  /** SVG 좌표. */
  x: number;
  y: number;
}

interface ZoneRect {
  name: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Phase 4: world픽셀을 minimap SVG 픽셀로 환산. SCREEN_TILE=32 → CELL=4, ratio=1/8. */
const WORLD_TO_SVG = CELL / 32;

export function Minimap({ controller, thoughts, visibleRoles }: Props) {
  const [seatDots, setSeatDots] = useState<SeatDot[]>([]);
  const [zoneRects, setZoneRects] = useState<ZoneRect[]>([]);
  const rafRef = useRef<number | null>(null);
  // 카메라 뷰포트 SVG <rect> — React state 없이 setAttribute로 직접 갱신.
  const viewportRef = useRef<SVGRectElement | null>(null);

  // 컬트롤러 준비 시 좌석/존 스냅샷 (1회).
  useEffect(() => {
    if (!controller) {
      setSeatDots([]);
      setZoneRects([]);
      return;
    }
    const seats = controller.getSeats();
    setSeatDots(
      seats.map((s) => ({
        role: s.role,
        x: s.x * WORLD_TO_SVG,
        y: s.y * WORLD_TO_SVG,
      })),
    );
    const zones = controller.getZones();
    setZoneRects(
      zones.map((z) => ({
        name: z.name,
        color: `#${z.color.toString(16).padStart(6, "0")}`,
        x: z.x * WORLD_TO_SVG,
        y: z.y * WORLD_TO_SVG,
        w: z.w * WORLD_TO_SVG,
        h: z.h * WORLD_TO_SVG,
      })),
    );
  }, [controller]);

  // 카메라 뷰포트 갱신 — imperative DOM mutation. setState 없음, React reconciliation 0회.
  // 30fps로 throttle (미니맵엔 충분히 부드러움, CPU 절반).
  useEffect(() => {
    if (!controller) return;
    let cancelled = false;
    let lastX = NaN;
    let lastY = NaN;
    let lastW = NaN;
    let lastH = NaN;
    let lastTickTime = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastTickTime < 33) return;
      lastTickTime = now;
      const rect = viewportRef.current;
      if (!rect) return;
      const info = controller.getCameraInfo();
      if (!info || info.worldWidth <= 0 || info.worldHeight <= 0) {
        if (rect.style.display !== "none") rect.style.display = "none";
        return;
      }
      const x = (info.scrollX / info.worldWidth) * VIEW_W;
      const y = (info.scrollY / info.worldHeight) * VIEW_H;
      const w = (info.viewWidth / info.worldWidth) * VIEW_W;
      const h = (info.viewHeight / info.worldHeight) * VIEW_H;
      // 동일값이면 attr 생략 (DOM write 최소화).
      if (x !== lastX) { rect.setAttribute("x", String(x)); lastX = x; }
      if (y !== lastY) { rect.setAttribute("y", String(y)); lastY = y; }
      if (w !== lastW) { rect.setAttribute("width", String(w)); lastW = w; }
      if (h !== lastH) { rect.setAttribute("height", String(h)); lastH = h; }
      if (rect.style.display === "none") rect.style.display = "";
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
  const rolesToDraw =
    visibleRoles && visibleRoles.length > 0
      ? visibleRoles
      : (Object.keys(DESK_POSITIONS) as AgentRole[]);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!controller) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const sy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const info = controller.getCameraInfo();
    if (!info) return;
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
        {/* 룸 구획 — v2 layout 좌잔 우선, 폴백으로 ROOM_ZONES. */}
        {(zoneRects.length > 0
          ? zoneRects.map((z) => (
              <rect
                key={z.name}
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                fill={z.color}
                opacity={0.18}
              />
            ))
          : ROOM_ZONES.map((zone) => (
              <rect
                key={zone.name}
                x={zone.col0 * CELL}
                y={zone.row0 * CELL}
                width={(zone.col1 - zone.col0 + 1) * CELL}
                height={(zone.row1 - zone.row0 + 1) * CELL}
                fill={`#${zone.color.toString(16).padStart(6, "0")}`}
                opacity={0.18}
              />
            )))}
        {/* 책상 도트 — v2 seats 우선, 폴백으로 DESK_POSITIONS. */}
        {seatDots.length > 0
          ? seatDots
              .filter((s) =>
                rolesToDraw.length === 0 ? true : rolesToDraw.includes(s.role),
              )
              .map((seat) => {
                const status = statusByRole[seat.role] ?? "idle";
                const isActive =
                  status === "thinking" ||
                  status === "analyzing" ||
                  status === "debating" ||
                  status === "deciding";
                // 펄스: CSS 키프레임으로 백그라운드 처리. JS rAF/setState 없음.
                return (
                  <circle
                    key={seat.role}
                    cx={seat.x}
                    cy={seat.y}
                    r={CELL * 0.7}
                    fill={AGENT_COLOR[seat.role]}
                    stroke={ACTIVE_STATUS_BORDER[status]}
                    strokeWidth={isActive ? 1.5 : 1}
                    className={isActive ? "ktt-minimap-pulse" : undefined}
                    style={
                      isActive
                        ? {
                            transformBox: "fill-box",
                            transformOrigin: "center",
                          }
                        : undefined
                    }
                  />
                );
              })
          : rolesToDraw.map((role) => {
              const pos = DESK_POSITIONS[role];
              const status = statusByRole[role] ?? "idle";
              const cx = pos.col * CELL + CELL / 2;
              const cy = pos.row * CELL + CELL / 2;
              return (
                <circle
                  key={role}
                  cx={cx}
                  cy={cy}
                  r={CELL * 0.7}
                  fill={AGENT_COLOR[role]}
                  stroke={ACTIVE_STATUS_BORDER[status]}
                  strokeWidth={1}
                />
              );
            })}
        {/* 카메라 뷰포트 — ref로 imperative 갱신 (rAF에서 setAttribute). */}
        <rect
          ref={viewportRef}
          x={0}
          y={0}
          width={0}
          height={0}
          fill="rgba(49,130,246,0.12)"
          stroke="#3182f6"
          strokeWidth={1}
          pointerEvents="none"
          style={{ display: "none" }}
        />
      </svg>
    </div>
  );
}

export default Minimap;

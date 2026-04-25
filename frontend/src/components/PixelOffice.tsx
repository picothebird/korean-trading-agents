"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought, AgentRole } from "@/types";

// ── Canvas dimensions ──────────────────────────────────────────────
const W = 620;
const H = 390;
const S = 2; // 1 "art pixel" = 2×2 canvas pixels

// ── Agent workspace configuration ─────────────────────────────────
interface AgentMeta {
  x: number;      // canvas center-x of character
  y: number;      // canvas y of character feet
  label: string;  // Korean display name
  layer: 1 | 2 | 3;
  accent: string; // accent/status color
  hair: string;
  shirt: string;
  pants: string;
  desk: boolean;
}

const AGENTS: Record<AgentRole, AgentMeta> = {
  technical_analyst:   { x: 90,  y: 150, label: "기술분석가",       layer: 1, accent: "#3182F6", hair: "#3c1e0e", shirt: "#1a3d7c", pants: "#18203a", desk: true },
  fundamental_analyst: { x: 250, y: 150, label: "펀더멘털",         layer: 1, accent: "#A855F7", hair: "#0e0e0e", shirt: "#5a1e7c", pants: "#10102a", desk: true },
  sentiment_analyst:   { x: 90,  y: 300, label: "감성분석가",       layer: 1, accent: "#F5A623", hair: "#7a5800", shirt: "#882e00", pants: "#18101e", desk: true },
  macro_analyst:       { x: 250, y: 300, label: "매크로",           layer: 1, accent: "#2FCA73", hair: "#b4b4b4", shirt: "#0a5e28", pants: "#121212", desk: true },
  bull_researcher:     { x: 430, y: 320, label: "강세 연구원",      layer: 2, accent: "#F04452", hair: "#3e2008", shirt: "#6e0c0c", pants: "#080a12", desk: false },
  bear_researcher:     { x: 510, y: 320, label: "약세 연구원",      layer: 2, accent: "#2B7EF5", hair: "#060606", shirt: "#0c1e56", pants: "#04040c", desk: false },
  risk_manager:        { x: 430, y: 250, label: "리스크 매니저",    layer: 3, accent: "#F5A623", hair: "#140808", shirt: "#6e4e00", pants: "#0c0c0c", desk: true },
  portfolio_manager:   { x: 510, y: 110, label: "포트폴리오 매니저", layer: 3, accent: "#3182F6", hair: "#585858", shirt: "#bcc4cc", pants: "#1e1e2e", desk: false },
  guru_agent:          { x: 560, y: 220, label: "GURU",            layer: 3, accent: "#7D6BFF", hair: "#f2f2f2", shirt: "#3f2c8f", pants: "#17192e", desk: true },
};

const LAYER_1_ROLES: AgentRole[] = [
  "technical_analyst",
  "fundamental_analyst",
  "sentiment_analyst",
  "macro_analyst",
];

const LAYER_2_ROLES: AgentRole[] = ["bull_researcher", "bear_researcher"];
const LAYER_3_ROLES: AgentRole[] = ["risk_manager", "portfolio_manager", "guru_agent"];

const TILE = 20;
const TILE_CENTER_OFFSET = 10;

type SceneZone = "office" | "meeting" | "exchange";

interface Point {
  x: number;
  y: number;
}

interface RoleSceneTargets {
  home: Point;
  investigate: Point;
  debate: Point;
  report: Point;
  decide: Point;
  execute: Point;
}

interface ActorRuntimeState {
  x: number;
  y: number;
  path: Point[];
  targetKey: string;
  walkPhase: number;
  moving: boolean;
}

function snapToTileCenter(v: number): number {
  return Math.round((v - TILE_CENTER_OFFSET) / TILE) * TILE + TILE_CENTER_OFFSET;
}

function snapPoint(x: number, y: number): Point {
  return { x: snapToTileCenter(x), y: snapToTileCenter(y) };
}

function tileCol(x: number): number {
  return Math.round((x - TILE_CENTER_OFFSET) / TILE);
}

function tileRow(y: number): number {
  return Math.round((y - TILE_CENTER_OFFSET) / TILE);
}

function fromTileCol(col: number): number {
  return col * TILE + TILE_CENTER_OFFSET;
}

function fromTileRow(row: number): number {
  return row * TILE + TILE_CENTER_OFFSET;
}

const ROOM_WAYPOINTS = {
  office_to_exchange: snapPoint(370, 130),
  office_to_meeting: snapPoint(370, 290),
  exchange_to_meeting: snapPoint(470, 170),
};

const ROLE_SCENE_TARGETS: Record<AgentRole, RoleSceneTargets> = {
  technical_analyst: {
    home: snapPoint(90, 150),
    investigate: snapPoint(90, 150),
    debate: snapPoint(390, 260),
    report: snapPoint(390, 300),
    decide: snapPoint(390, 300),
    execute: snapPoint(90, 150),
  },
  fundamental_analyst: {
    home: snapPoint(250, 150),
    investigate: snapPoint(250, 150),
    debate: snapPoint(430, 260),
    report: snapPoint(430, 300),
    decide: snapPoint(430, 300),
    execute: snapPoint(250, 150),
  },
  sentiment_analyst: {
    home: snapPoint(90, 300),
    investigate: snapPoint(90, 300),
    debate: snapPoint(470, 260),
    report: snapPoint(470, 300),
    decide: snapPoint(470, 300),
    execute: snapPoint(90, 300),
  },
  macro_analyst: {
    home: snapPoint(250, 300),
    investigate: snapPoint(250, 300),
    debate: snapPoint(510, 260),
    report: snapPoint(510, 300),
    decide: snapPoint(510, 300),
    execute: snapPoint(250, 300),
  },
  bull_researcher: {
    home: snapPoint(430, 320),
    investigate: snapPoint(390, 300),
    debate: snapPoint(430, 320),
    report: snapPoint(430, 260),
    decide: snapPoint(450, 260),
    execute: snapPoint(470, 120),
  },
  bear_researcher: {
    home: snapPoint(510, 320),
    investigate: snapPoint(510, 300),
    debate: snapPoint(510, 320),
    report: snapPoint(510, 260),
    decide: snapPoint(470, 260),
    execute: snapPoint(490, 120),
  },
  risk_manager: {
    home: snapPoint(430, 250),
    investigate: snapPoint(430, 280),
    debate: snapPoint(450, 330),
    report: snapPoint(450, 280),
    decide: snapPoint(450, 250),
    execute: snapPoint(470, 120),
  },
  portfolio_manager: {
    home: snapPoint(510, 110),
    investigate: snapPoint(490, 280),
    debate: snapPoint(490, 330),
    report: snapPoint(490, 280),
    decide: snapPoint(490, 250),
    execute: snapPoint(510, 110),
  },
  guru_agent: {
    home: snapPoint(560, 220),
    investigate: snapPoint(520, 280),
    debate: snapPoint(530, 330),
    report: snapPoint(530, 280),
    decide: snapPoint(530, 230),
    execute: snapPoint(530, 120),
  },
};

function getZoneFromPoint(p: Point): SceneZone {
  if (p.x >= 360 && p.y < 160) return "exchange";
  if (p.x >= 360) return "meeting";
  return "office";
}

function buildAxisPath(from: Point, to: Point): Point[] {
  const path: Point[] = [];
  let col = tileCol(from.x);
  let row = tileRow(from.y);
  const targetCol = tileCol(to.x);
  const targetRow = tileRow(to.y);

  while (col !== targetCol) {
    col += Math.sign(targetCol - col);
    path.push({ x: fromTileCol(col), y: fromTileRow(row) });
  }

  while (row !== targetRow) {
    row += Math.sign(targetRow - row);
    path.push({ x: fromTileCol(col), y: fromTileRow(row) });
  }

  return path;
}

function buildRoutedPath(from: Point, to: Point): Point[] {
  const sourceZone = getZoneFromPoint(from);
  const targetZone = getZoneFromPoint(to);
  const routeWaypoints: Point[] = [];

  if (sourceZone !== targetZone) {
    if (sourceZone === "office" && targetZone === "exchange") {
      routeWaypoints.push(ROOM_WAYPOINTS.office_to_exchange);
    } else if (sourceZone === "office" && targetZone === "meeting") {
      routeWaypoints.push(ROOM_WAYPOINTS.office_to_meeting);
    } else if (sourceZone === "exchange" && targetZone === "office") {
      routeWaypoints.push(ROOM_WAYPOINTS.office_to_exchange);
    } else if (sourceZone === "meeting" && targetZone === "office") {
      routeWaypoints.push(ROOM_WAYPOINTS.office_to_meeting);
    } else {
      routeWaypoints.push(ROOM_WAYPOINTS.exchange_to_meeting);
    }
  }

  const points: Point[] = [];
  let cursor = from;
  for (const waypoint of [...routeWaypoints, to]) {
    points.push(...buildAxisPath(cursor, waypoint));
    cursor = waypoint;
  }
  return points;
}

function getTargetForStatus(role: AgentRole, status: string): { key: keyof RoleSceneTargets; point: Point } {
  const roleTargets = ROLE_SCENE_TARGETS[role];

  if (status === "thinking" || status === "analyzing") {
    return { key: "investigate", point: roleTargets.investigate };
  }
  if (status === "debating") {
    return { key: "debate", point: roleTargets.debate };
  }
  if (status === "deciding") {
    return { key: "decide", point: roleTargets.decide };
  }
  if (status === "done") {
    if (role === "portfolio_manager" || role === "risk_manager" || role === "guru_agent") {
      return { key: "execute", point: roleTargets.execute };
    }
    return { key: "report", point: roleTargets.report };
  }
  return { key: "home", point: roleTargets.home };
}

function createInitialActorRuntimeState(): Record<AgentRole, ActorRuntimeState> {
  const state = {} as Record<AgentRole, ActorRuntimeState>;
  for (const role of Object.keys(AGENTS) as AgentRole[]) {
    const home = ROLE_SCENE_TARGETS[role].home;
    state[role] = {
      x: home.x,
      y: home.y,
      path: [],
      targetKey: `${role}:home`,
      walkPhase: 0,
      moving: false,
    };
  }
  return state;
}

// ── Status helpers ─────────────────────────────────────────────────
function isActiveStatus(s: string) {
  return ["thinking", "analyzing", "debating", "deciding"].includes(s);
}

// ── Canvas drawing functions ───────────────────────────────────────

function fillTiledRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tileSize: number,
  c1: string,
  c2: string
) {
  for (let gy = y; gy < y + h; gy += tileSize) {
    for (let gx = x; gx < x + w; gx += tileSize) {
      const light = (((gx - x) / tileSize + (gy - y) / tileSize) % 2 === 0);
      ctx.fillStyle = light ? c1 : c2;
      ctx.fillRect(gx, gy, tileSize, tileSize);

      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(gx, gy, tileSize, 1);
      ctx.fillRect(gx, gy, 1, tileSize);
    }
  }
}

function drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#4d2f1b";
  ctx.fillRect(x, y, 58, 22);
  ctx.fillStyle = "#70462a";
  ctx.fillRect(x + 2, y + 2, 54, 18);
  ctx.fillStyle = "#2d1a0f";
  ctx.fillRect(x + 2, y + 10, 54, 2);
  ctx.fillStyle = "#8f5b2e";
  ctx.fillRect(x, y + 20, 58, 2);

  const bookColors = ["#be4b57", "#4f7ec4", "#a0c65d", "#ece3b8"];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = bookColors[i % bookColors.length];
    ctx.fillRect(x + 5 + i * 6, y + 4, 4, 5);
    ctx.fillRect(x + 5 + i * 6, y + 13, 4, 5);
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#7f8a99";
  ctx.fillRect(x + 3, y + 12, 8, 8);
  ctx.fillStyle = "#90b463";
  ctx.fillRect(x + 5, y + 2, 4, 10);
  ctx.fillRect(x + 2, y + 6, 4, 8);
  ctx.fillRect(x + 8, y + 6, 4, 8);
}

function drawMeetingTable(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#7a5230";
  ctx.fillRect(x - 34, y - 20, 68, 40);
  ctx.fillStyle = "#9a6c40";
  ctx.fillRect(x - 30, y - 16, 60, 32);
  ctx.fillStyle = "#2f1e13";
  ctx.fillRect(x - 34, y + 18, 5, 4);
  ctx.fillRect(x + 29, y + 18, 5, 4);

  // chairs
  ctx.fillStyle = "#8a5a8f";
  ctx.fillRect(x - 45, y - 16, 10, 32);
  ctx.fillRect(x + 35, y - 16, 10, 32);
  ctx.fillStyle = "#b07ab5";
  ctx.fillRect(x - 43, y - 14, 6, 28);
  ctx.fillRect(x + 37, y - 14, 6, 28);
}

function drawExchangeCounter(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#d4cbc3";
  ctx.fillRect(x, y, 86, 18);
  ctx.fillStyle = "#b59c86";
  ctx.fillRect(x + 2, y + 14, 82, 4);
  ctx.fillStyle = "#ece5de";
  ctx.fillRect(x + 2, y + 2, 82, 10);
}

function drawVendingMachine(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#8ea4b7";
  ctx.fillRect(x, y, 36, 46);
  ctx.fillStyle = "#dce8f4";
  ctx.fillRect(x + 3, y + 3, 30, 12);
  ctx.fillStyle = "#4e5f72";
  ctx.fillRect(x + 3, y + 18, 20, 24);
  ctx.fillStyle = "#879bb0";
  ctx.fillRect(x + 24, y + 18, 8, 20);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#cc5a66" : "#5f8ed5";
    ctx.fillRect(x + 5 + i * 6, y + 22, 4, 6);
    ctx.fillRect(x + 5 + i * 6, y + 31, 4, 6);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  // Room floors
  fillTiledRect(ctx, 0, 0, 340, H, 20, "#915f30", "#84562c");       // office wood floor
  fillTiledRect(ctx, 340, 0, W - 340, 160, 20, "#e6ddd5", "#d8cfc8"); // exchange light floor
  fillTiledRect(ctx, 340, 160, W - 340, H - 160, 20, "#5783a9", "#4b7498"); // meeting blue floor

  // Structural walls with door openings
  ctx.fillStyle = "#0d1524";
  ctx.fillRect(336, 0, 8, 106);
  ctx.fillRect(336, 146, 8, 112);
  ctx.fillRect(336, 298, 8, H - 298);
  ctx.fillRect(340, 156, W - 340, 8);

  // Door thresholds
  ctx.fillStyle = "rgba(20, 24, 34, 0.5)";
  ctx.fillRect(340, 106, 12, 40); // office <-> exchange
  ctx.fillRect(340, 258, 12, 40); // office <-> meeting
  ctx.fillRect(462, 156, 40, 8);  // exchange <-> meeting

  // Room furniture
  drawBookshelf(ctx, 22, 22);
  drawBookshelf(ctx, 170, 22);
  drawBookshelf(ctx, 354, 224);
  drawBookshelf(ctx, 500, 224);
  drawBookshelf(ctx, 354, 44);

  drawPlant(ctx, 18, 318);
  drawPlant(ctx, 300, 318);
  drawPlant(ctx, 430, 225);
  drawPlant(ctx, 560, 225);

  drawMeetingTable(ctx, 470, 300);
  drawExchangeCounter(ctx, 510, 34);
  drawVendingMachine(ctx, 350, 16);

  // small devices in exchange room
  ctx.fillStyle = "#a9b8c8";
  ctx.fillRect(430, 28, 20, 28); // water dispenser
  ctx.fillStyle = "#dbe5ef";
  ctx.fillRect(434, 24, 12, 8);
  ctx.fillStyle = "#6a7c91";
  ctx.fillRect(438, 38, 4, 6);

  ctx.fillStyle = "#7a8796";
  ctx.fillRect(470, 52, 10, 12); // trash can
  ctx.fillStyle = "#5b6674";
  ctx.fillRect(470, 52, 10, 2);

  // Room titles / stage labels
  ctx.font = "bold 10px 'VT323', 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillStyle = "rgba(236,225,194,0.88)";
  ctx.fillText("RESEARCH FLOOR", 10, 8);

  ctx.fillStyle = "rgba(76,115,160,0.9)";
  ctx.fillText("EXCHANGE", 346, 6);

  ctx.fillStyle = "rgba(215,225,255,0.95)";
  ctx.fillText("MEETING ROOM", 346, 166);

  // Process pipeline hint
  ctx.fillStyle = "rgba(225, 233, 255, 0.74)";
  ctx.font = "bold 9px 'VT323', 'Courier New', monospace";
  ctx.fillText("INVESTIGATE -> DEBATE -> REPORT -> DECIDE -> EXCHANGE", 10, H - 12);
}

function drawDesk(
  ctx: CanvasRenderingContext2D,
  cx: number,
  charY: number,
  accent: string,
  isActive: boolean,
  frame: number
) {
  const deskW = 60;
  const deskH = 16;
  const deskX = cx - deskW / 2;
  const deskY = charY - 12;

  // Drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(deskX + 3, deskY + deskH + 3, deskW - 6, 5);

  // Desk body (sides)
  ctx.fillStyle = "#261a0e";
  ctx.fillRect(deskX, deskY + deskH, deskW, 5);

  // Desk top surface
  ctx.fillStyle = "#362818";
  ctx.fillRect(deskX, deskY, deskW, deskH);

  // Desk top highlight
  ctx.fillStyle = "#422e1a";
  ctx.fillRect(deskX, deskY, deskW, 1);
  ctx.fillStyle = "#2e1e0e";
  ctx.fillRect(deskX, deskY + deskH - 1, deskW, 1);

  // Monitor stand
  ctx.fillStyle = "#141420";
  ctx.fillRect(cx - 2, deskY - 16, 4, 16);

  // Monitor base
  ctx.fillStyle = "#1a1a26";
  ctx.fillRect(cx - 7, deskY - 2, 14, 3);

  // Monitor body
  const monW = 30;
  const monH = 18;
  const monX = cx - monW / 2;
  const monY = deskY - 16 - monH;

  ctx.fillStyle = "#10101c";
  ctx.fillRect(monX, monY, monW, monH);

  // Monitor bezel
  ctx.fillStyle = "#0c0c18";
  ctx.fillRect(monX, monY, monW, 1);
  ctx.fillRect(monX, monY, 1, monH);

  // Monitor screen glow
  if (isActive) {
    const pulse = 0.6 + 0.4 * Math.sin(frame * 0.1);
    const glowAlpha = Math.round(pulse * 60).toString(16).padStart(2, "0");
    ctx.fillStyle = accent + glowAlpha;
    ctx.fillRect(monX + 2, monY + 2, monW - 4, monH - 4);

    // Scanlines
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    for (let sy = monY + 2; sy < monY + monH - 2; sy += 2) {
      ctx.fillRect(monX + 2, sy, monW - 4, 1);
    }

    // Screen glow halo
    ctx.fillStyle = accent + "18";
    ctx.fillRect(monX - 3, monY - 3, monW + 6, monH + 6);
  } else {
    ctx.fillStyle = "#0e1a18";
    ctx.fillRect(monX + 2, monY + 2, monW - 4, monH - 4);
    // Dim scanlines
    ctx.fillStyle = "rgba(0,255,100,0.04)";
    for (let sy = monY + 2; sy < monY + monH - 2; sy += 2) {
      ctx.fillRect(monX + 2, sy, monW - 4, 1);
    }
  }

  // Keyboard on desk
  ctx.fillStyle = "#1c1c28";
  ctx.fillRect(cx - 16, deskY + 3, 32, 5);
  ctx.fillStyle = "#222236";
  ctx.fillRect(cx - 15, deskY + 4, 30, 3);

  // Chair
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(cx - 11, charY + 2, 22, 7);
  ctx.fillRect(cx - 9, charY + 9, 18, 4);
  ctx.fillStyle = "#141422";
  ctx.fillRect(cx - 11, charY + 13, 4, 5);
  ctx.fillRect(cx + 7, charY + 13, 4, 5);
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  charY: number,
  meta: AgentMeta,
  status: string,
  frame: number
) {
  const isActive = isActiveStatus(status);
  const isDone = status === "done";
  const isDeciding = status === "deciding";
  const isDebating = status === "debating";

  // Bob / typing animation
  const bobSpeed = isActive ? 0.14 : 0.05;
  const bobAmp = isActive ? 1.5 : 0.8;
  const bob = Math.sin(frame * bobSpeed) * bobAmp;
  const y = charY + bob;

  // Deciding glow
  if (isDeciding) {
    const a = Math.round((0.1 + 0.1 * Math.sin(frame * 0.1)) * 255).toString(16).padStart(2, "0");
    ctx.fillStyle = "#F5A623" + a;
    ctx.beginPath();
    ctx.ellipse(cx, y - 10, 26, 42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, charY + 24, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoes
  ctx.fillStyle = "#151020";
  ctx.fillRect(cx - 8, Math.round(y) + 18, 6, 4);
  ctx.fillRect(cx + 2, Math.round(y) + 18, 6, 4);

  // Legs
  ctx.fillStyle = meta.pants;
  ctx.fillRect(cx - 7, Math.round(y) + 6, 5, 13);
  ctx.fillRect(cx + 2, Math.round(y) + 6, 5, 13);

  // Torso
  ctx.fillStyle = meta.shirt;
  ctx.fillRect(cx - S * 5, Math.round(y) - 10, S * 10, S * 9);

  // Collar accent
  ctx.fillStyle = meta.shirt;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(cx - S * 2, Math.round(y) - 11, S * 4, S * 2);
  ctx.globalAlpha = 1;

  // Arms — typing animation when active
  const armBounce = isActive
    ? Math.round(Math.sin(frame * 0.22 + (meta.x * 0.1)) * 3) // per-character phase offset
    : 0;
  const armY = Math.round(y) - 8;
  const armBouncedY = armY + armBounce;

  ctx.fillStyle = meta.shirt;
  // Left arm
  ctx.fillRect(cx - S * 8, armBouncedY, S * 3, S * 5);
  // Right arm
  ctx.fillRect(cx + S * 5, armBouncedY, S * 3, S * 5);

  // Hands (skin color)
  ctx.fillStyle = "#c8905a";
  ctx.fillRect(cx - S * 8, armBouncedY + S * 4, S * 3, S * 2);
  ctx.fillRect(cx + S * 5, armBouncedY + S * 4, S * 3, S * 2);

  // Neck
  ctx.fillStyle = "#c8905a";
  ctx.fillRect(cx - S * 2, Math.round(y) - 13, S * 4, S * 4);

  // Head
  ctx.fillStyle = "#c8905a";
  ctx.fillRect(cx - S * 5, Math.round(y) - 24, S * 10, S * 11);

  // Hair
  ctx.fillStyle = meta.hair;
  ctx.fillRect(cx - S * 5, Math.round(y) - 27, S * 10, S * 5);
  ctx.fillRect(cx - S * 6, Math.round(y) - 25, S * 2, S * 3);
  ctx.fillRect(cx + S * 4, Math.round(y) - 25, S * 2, S * 3);

  // Eyes
  ctx.fillStyle = "#1a1a1a";
  const eyeY = Math.round(y) - 20;
  if (isDone) {
    // Happy squint (thin line)
    ctx.fillRect(cx - S * 3, eyeY + S, S * 2, S);
    ctx.fillRect(cx + S, eyeY + S, S * 2, S);
  } else if (isDeciding) {
    // Wide eyes
    ctx.fillRect(cx - S * 3, eyeY - S, S * 3, S * 3);
    ctx.fillRect(cx + S, eyeY - S, S * 3, S * 3);
    // Eye whites
    ctx.fillStyle = "#e8e0d0";
    ctx.fillRect(cx - S * 2, eyeY - S + 1, S, S * 2);
    ctx.fillRect(cx + S * 2, eyeY - S + 1, S, S * 2);
  } else {
    ctx.fillRect(cx - S * 3, eyeY, S * 2, S * 2);
    ctx.fillRect(cx + S, eyeY, S * 2, S * 2);
  }

  // Eyebrow (more expressive when active)
  if (isActive) {
    ctx.fillStyle = meta.hair;
    ctx.fillRect(cx - S * 3, eyeY - S * 2, S * 2, S);
    ctx.fillRect(cx + S, eyeY - S * 2, S * 2, S);
  }

  // Mouth expression
  ctx.fillStyle = "#8a4020";
  if (isDebating || isDeciding) {
    // Open mouth
    ctx.fillRect(cx - S * 2, Math.round(y) - 15, S * 4, S * 2);
    ctx.fillStyle = "#1a0808";
    ctx.fillRect(cx - S, Math.round(y) - 15 + S, S * 2, S);
  } else if (isDone) {
    // Smile
    ctx.fillRect(cx - S * 2, Math.round(y) - 15, S * 4, S);
    ctx.fillRect(cx - S * 2, Math.round(y) - 14, S, S);
    ctx.fillRect(cx + S, Math.round(y) - 14, S, S);
  } else {
    // Neutral
    ctx.fillRect(cx - S, Math.round(y) - 15, S * 2, S);
  }

  // ── Status decorations ────────────────────────────────────────

  // Done: green ✓ icon
  if (isDone) {
    ctx.fillStyle = "#2FCA73";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✓", cx, Math.round(y) - 36);
  }

  // Thinking: typing indicator dots above
  if (status === "thinking" || status === "analyzing") {
    const dotPhase = (frame * 0.08) % 1;
    for (let d = 0; d < 3; d++) {
      const dotAlpha = Math.max(0, Math.sin((dotPhase + d * 0.33) * Math.PI * 2));
      ctx.fillStyle = `rgba(${hexToRgb(meta.accent)}, ${(0.3 + dotAlpha * 0.7).toFixed(2)})`;
      ctx.fillRect(cx - 5 + d * 5, Math.round(y) - 36, 3, 3);
    }
  }
}

// Helper: hex color to rgb components string
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  charY: number,
  label: string,
  accent: string,
  status: string
) {
  const isDone = status === "done";
  const isActive = isActiveStatus(status);

  ctx.font = "bold 9px 'VT323', 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Label background pill
  const metrics = ctx.measureText(label);
  const lw = metrics.width + 12;
  const lh = 12;
  const lx = cx - lw / 2;
  const ly = charY + 28;

  ctx.fillStyle = isDone
    ? "rgba(47,202,115,0.18)"
    : isActive
    ? (accent + "28")
    : "rgba(20,21,24,0.85)";
  ctx.fillRect(lx, ly, lw, lh);

  ctx.fillStyle = isDone ? "#2FCA73" : isActive ? accent : "#4E5867";
  ctx.fillText(label, cx, ly + 2);
}

// ── PixelOffice component ──────────────────────────────────────────

interface PixelOfficeProps {
  thoughts: Map<AgentRole, AgentThought>;
  activeAgents: Set<AgentRole>;
}

const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.35 };

export function PixelOffice({ thoughts, activeAgents }: PixelOfficeProps) {
  const [overlayTick, setOverlayTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const thoughtsRef = useRef(thoughts);
  const activeRef = useRef(activeAgents);
  const actorStatesRef = useRef<Record<AgentRole, ActorRuntimeState>>(createInitialActorRuntimeState());
  const lastFrameTimeRef = useRef<number>(0);

  // Keep refs in sync without re-triggering effect
  thoughtsRef.current = thoughts;
  activeRef.current = activeAgents;

  const render = useCallback(function tick() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    frameRef.current++;
    const frame = frameRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const last = lastFrameTimeRef.current || now;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    lastFrameTimeRef.current = now;

    const currentThoughts = thoughtsRef.current;
    const currentActive = activeRef.current;
    const actors = actorStatesRef.current;

    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx);

    // Draw all agents with tile-based routed movement
    for (const [roleStr, meta] of Object.entries(AGENTS)) {
      const role = roleStr as AgentRole;
      const thought = currentThoughts.get(role);
      const isActive = currentActive.has(role);
      const status = thought?.status ?? "idle";
      const target = getTargetForStatus(role, status);
      const actor = actors[role];
      const targetKey = `${role}:${target.key}`;

      if (actor.targetKey !== targetKey) {
        actor.path = buildRoutedPath({ x: actor.x, y: actor.y }, target.point);
        actor.targetKey = targetKey;
      }

      const speed = isActiveStatus(status) ? 96 : 64;
      let remainingDistance = speed * dt;
      let movedDistance = 0;

      while (remainingDistance > 0 && actor.path.length > 0) {
        const nextPoint = actor.path[0];
        const dx = nextPoint.x - actor.x;
        const dy = nextPoint.y - actor.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.001) {
          actor.x = nextPoint.x;
          actor.y = nextPoint.y;
          actor.path.shift();
          continue;
        }

        if (dist <= remainingDistance) {
          actor.x = nextPoint.x;
          actor.y = nextPoint.y;
          actor.path.shift();
          remainingDistance -= dist;
          movedDistance += dist;
          continue;
        }

        const ux = dx / dist;
        const uy = dy / dist;
        actor.x += ux * remainingDistance;
        actor.y += uy * remainingDistance;
        movedDistance += remainingDistance;
        remainingDistance = 0;
      }

      actor.moving = movedDistance > 0.01;
      if (actor.moving) {
        actor.walkPhase += dt * 10;
      }

      if (meta.desk) {
        drawDesk(ctx, meta.x, meta.y, meta.accent, isActive, frame);
      }
      drawCharacter(ctx, actor.x, actor.y, meta, status, frame + actor.walkPhase);
      drawLabel(ctx, actor.x, actor.y, meta.label, meta.accent, status);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  useEffect(() => {
    const timer = setInterval(() => {
      setOverlayTick((v) => v + 1);
    }, 120);
    return () => clearInterval(timer);
  }, []);

  // Build speech bubbles from active agents
  const speechBubbles = Array.from(Object.entries(AGENTS)).map(([roleStr, meta]) => {
    const role = roleStr as AgentRole;
    const thought = thoughts.get(role);
    const actor = actorStatesRef.current[role];
    const isActive = activeAgents.has(role);
    const hasContent = thought?.content && thought.content.trim().length > 0;
    const shouldShow = isActive && hasContent && thought?.status !== "done" && thought?.status !== "idle";

    return {
      role,
      meta,
      thought,
      shouldShow,
      anchorX: actor?.x ?? meta.x,
      anchorY: actor?.y ?? meta.y,
    };
  });

  const countDoneInLayer = (roles: AgentRole[]) => {
    return roles.filter((r) => thoughts.get(r)?.status === "done").length;
  };

  const layerMetrics = [
    { key: "data", label: "DATA", color: "#58A6FF", done: countDoneInLayer(LAYER_1_ROLES), total: LAYER_1_ROLES.length },
    { key: "debate", label: "DEBATE", color: "#BC8CFF", done: countDoneInLayer(LAYER_2_ROLES), total: LAYER_2_ROLES.length },
    { key: "decision", label: "DECISION", color: "#E3B341", done: countDoneInLayer(LAYER_3_ROLES), total: LAYER_3_ROLES.length },
  ];

  const totalDone = Array.from(thoughts.values()).filter((t) => t.status === "done").length;
  const activeLabels = Array.from(activeAgents)
    .map((role) => AGENTS[role]?.label ?? role)
    .slice(0, 4);

  return (
    <div
      data-overlay-tick={overlayTick}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        aspectRatio: `${W} / ${H}`,
        maxWidth: "100%",
        maxHeight: "100%",
        margin: "0 auto",
        background: "linear-gradient(180deg, #121523 0%, #171a2d 100%)",
        border: "2px solid rgba(145,133,255,0.28)",
        borderRadius: 4,
        boxShadow: "3px 3px 0 rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* CRT scanline overlay for retro monitoring feel */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 3px)",
          opacity: 0.26,
          zIndex: 2,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          top: 8,
          zIndex: 18,
          pointerEvents: "none",
          fontFamily: "'VT323', 'Press Start 2P', monospace",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          {layerMetrics.map((metric) => {
            const pct = Math.round((metric.done / metric.total) * 100);
            return (
              <div
                key={metric.key}
                style={{
                  background: "rgba(11,13,22,0.9)",
                  border: `1px solid ${metric.color}66`,
                  padding: "4px 6px",
                  borderRadius: 2,
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
                }}
              >
                <p style={{ margin: 0, fontSize: 9, color: metric.color, letterSpacing: "0.08em" }}>{metric.label}</p>
                <p style={{ margin: 0, marginTop: 1, fontSize: 10, color: "rgba(236,240,255,0.92)" }}>
                  {metric.done}/{metric.total} ({pct}%)
                </p>
              </div>
            );
          })}
          <div
            style={{
              background: "rgba(11,13,22,0.9)",
              border: "1px solid rgba(151,242,193,0.6)",
              padding: "4px 6px",
              borderRadius: 2,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
            }}
          >
            <p style={{ margin: 0, fontSize: 9, color: "#97F2C1", letterSpacing: "0.08em" }}>ACTIVE</p>
            <p style={{ margin: 0, marginTop: 1, fontSize: 10, color: "rgba(236,240,255,0.92)" }}>
              {activeAgents.size} / DONE {totalDone}
            </p>
          </div>
        </div>
      </div>

      {activeLabels.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            bottom: 8,
            zIndex: 18,
            pointerEvents: "none",
            background: "rgba(10,11,18,0.9)",
            border: "1px solid rgba(151,242,193,0.35)",
            borderRadius: 2,
            padding: "4px 6px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexWrap: "wrap",
            fontFamily: "'VT323', 'Press Start 2P', monospace",
          }}
        >
          <span style={{ fontSize: 9, color: "#97F2C1", letterSpacing: "0.08em" }}>RUNNING</span>
          {activeLabels.map((label) => (
            <span
              key={label}
              style={{
                fontSize: 9,
                color: "rgba(226,233,255,0.88)",
                padding: "1px 4px",
                border: "1px solid rgba(128,139,170,0.45)",
                borderRadius: 2,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Speech bubbles */}
      <AnimatePresence>
        {speechBubbles.map(({ role, meta, thought, shouldShow, anchorX, anchorY }) => {
          if (!shouldShow || !thought) return null;

          // Clamp bubble in logical canvas coordinates so edge clipping does not happen after responsive scaling.
          const bubbleW = 170;
          const bubbleH = 68;
          const bubbleX = Math.max(8, Math.min(W - bubbleW - 8, anchorX - bubbleW / 2));
          const bubbleY = Math.max(8, Math.min(H - bubbleH - 10, anchorY - 82));
          const xPct = (bubbleX / W) * 100;
          const yPct = (bubbleY / H) * 100;

          const truncated = thought.content.length > 120
            ? thought.content.slice(0, 117) + "..."
            : thought.content;

          const statusLabel: Record<string, string> = {
            thinking: "생각 중",
            analyzing: "분석 중",
            debating: "토론 중",
            deciding: "결정 중",
          };

          return (
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.92 }}
              transition={SPRING}
              style={{
                position: "absolute",
                left: `${xPct}%`,
                top: `${yPct}%`,
                zIndex: 16,
                width: bubbleW,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  background: "rgba(17,19,30,0.98)",
                  border: `1px solid ${meta.accent}50`,
                  borderRadius: 2,
                  padding: "6px 8px",
                  boxShadow: `2px 2px 0 rgba(0,0,0,0.5), 0 0 0 1px ${meta.accent}25`,
                  fontFamily: "'VT323', 'Press Start 2P', monospace",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: meta.accent,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: meta.accent,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.label}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.35)",
                      marginLeft: "auto",
                    }}
                  >
                    {statusLabel[thought.status] ?? thought.status}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 10,
                    color: "rgba(234,237,242,0.75)",
                    lineHeight: 1.35,
                    margin: 0,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {truncated}
                </p>
              </div>

              {/* Pointer arrow */}
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `5px solid ${meta.accent}50`,
                  margin: "0 auto",
                }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Idle overlay hint */}
      {thoughts.size === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(13,15,24,0.88)",
              border: "1px solid rgba(145,133,255,0.36)",
              borderRadius: 2,
              padding: "10px 16px",
              textAlign: "center",
              boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
              fontFamily: "'VT323', 'Press Start 2P', monospace",
            }}
          >
            <p style={{ fontSize: 12, color: "#DCD6FF", marginBottom: 4, letterSpacing: "0.06em" }}>
              PIXEL AGENT OFFICE
            </p>
            <p style={{ fontSize: 10, color: "#A8B4D4" }}>
              분석 시작 시 데이터 수집-토론-결정 흐름을 추적합니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

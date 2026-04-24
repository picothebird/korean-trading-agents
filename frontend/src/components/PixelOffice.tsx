"use client";

import { useEffect, useRef, useCallback } from "react";
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
}

const AGENTS: Record<AgentRole, AgentMeta> = {
  technical_analyst:   { x: 75,  y: 120, label: "기술분석가",     layer: 1, accent: "#3182F6", hair: "#3c1e0e", shirt: "#1a3d7c", pants: "#18203a" },
  fundamental_analyst: { x: 210, y: 120, label: "펀더멘털",       layer: 1, accent: "#A855F7", hair: "#0e0e0e", shirt: "#5a1e7c", pants: "#10102a" },
  sentiment_analyst:   { x: 348, y: 120, label: "감성분석가",     layer: 1, accent: "#F5A623", hair: "#7a5800", shirt: "#882e00", pants: "#18101e" },
  macro_analyst:       { x: 485, y: 120, label: "매크로",         layer: 1, accent: "#2FCA73", hair: "#b4b4b4", shirt: "#0a5e28", pants: "#121212" },
  bull_researcher:     { x: 150, y: 232, label: "강세 연구원",    layer: 2, accent: "#F04452", hair: "#3e2008", shirt: "#6e0c0c", pants: "#080a12" },
  bear_researcher:     { x: 448, y: 232, label: "약세 연구원",    layer: 2, accent: "#2B7EF5", hair: "#060606", shirt: "#0c1e56", pants: "#04040c" },
  risk_manager:        { x: 185, y: 335, label: "리스크 매니저",  layer: 3, accent: "#F5A623", hair: "#140808", shirt: "#6e4e00", pants: "#0c0c0c" },
  portfolio_manager:   { x: 422, y: 335, label: "포트폴리오 매니저", layer: 3, accent: "#3182F6", hair: "#585858", shirt: "#bcc4cc", pants: "#1e1e2e" },
};

// ── Status helpers ─────────────────────────────────────────────────
function isActiveStatus(s: string) {
  return ["thinking", "analyzing", "debating", "deciding"].includes(s);
}

// ── Canvas drawing functions ───────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  // Checkerboard floor
  const ts = 20;
  for (let gy = 0; gy < H; gy += ts) {
    for (let gx = 0; gx < W; gx += ts) {
      const light = (((gx / ts) + (gy / ts)) % 2 === 0);
      ctx.fillStyle = light ? "#111418" : "#131720";
      ctx.fillRect(gx, gy, ts, ts);
    }
  }

  // Layer zone background tints
  const zones = [
    { y: 0, h: 165, color: "rgba(49,130,246,0.03)", label: "LAYER 1 · 데이터 수집", textColor: "#3182F6" },
    { y: 165, h: 115, color: "rgba(168,85,247,0.03)", label: "LAYER 2 · 강세 vs 약세 토론", textColor: "#A855F7" },
    { y: 280, h: 110, color: "rgba(245,166,35,0.03)", label: "LAYER 3 · 리스크 & 최종 결정", textColor: "#F5A623" },
  ];

  for (const zone of zones) {
    ctx.fillStyle = zone.color;
    ctx.fillRect(0, zone.y, W, zone.h);
  }

  // Layer dividers
  const dividers = [
    { y: 165, label: "LAYER 2 · 강세 vs 약세 토론", textColor: "#A855F7" },
    { y: 280, label: "LAYER 3 · 리스크 & 최종 결정", textColor: "#F5A623" },
  ];

  for (const d of dividers) {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, d.y, W, 16);
    ctx.fillStyle = d.textColor;
    ctx.font = "bold 8px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(d.label.toUpperCase(), 8, d.y + 8);
  }

  // Layer 1 label at top
  ctx.fillStyle = "#3182F6";
  ctx.font = "bold 8px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("LAYER 1 · 데이터 수집", 8, 8);

  // Bottom border
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, H - 1, W, 1);
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

  ctx.font = "bold 8px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Label background pill
  const metrics = ctx.measureText(label);
  const lw = metrics.width + 10;
  const lh = 11;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const thoughtsRef = useRef(thoughts);
  const activeRef = useRef(activeAgents);

  // Keep refs in sync without re-triggering effect
  thoughtsRef.current = thoughts;
  activeRef.current = activeAgents;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    frameRef.current++;
    const frame = frameRef.current;
    const currentThoughts = thoughtsRef.current;
    const currentActive = activeRef.current;

    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx);

    // Draw all agents
    for (const [roleStr, meta] of Object.entries(AGENTS)) {
      const role = roleStr as AgentRole;
      const thought = currentThoughts.get(role);
      const isActive = currentActive.has(role);
      const status = thought?.status ?? "idle";

      drawDesk(ctx, meta.x, meta.y, meta.accent, isActive, frame);
      drawCharacter(ctx, meta.x, meta.y, meta, status, frame);
      drawLabel(ctx, meta.x, meta.y, meta.label, meta.accent, status);
    }

    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // Build speech bubbles from active agents
  const speechBubbles = Array.from(Object.entries(AGENTS)).map(([roleStr, meta]) => {
    const role = roleStr as AgentRole;
    const thought = thoughts.get(role);
    const isActive = activeAgents.has(role);
    const hasContent = thought?.content && thought.content.trim().length > 0;
    const shouldShow = isActive && hasContent && thought?.status !== "done" && thought?.status !== "idle";

    return { role, meta, thought, shouldShow };
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        aspectRatio: `${W} / ${H}`,
        maxWidth: "100%",
        maxHeight: "100%",
        margin: "0 auto",
        background: "#0a0c10",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* Speech bubbles */}
      <AnimatePresence>
        {speechBubbles.map(({ role, meta, thought, shouldShow }) => {
          if (!shouldShow || !thought) return null;

          // Clamp bubble in logical canvas coordinates so edge clipping does not happen after responsive scaling.
          const bubbleW = 170;
          const bubbleH = 68;
          const bubbleX = Math.max(8, Math.min(W - bubbleW - 8, meta.x - bubbleW / 2));
          const bubbleY = Math.max(8, Math.min(H - bubbleH - 10, meta.y - 82));
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
                zIndex: 10,
                width: bubbleW,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  background: "rgba(20,21,24,0.96)",
                  border: `1px solid ${meta.accent}50`,
                  borderRadius: 8,
                  padding: "6px 8px",
                  boxShadow: `0 0 12px ${meta.accent}25, 0 4px 16px rgba(0,0,0,0.6)`,
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
                      fontSize: 9,
                      fontWeight: 700,
                      color: meta.accent,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.label}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      color: "rgba(255,255,255,0.35)",
                      marginLeft: "auto",
                    }}
                  >
                    {statusLabel[thought.status] ?? thought.status}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 9,
                    color: "rgba(234,237,242,0.75)",
                    lineHeight: 1.5,
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
              background: "rgba(12,13,16,0.72)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "12px 20px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 12, color: "#4E5867", marginBottom: 4 }}>
              에이전트 오피스
            </p>
            <p style={{ fontSize: 10, color: "#2a2e38" }}>
              분석 시작 시 에이전트들이 활성화됩니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

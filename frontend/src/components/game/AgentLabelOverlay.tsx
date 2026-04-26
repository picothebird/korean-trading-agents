"use client";

/**
 * AgentLabelOverlay — DOM-rendered crisp Korean labels & speech bubbles
 * synchronized to Phaser scene world coordinates.
 *
 * Why DOM? Phaser canvas Text rasterises at low DPR which blurs Korean
 * glyphs. DOM uses native subpixel AA so Pretendard stays sharp at any zoom.
 *
 * Sync model (perf-critical):
 *  - rAF loop reads `controller.getOverlaySnapshot()` each frame (cheap; only
 *    reads numbers, no Phaser GameObject creation).
 *  - DOM nodes are created ONCE in React tree; each frame we mutate
 *    `style.transform` and (rarely) text/visibility via refs. NO setState in
 *    the hot path → no React reconciliation per frame.
 */

import { useEffect, useMemo, useRef } from "react";
import type { AgentRole } from "@/types";
import { AGENT_LABEL } from "@/lib/agentLabels";
import type { OfficeSceneController } from "./OfficeSceneController";

interface Props {
  controller: OfficeSceneController | null;
  /** Role list to render labels for. Order is stable. */
  roles: ReadonlyArray<AgentRole>;
}

interface NameRefs {
  el: HTMLDivElement | null;
  lastVisible: boolean;
}
interface BubbleRefs {
  wrap: HTMLDivElement | null;
  text: HTMLDivElement | null;
  lastText: string;
  lastVisible: boolean;
}
interface ZoneRefs {
  el: HTMLDivElement | null;
}

export function AgentLabelOverlay({ controller, roles }: Props) {
  const rolesKey = roles.join("|");
  const stableRoles = useMemo(() => [...roles], [rolesKey]);

  const nameRefs = useRef<Map<AgentRole, NameRefs>>(new Map());
  const bubbleRefs = useRef<Map<AgentRole, BubbleRefs>>(new Map());
  const zoneRefs = useRef<Map<string, ZoneRefs>>(new Map());
  const rafRef = useRef<number | null>(null);
  const zoneListRef = useRef<HTMLDivElement | null>(null);

  // Reset agent refs if role list changes (new role set → React remounts children).
  useEffect(() => {
    nameRefs.current = new Map();
    bubbleRefs.current = new Map();
  }, [rolesKey]);

  useEffect(() => {
    if (!controller) return;
    let cancelled = false;
    const localZoneRefs = zoneRefs.current;
    let lastTickTime = 0;
    // Overlay rAF는 30fps로 throttle (33ms). 시각적으론 차이 없고 CPU 절반.

    const ensureZoneNodes = (zones: Array<{ name: string; x: number; y: number }>) => {
      const host = zoneListRef.current;
      if (!host) return;
      const seen = new Set(zones.map((z) => z.name));
      for (const z of zones) {
        if (localZoneRefs.has(z.name)) continue;
        const el = document.createElement("div");
        el.style.cssText =
          "position:absolute;left:0;top:0;font-size:13px;font-weight:700;color:#3d4250;letter-spacing:0.04em;white-space:nowrap;background:rgba(255,255,255,0.78);padding:3px 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 3px rgba(0,0,0,0.06);will-change:transform;";
        el.textContent = z.name;
        host.appendChild(el);
        localZoneRefs.set(z.name, { el });
      }
      for (const [name, refs] of localZoneRefs.entries()) {
        if (seen.has(name)) continue;
        if (refs.el && refs.el.parentNode) refs.el.parentNode.removeChild(refs.el);
        localZoneRefs.delete(name);
      }
    };

    const tick = (now: number) => {
      if (cancelled) return;
      rafRef.current = window.requestAnimationFrame(tick);
      // 30fps throttle — 33ms 미만 경과 시 skip.
      if (now - lastTickTime < 33) return;
      lastTickTime = now;
      let s: ReturnType<OfficeSceneController["getOverlaySnapshot"]> | null = null;
      try {
        s = controller.getOverlaySnapshot();
      } catch {
        // scene may be mid-destroy; skip frame.
        return;
      }
      if (!s) return;
      const { cam } = s;
      ensureZoneNodes(s.zones);
      for (const z of s.zones) {
        const refs = localZoneRefs.get(z.name);
        if (!refs?.el) continue;
        const sx = (z.x - cam.scrollX) * cam.zoom;
        const sy = (z.y - cam.scrollY) * cam.zoom;
        refs.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, 0)`;
      }
      // 이름표는 캐릭터 발끝 아래에, 말풍선은 머리 위에.
      // 이름표 anchor = 좌석 고정 좌표의 발 끝 → translate(-50%, 0) + 아래로 살짝 offset.
      // 말풍선 anchor = 좌석 고정 좌표의 머리 위 → translate(-50%, -100%) + 위로 살짝 offset.
      const NAME_SCREEN_OFFSET = 4;    // 발끝 아래 4px (라벨 박스가 발끝에 붙어 보이도록)
      const BUBBLE_SCREEN_OFFSET = 8;  // 머리 위 8px
      // 줌 1.0 이상에서 항상 표시 (stage 자동 줌 시 항상 보장).
      const ZOOM_VISIBLE_THRESHOLD = 1.0;
      const showLabels = cam.zoom >= ZOOM_VISIBLE_THRESHOLD;
      for (const a of s.agents) {
        const speaking = a.bubbleVisible && !!a.bubbleText;
        const nameR = nameRefs.current.get(a.role);
        if (nameR?.el) {
          if (showLabels !== nameR.lastVisible) {
            nameR.el.style.display = showLabels ? "block" : "none";
            nameR.lastVisible = showLabels;
          }
          if (showLabels) {
            const sx = Math.round((a.nameX - cam.scrollX) * cam.zoom);
            const sy = Math.round((a.nameY - cam.scrollY) * cam.zoom + NAME_SCREEN_OFFSET);
            // 이름표는 anchor(발끝) 기준으로 아래로 떨어지도록 translate(-50%, 0).
            nameR.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, 0)`;
          }
        }
        const bubR = bubbleRefs.current.get(a.role);
        if (bubR?.wrap) {
          // 말풍선은 줌아웃에서도 발화 중이면 표시.
          const bubbleVisible = speaking;
          const sx = Math.round((a.bubbleX - cam.scrollX) * cam.zoom);
          const sy = Math.round((a.bubbleY - cam.scrollY) * cam.zoom - BUBBLE_SCREEN_OFFSET);
          bubR.wrap.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
          if (bubbleVisible !== bubR.lastVisible) {
            bubR.wrap.style.display = bubbleVisible ? "block" : "none";
            bubR.lastVisible = bubbleVisible;
          }
          if (bubbleVisible && bubR.text && a.bubbleText !== bubR.lastText) {
            bubR.text.textContent = a.bubbleText;
            bubR.lastText = a.bubbleText;
          }
        }
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Drop zone DOM nodes on cleanup so a new controller starts fresh.
      for (const [, refs] of localZoneRefs.entries()) {
        if (refs.el && refs.el.parentNode) refs.el.parentNode.removeChild(refs.el);
      }
      localZoneRefs.clear();
    };
  }, [controller, rolesKey]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 4,
        fontFamily: "Pretendard, -apple-system, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div ref={zoneListRef} style={{ position: "absolute", inset: 0 }} />
      {stableRoles.map((role) => (
        <div key={role} style={{ position: "absolute", inset: 0 }}>
          <div
            ref={(el) => {
              const cur = nameRefs.current.get(role);
              if (cur) cur.el = el;
              else nameRefs.current.set(role, { el, lastVisible: false });
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontSize: 12,
              fontWeight: 600,
              color: "#1c1f26",
              background: "rgba(255,255,255,0.92)",
              padding: "2px 6px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.06)",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              willChange: "transform",
              display: "none",
            }}
          >
            {AGENT_LABEL[role] ?? role}
          </div>
          <div
            ref={(el) => {
              const cur = bubbleRefs.current.get(role);
              if (cur) {
                cur.wrap = el;
              } else {
                bubbleRefs.current.set(role, {
                  wrap: el,
                  text: null,
                  lastText: "",
                  lastVisible: false,
                });
              }
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              maxWidth: 220,
              fontSize: 13,
              lineHeight: 1.35,
              color: "#1c1f26",
              background: "rgba(255,255,255,0.97)",
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              textAlign: "center",
              whiteSpace: "pre-wrap",
              wordBreak: "keep-all",
              display: "none",
              willChange: "transform",
            }}
          >
            <div
              ref={(el) => {
                const cur = bubbleRefs.current.get(role);
                if (cur) cur.text = el;
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default AgentLabelOverlay;

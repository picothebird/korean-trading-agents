"use client";

import type { CSSProperties, SVGProps } from "react";

// ── Vector Icon Set ─────────────────────────────────────────────────
// Single source of truth for all iconography.
// Replaces emoji usage across the app for visual consistency.
// All icons are 24×24 viewBox, currentColor-aware, stroke-based where
// appropriate (1.7px) for a refined Lucide/Heroicons-style look.

export type IconName =
  // navigation / structure
  | "compass" | "palette" | "brain" | "chart-bar" | "sparkles" | "credit-card"
  | "settings" | "sliders" | "activity" | "list" | "wallet" | "briefcase"
  // theme
  | "sun" | "moon" | "monitor"
  // status / actions
  | "check" | "check-circle" | "x" | "x-circle" | "warning" | "info"
  | "eye" | "eye-off" | "star" | "star-filled" | "search" | "target"
  | "shield" | "robot" | "globe" | "user" | "logout" | "key"
  // chart / market
  | "trend-up" | "trend-down" | "candle" | "chart-pie"
  // misc
  | "calendar" | "clock" | "bolt" | "scale" | "cube" | "menu";

type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number | string;
  /** Stroke-based icons use this thickness. Defaults to 1.75. */
  strokeWidth?: number;
  /** Decorative-only icon (hidden from AT). */
  decorative?: boolean;
  /** Accessible label when not decorative. */
  label?: string;
};

const PATHS: Record<IconName, JSX.Element> = {
  // ── navigation / structure ─────────────────────────────────────
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.3 5.4-5.4 2.3 2.3-5.4z" />
    </>
  ),
  palette: (
    <>
      <path d="M12 21a9 9 0 1 1 0-18c5 0 9 3.6 9 8 0 2.5-2 4-4 4h-2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 21Z" />
      <circle cx="7.5" cy="11" r="1.1" />
      <circle cx="9.5" cy="7" r="1.1" />
      <circle cx="14.5" cy="7" r="1.1" />
      <circle cx="17" cy="10.5" r="1.1" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 4.5A2.5 2.5 0 0 1 12 7v10a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-2.5-2.5c0-.8.4-1.6 1-2A2.5 2.5 0 0 1 5 9a2.5 2.5 0 0 1 2-2.5A2.5 2.5 0 0 1 9.5 4.5Z" />
      <path d="M14.5 4.5A2.5 2.5 0 0 0 12 7v10a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 2.5-2.5c0-.8-.4-1.6-1-2A2.5 2.5 0 0 0 19 9a2.5 2.5 0 0 0-2-2.5A2.5 2.5 0 0 0 14.5 4.5Z" />
    </>
  ),
  "chart-bar": (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3 13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
      <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  "credit-card": (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" />
      <path d="M4 12h4" /><path d="M12 12h8" /><circle cx="10" cy="12" r="2" />
      <path d="M4 18h12" /><path d="M20 18h0" /><circle cx="18" cy="18" r="2" />
    </>
  ),
  activity: (
    <>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
      <circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <path d="M14 13h7v-3h-7a1.5 1.5 0 0 0 0 3Z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),

  // ── theme ──────────────────────────────────────────────────────
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: (
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),

  // ── status / actions ───────────────────────────────────────────
  check: (
    <path d="M5 12.5 10 17.5 19 7.5" />
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  "x-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h0" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h0" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.4 9.4 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.7 6.7C3.6 8.5 2 12 2 12s4 6 10 6c1.6 0 3-.3 4.3-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  star: (
    <path d="m12 3 2.7 5.5 6 .9-4.4 4.2 1 6L12 16.8 6.7 19.6l1-6L3.3 9.4l6-.9z" />
  ),
  "star-filled": (
    <path d="m12 3 2.7 5.5 6 .9-4.4 4.2 1 6L12 16.8 6.7 19.6l1-6L3.3 9.4l6-.9z" fill="currentColor" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  robot: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 4v4" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" />
      <circle cx="15" cy="14" r="1.2" fill="currentColor" />
      <path d="M9 18h6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9" />
      <path d="m17 6 3 3" />
      <path d="m14 9 2 2" />
    </>
  ),

  // ── chart / market ─────────────────────────────────────────────
  "trend-up": (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </>
  ),
  "trend-down": (
    <>
      <path d="m3 7 6 6 4-4 8 8" />
      <path d="M14 17h7v-7" />
    </>
  ),
  candle: (
    <>
      <path d="M7 4v3M7 17v3" /><rect x="5" y="7" width="4" height="10" rx="1" />
      <path d="M17 2v4M17 16v6" /><rect x="15" y="6" width="4" height="10" rx="1" />
    </>
  ),
  "chart-pie": (
    <>
      <path d="M12 3v9l7.8 4.5A9 9 0 1 1 12 3Z" />
      <path d="M21 12a9 9 0 0 0-9-9v9Z" />
    </>
  ),

  // ── misc ───────────────────────────────────────────────────────
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bolt: (
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  ),
  scale: (
    <>
      <path d="M12 4v16" />
      <path d="M4 7h16" />
      <path d="M7 7 4 14a3 3 0 0 0 6 0Z" />
      <path d="M17 7l-3 7a3 3 0 0 0 6 0Z" />
    </>
  ),
  cube: (
    <>
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="m3 7 9 5 9-5" /><path d="M12 12v10" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" />
    </>
  ),
};

// Filled icons that should NOT use stroke
const FILLED: Partial<Record<IconName, true>> = {
  "star-filled": true,
  bolt: true,
  moon: true,
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
  decorative,
  label,
  style,
  ...rest
}: IconProps) {
  const isFilled = FILLED[name];
  const a11y = decorative
    ? { "aria-hidden": true as const, focusable: false as const }
    : { role: "img" as const, "aria-label": label ?? String(name) };
  const merged: CSSProperties = {
    flexShrink: 0,
    display: "inline-block",
    verticalAlign: "middle",
    ...style,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilled ? "currentColor" : "none"}
      stroke={isFilled ? "none" : "currentColor"}
      strokeWidth={isFilled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={merged}
      {...a11y}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export default Icon;

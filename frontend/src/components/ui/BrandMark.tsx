"use client";
/**
 * BrandMark — KTA (Korean Trading Agents) brand mark.
 * Inspired by Korean Air's 1984 corporate identity:
 *  - Soft sky-blue circular field
 *  - Centred taegeuk swirl in Korean red (bull) + blue (bear) — same palette
 *    used on price charts so the mark visually reinforces the product domain.
 *
 * Pure SVG, no raster assets, scales cleanly. Use `size` (px) and optional
 * `tone="solid" | "outline"`. For app icon / favicon use `solid`.
 */
import React from "react";

interface BrandMarkProps {
  size?: number;
  tone?: "solid" | "outline";
  title?: string;
  className?: string;
}

export function BrandMark({
  size = 32,
  tone = "solid",
  title = "KTA",
  className,
}: BrandMarkProps) {
  // Korean flag taegeuk colour spec, harmonised with our chart tokens.
  const RED = "#E5384A"; // var(--bull)
  const BLUE = "#1F6FEB"; // var(--bear)
  const FIELD = tone === "solid" ? "#E8F1FB" : "transparent";
  const RING = "#1F6FEB";

  return (
    <svg
      role="img"
      aria-label={title}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      <title>{title}</title>
      {/* Outer circular field — KAL-style sky disc */}
      <circle cx="32" cy="32" r="30" fill={FIELD} stroke={RING} strokeWidth={tone === "outline" ? 2 : 0} />

      {/* Taegeuk — two interlocking commas. Built from a horizontal split
          where each half-circle is then joined to a small inner half-circle
          forming the classic S-curve. */}
      <g>
        {/* Red (top) half */}
        <path
          d="M 32 6
             A 26 26 0 0 1 32 58
             A 13 13 0 0 0 32 32
             A 13 13 0 0 1 32 6 Z"
          fill={RED}
        />
        {/* Blue (bottom) half */}
        <path
          d="M 32 6
             A 26 26 0 0 0 32 58
             A 13 13 0 0 1 32 32
             A 13 13 0 0 0 32 6 Z"
          fill={BLUE}
        />
      </g>

      {/* Subtle gloss to lift the mark on light surfaces */}
      {tone === "solid" && (
        <circle cx="32" cy="32" r="30" fill="none" stroke="var(--border-default)" strokeWidth={1} />
      )}
    </svg>
  );
}

/**
 * BrandLockup — mark + wordmark + tagline. Use in app headers and auth screens
 * where horizontal real estate allows. Pass `compact` to drop the tagline.
 */
interface BrandLockupProps {
  size?: number;
  compact?: boolean;
  align?: "start" | "center";
}

export function BrandLockup({ size = 36, compact = false, align = "start" }: BrandLockupProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      <BrandMark size={size} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span
          style={{
            fontSize: Math.round(size * 0.5),
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: "var(--text-primary)",
          }}
        >
          KTA
        </span>
        {!compact && (
          <span
            style={{
              fontSize: Math.max(9, Math.round(size * 0.28)),
              color: "var(--text-tertiary)",
              marginTop: 2,
              letterSpacing: "0.02em",
            }}
          >
            한국 트레이딩 에이전트
          </span>
        )}
      </div>
    </div>
  );
}

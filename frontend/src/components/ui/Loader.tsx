"use client";

import { motion } from "framer-motion";
import type { CSSProperties } from "react";

export interface LoaderProps {
  /** Outer pixel size of the spinner. Defaults to 28. */
  size?: number;
  /** Optional caption shown below the spinner. */
  label?: string;
  /** Color of the spinning arc; defaults to brand. */
  color?: string;
  /** Color of the static track ring. Defaults to subtle border. */
  trackColor?: string;
  /** Stroke thickness in px. Defaults to ~size/9. */
  strokeWidth?: number;
  /** Center the loader (and label) horizontally. */
  center?: boolean;
  /** Extra style overrides on the wrapper. */
  style?: CSSProperties;
}

/**
 * Shared loading graphic. Use this everywhere a loading state is shown
 * instead of one-off rotating icons. Keeps a single visual language.
 */
export function Loader({
  size = 28,
  label,
  color = "var(--brand)",
  trackColor = "var(--border-subtle)",
  strokeWidth,
  center = true,
  style,
}: LoaderProps) {
  const sw = strokeWidth ?? Math.max(2, Math.round(size / 9));
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  // Show a ~30% arc and rotate the whole svg
  const dash = circumference * 0.3;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? "로딩 중"}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: center ? "center" : "flex-start",
        justifyContent: "center",
        gap: 8,
        ...style,
      }}
    >
      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        aria-hidden="true"
        style={{ display: "block" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={sw}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </motion.svg>
      {label ? (
        <p
          style={{
            margin: 0,
            fontSize: Math.max(11, Math.round(size / 3)),
            color: "var(--text-secondary)",
            fontWeight: 500,
            textAlign: center ? "center" : "left",
          }}
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}

export default Loader;

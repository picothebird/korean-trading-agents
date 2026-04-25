"use client";
import React from "react";

type Tone = "neutral" | "brand" | "bull" | "bear" | "success" | "warning" | "danger";
type Size = "sm" | "md";

interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Size;
  dot?: boolean;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "pill pill-neutral",
  brand:   "pill pill-brand",
  bull:    "pill pill-bull",
  bear:    "pill pill-bear",
  success: "pill pill-success",
  warning: "pill pill-warning",
  danger:  "pill pill-danger",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "var(--text-tertiary)",
  brand:   "var(--brand)",
  bull:    "var(--bull)",
  bear:    "var(--bear)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger:  "var(--danger)",
};

export function Pill({ tone = "neutral", size = "md", dot, className = "", style, children, ...rest }: PillProps) {
  const sizeStyle: React.CSSProperties =
    size === "sm" ? { height: 20, padding: "0 8px", fontSize: 11 } : {};
  return (
    <span className={`${TONE_CLASS[tone]} ${className}`} style={{ ...sizeStyle, ...style }} {...rest}>
      {dot && (
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: TONE_DOT[tone], flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

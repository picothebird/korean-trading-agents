"use client";
import React from "react";

interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  shape?: "rect" | "circle" | "pill";
  style?: React.CSSProperties;
}

export function Skeleton({ w = "100%", h = 16, shape = "rect", style }: SkeletonProps) {
  const radius =
    shape === "circle" ? "50%" :
    shape === "pill" ? "999px" :
    "var(--radius-sm)";
  return (
    <span
      aria-hidden
      className="skeleton"
      style={{
        display: "inline-block",
        width: typeof w === "number" ? `${w}px` : w,
        height: typeof h === "number" ? `${h}px` : h,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

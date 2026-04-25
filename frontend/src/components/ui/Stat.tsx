"use client";
import React from "react";

type Trend = "up" | "down" | "flat" | undefined;

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  trend?: Trend;
  size?: "sm" | "md" | "lg";
  align?: "start" | "end";
  hint?: string;
}

const SIZE: Record<"sm" | "md" | "lg", { value: number; label: number }> = {
  sm: { value: 16, label: 11 },
  md: { value: 22, label: 12 },
  lg: { value: 32, label: 12 },
};

export function Stat({ label, value, sub, trend, size = "md", align = "start", hint }: StatProps) {
  const sz = SIZE[size];
  const color =
    trend === "up" ? "var(--bull)" :
    trend === "down" ? "var(--bear)" :
    trend === "flat" ? "var(--hold)" :
    "var(--text-primary)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: align === "end" ? "flex-end" : "flex-start", textAlign: align === "end" ? "right" : "left" }}>
      <span
        style={{ fontSize: sz.label, fontWeight: 500, color: "var(--text-secondary)", letterSpacing: 0 }}
        title={hint}
      >
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{ fontSize: sz.value, fontWeight: 700, color, lineHeight: 1.1 }}
      >
        {value}
      </span>
      {sub && (
        <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color }}>
          {sub}
        </span>
      )}
    </div>
  );
}

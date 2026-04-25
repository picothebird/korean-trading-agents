"use client";
import React from "react";

type Variant = "canvas" | "surface" | "elevated" | "spotlight" | "muted";

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  canvas:    { background: "var(--bg-canvas)",    border: "1px solid var(--border-subtle)" },
  surface:   { background: "var(--bg-surface)",   border: "1px solid var(--border-default)" },
  elevated:  { background: "var(--bg-surface)",   border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-md)" },
  spotlight: { background: "var(--bg-spotlight)", border: "1px solid var(--brand-border)" },
  muted:     { background: "var(--bg-overlay)",   border: "1px solid var(--border-subtle)" },
};

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  radius?: "sm" | "md" | "lg" | "xl" | "2xl";
  padding?: number | string;
  as?: "div" | "section" | "article" | "aside";
}

export function Surface({
  variant = "surface",
  radius = "lg",
  padding,
  as: Tag = "div",
  style,
  children,
  ...rest
}: SurfaceProps) {
  const merged: React.CSSProperties = {
    ...VARIANT_STYLES[variant],
    borderRadius: `var(--radius-${radius})`,
    ...(padding !== undefined ? { padding: typeof padding === "number" ? `${padding}px` : padding } : {}),
    ...style,
  };
  const Component = Tag as React.ElementType;
  return <Component style={merged} {...rest}>{children}</Component>;
}

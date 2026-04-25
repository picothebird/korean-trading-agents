"use client";
import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const SIZE: Record<Size, React.CSSProperties> = {
  sm: { height: 32, padding: "0 12px", fontSize: 13, borderRadius: "var(--radius-sm)" },
  md: { height: 38, padding: "0 16px", fontSize: 14, borderRadius: "var(--radius-md)" },
  lg: { height: 46, padding: "0 20px", fontSize: 15, borderRadius: "var(--radius-md)" },
};

const VARIANT: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--brand)",
    color: "var(--text-inverse)",
    border: "1px solid var(--brand)",
  },
  secondary: {
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--danger)",
    color: "var(--text-inverse)",
    border: "1px solid var(--danger)",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  iconLeft,
  iconRight,
  fullWidth,
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  const merged: React.CSSProperties = {
    ...VARIANT[variant],
    ...SIZE[size],
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontWeight: 600,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.55 : 1,
    transition: "background var(--duration-fast) ease, transform var(--duration-fast) ease, border-color var(--duration-fast) ease",
    width: fullWidth ? "100%" : undefined,
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    ...style,
  };
  return (
    <button
      type={rest.type || "button"}
      disabled={disabled || loading}
      style={merged}
      onMouseEnter={(e) => {
        if (disabled || loading) return;
        const el = e.currentTarget;
        if (variant === "primary") el.style.background = "var(--brand-hover)";
        else if (variant === "secondary") el.style.background = "var(--bg-overlay)";
        else if (variant === "ghost") el.style.background = "var(--bg-overlay)";
        else if (variant === "danger") el.style.background = "#B91C1C";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = VARIANT[variant].background as string;
      }}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          style={{
            width: 14, height: 14, borderRadius: "50%",
            border: "2px solid currentColor", borderTopColor: "transparent",
            animation: "spin 0.7s linear infinite",
          }}
        />
      ) : iconLeft}
      {children}
      {!loading && iconRight}
      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </button>
  );
}

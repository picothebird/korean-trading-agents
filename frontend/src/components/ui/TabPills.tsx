"use client";
import React from "react";

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  hidden?: boolean;
}

interface TabPillsProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  items: TabItem<T>[];
  size?: "sm" | "md";
  fullWidth?: boolean;
  ariaLabel?: string;
}

export function TabPills<T extends string>({
  value, onChange, items, size = "md", fullWidth, ariaLabel,
}: TabPillsProps<T>) {
  const visible = items.filter((i) => !i.hidden);
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        background: "var(--bg-overlay)",
        borderRadius: "var(--radius-pill)",
        border: "1px solid var(--border-subtle)",
        width: fullWidth ? "100%" : undefined,
      }}
    >
      {visible.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const idx = visible.findIndex((i) => i.value === value);
              const next = e.key === "ArrowRight"
                ? visible[(idx + 1) % visible.length]
                : visible[(idx - 1 + visible.length) % visible.length];
              onChange(next.value);
            }}
            style={{
              flex: fullWidth ? 1 : undefined,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              height: size === "sm" ? 28 : 34,
              padding: size === "sm" ? "0 10px" : "0 14px",
              borderRadius: "var(--radius-pill)",
              background: active ? "var(--bg-surface)" : "transparent",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: size === "sm" ? 12 : 13,
              fontWeight: active ? 700 : 500,
              border: "1px solid " + (active ? "var(--border-subtle)" : "transparent"),
              cursor: "pointer",
              transition: "background var(--duration-fast) ease, color var(--duration-fast) ease",
              whiteSpace: "nowrap",
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

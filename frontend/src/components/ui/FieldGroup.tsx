"use client";

import type { CSSProperties, ReactNode } from "react";
import { Tooltip as Hint } from "./Tooltip";
import { Icon } from "./Icon";

/**
 * Shared "grouped settings" UI primitives. Use these to build dense
 * configuration panels where each input gets a friendly label, tooltip,
 * and example/help line — and where related fields are grouped into
 * named sections (max 2 per row).
 */

export const fieldInputStyle: CSSProperties = {
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-default)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  padding: "9px 10px",
  fontSize: 13,
  width: "100%",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export interface SettingsSectionProps {
  title: string;
  desc?: ReactNode;
  children: ReactNode;
  /** Optional emphasized accent color for left border. */
  accent?: string;
}

export function SettingsSection({ title, desc, children, accent }: SettingsSectionProps) {
  return (
    <section
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderLeft: accent ? `3px solid ${accent}` : "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        marginBottom: 14,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>{title}</p>
        {desc && (
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>{desc}</p>
        )}
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </section>
  );
}

export interface FieldRowProps {
  children: ReactNode;
  /** Number of columns (default 2). */
  cols?: 1 | 2;
}

export function FieldRow({ children, cols = 2 }: FieldRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols === 1 ? "1fr" : "1fr 1fr",
        gap: 14,
        alignItems: "stretch",
      }}
    >
      {children}
    </div>
  );
}

export interface FieldCellProps {
  label: string;
  hint?: string;
  example?: string;
  children?: ReactNode;
  /** Render an empty grid slot to balance a row. */
  empty?: boolean;
  /** Span both columns of a 2-col row. */
  full?: boolean;
}

export function FieldCell({ label, hint = "", example = "", children, empty, full }: FieldCellProps) {
  if (empty) return <div aria-hidden style={{ gridColumn: full ? "span 2" : undefined }} />;
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        gridColumn: full ? "span 2" : undefined,
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          color: "var(--text-secondary)",
          fontWeight: 600,
        }}
      >
        {label}
        {hint && (
          <Hint content={hint} maxWidth={280}>
            <button
              type="button"
              aria-label="설명 보기"
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "1px solid var(--border-default)",
                background: "var(--bg-surface)",
                color: "var(--text-tertiary)",
                cursor: "help",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="info" size={10} decorative />
            </button>
          </Hint>
        )}
      </span>
      {children}
      {example && (
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>{example}</span>
      )}
    </label>
  );
}

"use client";
import React from "react";

interface EmptyProps {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

export function Empty({ icon, title, body, action, compact }: EmptyProps) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: compact ? "20px 16px" : "32px 24px",
        textAlign: "center",
        color: "var(--text-secondary)",
      }}
    >
      {icon && (
        <div
          aria-hidden
          style={{
            width: compact ? 32 : 40,
            height: compact ? 32 : 40,
            borderRadius: "50%",
            background: "var(--bg-overlay)",
            display: "grid",
            placeItems: "center",
            color: "var(--text-tertiary)",
            fontSize: compact ? 16 : 20,
          }}
        >
          {icon}
        </div>
      )}
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{title}</p>
      {body && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, maxWidth: 320 }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

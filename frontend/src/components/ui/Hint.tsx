"use client";
import React, { useId, useState } from "react";

interface HintProps {
  children: React.ReactNode;        // tooltip body
  size?: number;                    // icon size
  inline?: boolean;
  label?: string;                   // visible label next to icon
}

// 안내 문구 자동 줄바꿈: 문장 끝/구분자(`·`) 뒤에 줄바꿈 삽입
function formatHintText(s: string): string {
  return s
    .replace(/([.!?])\s+(?=[가-힣A-Za-z(])/g, "$1\n")
    .replace(/\s+·\s+/g, "\n· ");
}

/** Inline help tip. Hover shows tooltip; aria-describedby on focus. */
export function Hint({ children, size = 14, inline = true, label }: HintProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const tipText = typeof children === "string" ? children : "";
  return (
    <span
      style={{
        position: "relative",
        display: inline ? "inline-flex" : "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label && <span style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 500 }}>{label}</span>}
      <button
        type="button"
        aria-label={tipText || "도움말"}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: size, height: size, padding: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%",
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          color: "var(--text-secondary)",
          fontSize: Math.round(size * 0.65), fontWeight: 700, lineHeight: 1,
          cursor: "help",
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            maxWidth: 260,
            padding: "8px 10px",
            background: "var(--text-primary)",
            color: "var(--text-inverse)",
            fontSize: 12,
            lineHeight: 1.55,
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-lg)",
            whiteSpace: "pre-line",
            wordBreak: "keep-all",
            pointerEvents: "none",
          }}
        >
          {typeof children === "string" ? formatHintText(children) : children}
        </span>
      )}
    </span>
  );
}

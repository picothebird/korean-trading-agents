"use client";
import React, { useEffect } from "react";
import { Icon } from "./Icon";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Side of the screen the sheet slides from. Default "right". */
  side?: "right" | "left";
  width?: number;
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  width = 480,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const isRight = side === "right";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "sheet-title" : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg-scrim)",
        animation: "sht-fade 200ms var(--ease-out-expo)",
        display: "flex",
        justifyContent: isRight ? "flex-end" : "flex-start",
      }}
    >
      <aside
        style={{
          width: "100%",
          maxWidth: width,
          height: "100%",
          background: "var(--bg-surface)",
          borderLeft: isRight ? "1px solid var(--border-default)" : undefined,
          borderRight: !isRight ? "1px solid var(--border-default)" : undefined,
          boxShadow: "var(--shadow-xl)",
          display: "flex",
          flexDirection: "column",
          animation: `sht-${isRight ? "right" : "left"} 280ms var(--ease-out-expo)`,
        }}
      >
        {(title || description) && (
          <header
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              justifyContent: "space-between",
            }}
          >
            <div>
              {title && (
                <h2 id="sheet-title" style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  {title}
                </h2>
              )}
              {description && (
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: "var(--radius-sm)",
                background: "transparent", border: "1px solid transparent",
                color: "var(--text-secondary)", lineHeight: 1, cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-overlay)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Icon name="x" size={16} decorative />
            </button>
          </header>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>{children}</div>
        {footer && (
          <footer
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-canvas)",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
      <style jsx>{`
        @keyframes sht-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sht-right { from { transform: translateX(20px); opacity: 0.6; } to { transform: none; opacity: 1; } }
        @keyframes sht-left  { from { transform: translateX(-20px); opacity: 0.6; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
}

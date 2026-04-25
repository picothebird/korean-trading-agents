"use client";
import React, { useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** Close on backdrop click. Default true. */
  dismissible?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 480,
  dismissible = true,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    window.addEventListener("keydown", onKey);
    // focus first focusable
    const t = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }, 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "dialog-title" : undefined}
      aria-describedby={description ? "dialog-desc" : undefined}
      onMouseDown={(e) => {
        if (!dismissible) return;
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg-scrim)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        animation: "dlg-fade 200ms var(--ease-out-expo)",
      }}
    >
      <div
        ref={ref}
        style={{
          width: "100%",
          maxWidth: width,
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-xl)",
          overflow: "hidden",
          animation: "dlg-pop 240ms var(--ease-out-expo)",
        }}
      >
        {(title || description) && (
          <header style={{ padding: "20px 24px 0" }}>
            {title && (
              <h2 id="dialog-title" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                {title}
              </h2>
            )}
            {description && (
              <p id="dialog-desc" style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                {description}
              </p>
            )}
          </header>
        )}
        <div style={{ padding: "20px 24px" }}>{children}</div>
        {footer && (
          <footer
            style={{
              padding: "12px 24px 20px",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-canvas)",
            }}
          >
            {footer}
          </footer>
        )}
      </div>
      <style jsx>{`
        @keyframes dlg-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dlg-pop { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

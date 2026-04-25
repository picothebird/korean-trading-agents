"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";

type ToastTone = "info" | "success" | "warning" | "danger";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  ttl?: number;
}

interface ToastCtx {
  push: (t: Omit<ToastItem, "id">) => void;
}
const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  return c ?? { push: () => {} };
}

const TONE_STYLE: Record<ToastTone, { bg: string; border: string; color: string; icon: IconName }> = {
  info:    { bg: "var(--info-subtle)",    border: "var(--brand-border)",   color: "var(--brand-active)", icon: "info" },
  success: { bg: "var(--success-subtle)", border: "var(--success-border)", color: "var(--success)",      icon: "check-circle" },
  warning: { bg: "var(--warning-subtle)", border: "var(--warning-border)", color: "var(--warning)",      icon: "warning" },
  danger:  { bg: "var(--danger-subtle)",  border: "var(--error-border)",   color: "var(--danger)",       icon: "x-circle" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, ttl: 4200, ...t }]);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 1100,
          pointerEvents: "none",
        }}
      >
        {items.map((t) => (
          <Toast key={t.id} item={t} onDone={() => setItems((p) => p.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const s = TONE_STYLE[item.tone];
  useEffect(() => {
    const t = setTimeout(onDone, item.ttl ?? 4200);
    return () => clearTimeout(t);
  }, [item.ttl, onDone]);
  return (
    <div
      role="status"
      style={{
        pointerEvents: "auto",
        minWidth: 280,
        maxWidth: 360,
        padding: "12px 14px",
        background: "var(--bg-surface)",
        border: `1px solid ${s.border}`,
        borderLeft: `3px solid ${s.color}`,
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        gap: 10,
        animation: "toast-in 220ms var(--ease-out-expo)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 22, height: 22, borderRadius: "50%",
          background: s.bg, color: s.color,
          display: "grid", placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={s.icon} size={13} strokeWidth={2.2} decorative />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{item.title}</p>
        {item.body && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", lineHeight: 1.45 }}>
            {item.body}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={onDone}
        style={{
          background: "transparent", border: "none",
          color: "var(--text-tertiary)", lineHeight: 1, cursor: "pointer",
          display: "inline-flex", alignItems: "center",
        }}
      >
        <Icon name="x" size={14} decorative />
      </button>
      <style jsx>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}

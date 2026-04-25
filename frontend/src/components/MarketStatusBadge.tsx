"use client";

/**
 * MS-E E10 — 한국 시장 세션 상태 뱃지
 *
 * KRX 정규장/동시호가/시간외/휴장 상태를 헤더에 노출.
 * 1분 간격으로 상태 재계산.
 *
 * @see lib/krMarket.ts
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getMarketSession, type MarketSession } from "@/lib/krMarket";
import { springBadge } from "@/tokens/motion";

function statusColor(status: MarketSession["status"]): { fg: string; bg: string; dot: string } {
  switch (status) {
    case "regular":
      return { fg: "var(--success)", bg: "var(--success-subtle)", dot: "var(--success)" };
    case "pre-auction":
    case "closing-auction":
      return { fg: "var(--warning)", bg: "var(--warning-subtle)", dot: "var(--warning)" };
    case "after-hours":
      return { fg: "var(--brand)", bg: "var(--brand-subtle)", dot: "var(--brand)" };
    case "pre-open":
      return { fg: "var(--text-secondary)", bg: "var(--bg-overlay)", dot: "var(--text-tertiary)" };
    case "closed":
    case "holiday":
    default:
      return { fg: "var(--text-tertiary)", bg: "var(--bg-overlay)", dot: "var(--text-quaternary)" };
  }
}

function fmtNextOpen(d: Date | null): string {
  if (!d) return "";
  const now = new Date();
  const nowKst = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  const sameDay =
    d.getFullYear() === nowKst.getFullYear() &&
    d.getMonth() === nowKst.getMonth() &&
    d.getDate() === nowKst.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `오늘 ${hh}:${mm} 개장`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${md}(${wk}) ${hh}:${mm} 개장`;
}

export function MarketStatusBadge({ compact = false }: { compact?: boolean }) {
  const [session, setSession] = useState<MarketSession | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(getMarketSession());
    const t = window.setInterval(() => setSession(getMarketSession()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!session) return null;

  const c = statusColor(session.status);
  const tooltip = session.isOpen
    ? `한국 표준시 ${session.nowKst.getHours().toString().padStart(2, "0")}:${session.nowKst.getMinutes().toString().padStart(2, "0")} · ${session.label}`
    : `${session.label}${session.nextOpen ? " · " + fmtNextOpen(session.nextOpen) : ""}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springBadge}
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: compact ? "3px 8px" : "4px 10px",
        borderRadius: 99,
        background: c.bg,
        color: c.fg,
        fontSize: compact ? 9 : 10,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
      aria-label={`KRX ${tooltip}`}
    >
      {session.isOpen ? (
        <motion.span
          animate={{ opacity: [1, 0.45, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }}
        />
      ) : (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
      )}
      <span>KRX · {session.label}</span>
    </motion.div>
  );
}

"use client";

/**
 * TimelineStrip — 사이드바용 최근 N개 컴팩트 타임라인 (MS-S3).
 *
 * 필터/그룹/줌/검색 없이 최근 thought를 좁은 폭에 압축.
 * Stage 사이드바에서만 사용.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentRole, AgentThought } from "@/types";
import { AGENT_LABEL, AGENT_COLOR, layerOfRole, LAYER_SHORT } from "@/lib/agentLabels";

interface TimelineStripProps {
  thoughts: AgentThought[];
  limit?: number;
}

function relTime(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 5) return "방금";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

export function TimelineStrip({ thoughts, limit = 5 }: TimelineStripProps) {
  const recent = thoughts.slice(-limit).reverse();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (recent.length === 0) {
    return (
      <div
        className="stage-label"
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-tertiary)",
          padding: 12,
        }}
      >
        활동 대기 중
      </div>
    );
  }

  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        overflowY: "auto",
        height: "100%",
      }}
    >
      <AnimatePresence initial={false}>
        {recent.map((t, i) => {
          const role = t.role as AgentRole;
          const color = AGENT_COLOR[role] ?? "var(--text-tertiary)";
          const name = AGENT_LABEL[role] ?? role;
          const lane = LAYER_SHORT[layerOfRole(role)];
          return (
            <motion.li
              key={`${t.timestamp}-${role}-${i}`}
              layout
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 8,
                alignItems: "start",
                padding: "6px 8px",
                background: "var(--bg-surface)",
                border: "1px solid var(--stage-border)",
                borderRadius: "var(--stage-radius)",
                borderLeft: `3px solid ${color}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  marginTop: 4,
                  background: color,
                  borderRadius: "var(--stage-radius-sharp)",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{name}</span>
                  <span
                    className="stage-label"
                    style={{ color: "var(--text-quaternary)", fontSize: 9 }}
                  >
                    {lane}
                  </span>
                </div>
                <p
                  style={{
                    margin: "2px 0 0 0",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {t.content}
                </p>
              </div>
              <span
                className="stage-label"
                style={{ color: "var(--text-tertiary)", fontSize: 9, whiteSpace: "nowrap" }}
              >
                {relTime(t.timestamp, now)}
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

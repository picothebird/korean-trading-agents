"use client";

/**
 * StageRecentStrip — 하단 1행 회전 발언 스트립 (MS-S3).
 *
 * 최근 6개 thought를 6초 간격으로 회전. 호버 시 정지, ←/→로 수동 회전.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought } from "@/types";
import { AGENT_LABEL } from "@/lib/agentLabels";

interface StageRecentStripProps {
  thoughts: AgentThought[];
}

const ROTATE_MS = 6000;
const KEEP_LAST = 6;

function relTime(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 5) return "방금";
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.round(sec / 60)}분 전`;
  return `${Math.round(sec / 3600)}시간 전`;
}

export function StageRecentStrip({ thoughts }: StageRecentStripProps) {
  const recent = thoughts.slice(-KEEP_LAST);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const len = recent.length;

  // 신규 도착 시 마지막으로 이동 (외부 thoughts 변동 → 내부 idx 동기화)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (len > 0) setIdx(len - 1);
  }, [len]);

  // 회전 타이머
  useEffect(() => {
    if (paused || len <= 1) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % len);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, len]);

  const move = useCallback(
    (delta: number) => {
      if (len === 0) return;
      setIdx((i) => (i + delta + len) % len);
    },
    [len],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 무대가 포커스 안에 있을 때만 화살표 작동
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") {
        move(-1);
        setPaused(true);
      } else if (e.key === "ArrowRight") {
        move(1);
        setPaused(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // 상대 시간 표시용 now: 30초마다 tick (impure Date.now()를 useState 초기화로 격리)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (len === 0) return null;
  const cur = recent[idx] ?? recent[len - 1];
  const name = AGENT_LABEL[cur.role] ?? cur.role;

  return (
    <div
      className="stage-card"
      role="region"
      aria-label="최근 발언 스트립"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        height: 36,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        alignItems: "center",
        gap: 10,
        padding: "0 12px",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          background: "var(--brand)",
          borderRadius: "var(--stage-radius-sharp)",
        }}
        aria-hidden
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${cur.timestamp}-${idx}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <span
            className="stage-label"
            style={{ color: "var(--text-primary)", fontWeight: 700 }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={cur.content}
          >
            {cur.content}
          </span>
        </motion.div>
      </AnimatePresence>
      <span className="stage-label" style={{ color: "var(--text-tertiary)" }}>
        {relTime(cur.timestamp, now)}
      </span>
      <span className="stage-label" style={{ color: "var(--text-quaternary)" }}>
        {idx + 1}/{len}
      </span>
    </div>
  );
}

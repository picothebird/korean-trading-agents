"use client";

/**
 * TimelineEntry — 타임라인 한 줄.
 *
 * 줌 레벨에 따라 보여주는 정보량이 다름:
 * - compact: 시간(상대) + 에이전트 + 한 줄 요약(line-clamp 1)
 * - comfortable: + 단계 칩 + 신호 칩 + line-clamp 4 + 펼침 가능
 * - verbose: + duration_ms + confidence + 항상 펼침
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-quinquies
 */

import { motion } from "framer-motion";
import type { AgentRole, AgentThought } from "@/types";
import {
  AGENT_LABEL,
  AGENT_COLOR,
  STATUS_LABEL,
  LAYER_SHORT,
  layerOfRole,
  extractSignal,
  SIGNAL_LABEL,
} from "@/lib/agentLabels";
import { formatRelativeTime, formatAbsoluteTime, formatDuration } from "./formatTime";
import { useTimelineStore } from "./useTimeline";
import { useAgentOffice, thoughtId } from "@/stores/useAgentOffice";
import { usePersonalization } from "@/stores/usePersonalization";

interface TimelineEntryProps {
  thought: AgentThought;
  /** 안정적인 행 키 (확장 상태 보관용) */
  rowKey: string;
  /** 현재 시각 (그룹 단위로 한 번 계산) */
  now: number;
}

export function TimelineEntry({ thought, rowKey, now }: TimelineEntryProps) {
  const zoom = useTimelineStore((s) => s.zoom);
  const expanded = useTimelineStore((s) => s.expanded.has(rowKey));
  const toggleExpanded = useTimelineStore((s) => s.toggleExpanded);

  const focusedRole = useAgentOffice((s) => s.focusedRole);
  const setFocusedRole = useAgentOffice((s) => s.setFocusedRole);
  const openInspector = useAgentOffice((s) => s.openInspector);
  const isBookmarked = useAgentOffice((s) => s.isBookmarked);
  const addBookmark = useAgentOffice((s) => s.addBookmark);
  const removeBookmark = useAgentOffice((s) => s.removeBookmark);

  const role = thought.role as AgentRole;
  const dotColor = AGENT_COLOR[role] ?? "var(--text-tertiary)";
  const name = AGENT_LABEL[role] ?? role;
  const layerIdx = layerOfRole(role);
  const laneLabel = LAYER_SHORT[layerIdx];
  const signal = extractSignal(thought.metadata);
  const cols = usePersonalization((s) => s.timelineColumns);

  const md = (thought.metadata ?? {}) as Record<string, unknown>;
  const durationMs = typeof md.duration_ms === "number" ? md.duration_ms : null;
  const durationLabel = formatDuration(durationMs);
  const confidence = typeof md.confidence === "number" ? md.confidence : null;
  const keyPoints = Array.isArray(md.key_points) ? (md.key_points as string[]) : [];
  // MS-D D5/D6: provenance
  const dataSources = Array.isArray(md.data_sources) ? (md.data_sources as unknown[]).map(String) : [];
  const modelName = typeof md.model === "string" ? md.model : null;
  const latencyMs = typeof md.latency_ms === "number" ? md.latency_ms : null;

  const expandable = thought.content.length > 120 || keyPoints.length > 0;
  const showFull = expanded || zoom === "verbose";
  const lineClampClass = showFull
    ? ""
    : zoom === "compact"
    ? "line-clamp-1"
    : "line-clamp-4";

  const tid = thoughtId(thought);
  const bookmarked = isBookmarked(tid);
  const focused = focusedRole === role;

  const onActivate = () => {
    if (!expandable) return;
    toggleExpanded(rowKey);
  };

  const handleTrack = (e: React.MouseEvent) => {
    e.stopPropagation();
    openInspector(role, thought);
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (bookmarked) {
      removeBookmark(tid);
    } else {
      addBookmark({
        id: tid,
        role,
        status: thought.status,
        content: thought.content,
        timestamp: thought.timestamp,
        signal,
        savedAt: new Date().toISOString(),
      });
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!expandable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpanded(rowKey);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setFocusedRole(role)}
      onMouseLeave={() => focusedRole === role && setFocusedRole(null)}
      style={{
        position: "relative",
        display: "flex",
        gap: 10,
        marginBottom: zoom === "compact" ? 3 : 6,
        background: focused ? `${dotColor}0F` : "var(--bg-surface)",
        border: `1px solid ${focused ? dotColor : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-md)",
        padding: zoom === "compact" ? "4px 8px" : "6px 10px",
        cursor: expandable ? "pointer" : "default",
        outline: "none",
        transition: "background 120ms, border-color 120ms",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -7,
          top: zoom === "compact" ? 8 : 12,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          border: "1px solid var(--bg-canvas)",
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: zoom === "compact" ? 0 : 2,
          }}
        >
          <time
            dateTime={thought.timestamp}
            title={formatAbsoluteTime(thought.timestamp)}
            style={{
              fontSize: 9,
              color: "var(--text-tertiary)",
              fontVariantNumeric: "tabular-nums",
              minWidth: 0,
              display: cols.time ? undefined : "none",
            }}
          >
            {formatRelativeTime(thought.timestamp, now)}
          </time>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: dotColor,
              display: cols.agent ? undefined : "none",
            }}
          >
            {name}
          </span>
          {zoom !== "compact" && cols.stage && (
            <>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 99,
                  padding: "1px 6px",
                }}
              >
                {laneLabel}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "var(--text-tertiary)",
                  fontWeight: 500,
                }}
              >
                · {STATUS_LABEL[thought.status]}
              </span>
            </>
          )}
          {signal && cols.signal && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 99,
                background: `${SIGNAL_LABEL[signal].cssVar}1F`,
                color: SIGNAL_LABEL[signal].cssVar,
              }}
            >
              {SIGNAL_LABEL[signal].ko}
            </span>
          )}
          {zoom === "verbose" && durationLabel && (
            <span
              style={{
                fontSize: 9,
                color: "var(--text-tertiary)",
                fontVariantNumeric: "tabular-nums",
              }}
              title="처리 시간"
            >
              ⏱ {durationLabel}
            </span>
          )}
          {zoom === "verbose" && confidence !== null && (
            <span
              style={{
                fontSize: 9,
                color: "var(--text-tertiary)",
                fontVariantNumeric: "tabular-nums",
              }}
              title="확신도"
            >
              자신감 {Math.round(confidence * 100)}%
            </span>
          )}
        </div>

        <p
          className={lineClampClass}
          style={{
            fontSize: zoom === "compact" ? 10 : 11,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {thought.content}
        </p>

        {showFull && keyPoints.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginTop: 4,
            }}
          >
            {keyPoints.map((pt, i) => (
              <span
                key={i}
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 99,
                  background: `${dotColor}18`,
                  color: dotColor,
                  fontWeight: 600,
                }}
              >
                {pt}
              </span>
            ))}
          </div>
        )}

        {/* MS-D D5: 데이터 출처 칩 (확장 시 노출) */}
        {showFull && dataSources.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600 }}>출처:</span>
            {dataSources.map((src, i) => (
              <span
                key={i}
                title={src}
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                  fontWeight: 600,
                }}
              >
                {src.length > 28 ? `${src.slice(0, 26)}…` : src}
              </span>
            ))}
          </div>
        )}

        {/* MS-D D6: 모델·소요시간 푸터 (확장 시 노출) */}
        {showFull && (modelName || latencyMs !== null) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 6,
              fontSize: 9,
              color: "var(--text-tertiary)",
            }}
          >
            {modelName && (
              <span>
                <span style={{ fontWeight: 600 }}>모델</span> · {modelName}
              </span>
            )}
            {latencyMs !== null && (
              <span>
                <span style={{ fontWeight: 600 }}>LLM</span> · {(latencyMs / 1000).toFixed(2)}s
              </span>
            )}
          </div>
        )}
      </div>

      {/* MS-C: 우측 액션 (호버 시 표시) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "flex-end",
          flexShrink: 0,
          opacity: focused || bookmarked ? 1 : 0.35,
          transition: "opacity 120ms",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "북마크 해제" : "북마크 추가"}
          onClick={handleBookmark}
          title={bookmarked ? "북마크 해제" : "북마크"}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
            color: bookmarked ? "#F5A524" : "var(--text-tertiary)",
            padding: 0,
          }}
        >
          {bookmarked ? "★" : "☆"}
        </button>
        <button
          type="button"
          onClick={handleTrack}
          aria-label="이 발화 추적"
          title="추적 — 인스펙터에서 상세 보기"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 9,
            color: "var(--text-tertiary)",
            padding: 0,
            fontWeight: 700,
          }}
        >
          ▸ 추적
        </button>
      </div>
    </motion.div>
  );
}

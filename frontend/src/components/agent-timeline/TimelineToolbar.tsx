"use client";

/**
 * TimelineToolbar — 검색·필터·줌·그룹·일시정지·CSV 다운로드.
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-quinquies (MS-B)
 */

import { useCallback, useMemo } from "react";
import type { AgentStatus, AgentThought } from "@/types";
import { Icon } from "@/components/ui";
import {
  ALL_AGENT_ROLES,
  AGENT_LABEL,
  STATUS_LABEL,
  AGENT_COLOR,
} from "@/lib/agentLabels";
import { useTimelineStore } from "./useTimeline";
import type { TimelineGroupMode, TimelineZoom } from "./types";
import { usePersonalization } from "@/stores/usePersonalization";

interface TimelineToolbarProps {
  /** 필터링된 결과 행 수 (사용자 피드백) */
  visibleCount: number;
  /** 전체 행 수 */
  totalCount: number;
  /** CSV 다운로드용 원본 thoughts */
  thoughts: AgentThought[];
}

const ZOOM_OPTIONS: { value: TimelineZoom; label: string; aria: string }[] = [
  { value: "compact", label: "촘촘", aria: "촘촘 보기" },
  { value: "comfortable", label: "기본", aria: "기본 보기" },
  { value: "verbose", label: "상세", aria: "상세 보기" },
];

const GROUP_OPTIONS: { value: TimelineGroupMode; label: string }[] = [
  { value: "none", label: "시간순" },
  { value: "stage", label: "단계별" },
  { value: "agent", label: "에이전트별" },
];

const ALL_STATUSES: AgentStatus[] = [
  "idle",
  "thinking",
  "analyzing",
  "debating",
  "deciding",
  "done",
];

export function TimelineToolbar({ visibleCount, totalCount, thoughts }: TimelineToolbarProps) {
  const filters = useTimelineStore((s) => s.filters);
  const setQuery = useTimelineStore((s) => s.setQuery);
  const toggleRole = useTimelineStore((s) => s.toggleRole);
  const toggleStatus = useTimelineStore((s) => s.toggleStatus);
  const toggleSignalOnly = useTimelineStore((s) => s.toggleSignalOnly);
  const resetFilters = useTimelineStore((s) => s.resetFilters);

  const zoom = useTimelineStore((s) => s.zoom);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const groupMode = useTimelineStore((s) => s.groupMode);
  const setGroupMode = useTimelineStore((s) => s.setGroupMode);

  const paused = useTimelineStore((s) => s.paused);
  const togglePaused = useTimelineStore((s) => s.togglePaused);

  // MS-F F2: 저장된 뷰
  const savedViews = usePersonalization((s) => s.savedViews);
  const addSavedView = usePersonalization((s) => s.addSavedView);
  const removeSavedView = usePersonalization((s) => s.removeSavedView);

  const hasActiveFilters = useMemo(
    () =>
      filters.query.length > 0 ||
      filters.roles.size > 0 ||
      filters.statuses.size > 0 ||
      filters.signalOnly,
    [filters],
  );

  const handleSaveView = useCallback(() => {
    const name = window.prompt("저장된 뷰 이름 (예: 위험 경고만)");
    if (!name || !name.trim()) return;
    addSavedView({
      name: name.trim(),
      query: filters.query,
      roles: Array.from(filters.roles),
      statuses: Array.from(filters.statuses),
      signalOnly: filters.signalOnly,
    });
  }, [addSavedView, filters]);

  const handleApplyView = useCallback(
    (id: string) => {
      const v = savedViews.find((x) => x.id === id);
      if (!v) return;
      const s = useTimelineStore.getState();
      s.resetFilters();
      if (v.query) s.setQuery(v.query);
      v.roles.forEach((r) => s.toggleRole(r));
      v.statuses.forEach((st) => s.toggleStatus(st));
      if (v.signalOnly) s.toggleSignalOnly();
    },
    [savedViews],
  );

  const handleExportCsv = useCallback(() => {
    const rows: string[] = ["timestamp,role,status,signal,content"];
    for (const t of thoughts) {
      const sig = (t.metadata as Record<string, unknown> | undefined)?.signal ?? "";
      const safe = (s: string) => `"${String(s).replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
      rows.push(
        [t.timestamp, t.role, t.status, String(sig), safe(t.content)].join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-timeline-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [thoughts]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        flexShrink: 0,
      }}
    >
      {/* Row 1: 검색 + 카운트 + 일시정지 + 다운로드 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            background: "var(--bg-canvas)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <Icon name="search" size={12} decorative />
          <input
            type="text"
            value={filters.query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색 (Ctrl+K) — 내용·에이전트"
            aria-label="타임라인 검색"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 11,
              color: "var(--text-primary)",
              minWidth: 0,
            }}
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색 지우기"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-tertiary)",
                padding: 0,
                display: "inline-flex",
              }}
            >
              <Icon name="x" size={11} decorative />
            </button>
          )}
        </div>

        <span
          style={{
            fontSize: 9,
            fontVariantNumeric: "tabular-nums",
            color: "var(--text-tertiary)",
            whiteSpace: "nowrap",
          }}
          aria-label={`${visibleCount}개 표시 중 (전체 ${totalCount})`}
        >
          {visibleCount === totalCount ? `${totalCount}개` : `${visibleCount}/${totalCount}`}
        </span>

        <button
          type="button"
          onClick={togglePaused}
          title={paused ? "스트림 재개" : "스트림 일시정지"}
          aria-pressed={paused}
          aria-label={paused ? "스트림 재개" : "스트림 일시정지"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            background: paused ? "var(--warning-subtle, #FEF3C7)" : "var(--bg-elevated)",
            color: paused ? "var(--warning)" : "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {paused ? "재개" : "일시정지"}
        </button>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={thoughts.length === 0}
          title="CSV로 내보내기"
          aria-label="CSV로 내보내기"
          style={{
            padding: "3px 8px",
            background: "var(--bg-elevated)",
            color: thoughts.length === 0 ? "var(--text-tertiary)" : "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            fontSize: 10,
            fontWeight: 600,
            cursor: thoughts.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          CSV
        </button>
      </div>

      {/* Row 2: 줌 / 그룹 / 신호만 / 리셋 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* 줌 segmented */}
        <SegmentedControl
          ariaLabel="표시 밀도"
          value={zoom}
          options={ZOOM_OPTIONS.map((o) => ({ value: o.value, label: o.label, aria: o.aria }))}
          onChange={(v) => setZoom(v as TimelineZoom)}
        />
        <SegmentedControl
          ariaLabel="그룹 모드"
          value={groupMode}
          options={GROUP_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => setGroupMode(v as TimelineGroupMode)}
        />

        <button
          type="button"
          onClick={toggleSignalOnly}
          aria-pressed={filters.signalOnly}
          title="신호 있는 항목만"
          style={{
            padding: "3px 8px",
            background: filters.signalOnly ? "var(--brand-subtle)" : "var(--bg-elevated)",
            color: filters.signalOnly ? "var(--brand-active)" : "var(--text-secondary)",
            border: `1px solid ${filters.signalOnly ? "var(--brand-border)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-md)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="bolt" size={12} decorative /> 신호만</span>
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            title="필터 모두 지우기"
            style={{
              padding: "3px 8px",
              background: "transparent",
              color: "var(--text-tertiary)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="x" size={12} decorative /> 필터 초기화</span>
          </button>
        )}
      </div>

      {/* MS-F F2: 저장된 뷰 (필터 조합 named save) */}
      {(savedViews.length > 0 || hasActiveFilters) && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 700, marginRight: 2 }}>저장된 뷰</span>
          {savedViews.map((v) => (
            <span
              key={v.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 4px 2px 8px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 99,
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              <button
                type="button"
                onClick={() => handleApplyView(v.id)}
                title={`적용: ${v.name}`}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 0, fontSize: 9, fontWeight: 600 }}
              >
                ⭐ {v.name}
              </button>
              <button
                type="button"
                onClick={() => removeSavedView(v.id)}
                aria-label={`${v.name} 삭제`}
                title="삭제"
                style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleSaveView}
              title="현재 필터 조합 저장"
              style={{
                padding: "2px 8px",
                background: "transparent",
                color: "var(--brand)",
                border: "1px dashed var(--brand-border)",
                borderRadius: 99,
                fontSize: 9,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + 현재 필터 저장
            </button>
          )}
        </div>
      )}

      {/* Row 3: Role 칩 (스크롤) */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
        {ALL_AGENT_ROLES.map((role) => {
          const active = filters.roles.has(role);
          const c = AGENT_COLOR[role];
          return (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              aria-pressed={active}
              style={{
                padding: "2px 8px",
                background: active ? `${c}22` : "var(--bg-elevated)",
                color: active ? c : "var(--text-secondary)",
                border: `1px solid ${active ? c : "var(--border-subtle)"}`,
                borderRadius: 99,
                fontSize: 9,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {AGENT_LABEL[role]}
            </button>
          );
        })}
      </div>

      {/* Row 4: Status 칩 */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {ALL_STATUSES.map((s) => {
          const active = filters.statuses.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              aria-pressed={active}
              style={{
                padding: "1px 6px",
                background: active ? "var(--text-primary)" : "var(--bg-elevated)",
                color: active ? "var(--text-inverse)" : "var(--text-tertiary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 99,
                fontSize: 9,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Segmented control ────────────────────────────────────────────
function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; aria?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: 1,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.aria ?? o.label}
            onClick={() => onChange(o.value)}
            style={{
              padding: "2px 8px",
              background: active ? "var(--bg-canvas)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              border: "none",
              borderRadius: "var(--radius-sm, 4px)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: active ? "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.06))" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

/**
 * AgentTimeline — 에이전트 활동 타임라인 (MS-B 메인).
 *
 * `ActivityFeed`의 풀 리플레이스먼트.
 *
 * 기능:
 * - react-virtuoso 가상 스크롤 (수천 개 thoughts에서도 스무스)
 * - 검색·롤·상태·신호 필터
 * - 단계별/에이전트별/시간순 그룹 모드
 * - 3단계 줌 (촘촘/기본/상세)
 * - 일시정지 (스트림은 계속, 화면 동결)
 * - 신규 항목 도착 시 aria-live 알림
 * - 자동 스크롤 (사용자가 위로 스크롤하면 일시 비활성화 → "최신으로" 버튼)
 * - 키보드: Ctrl+K 검색 포커스, Esc 펼침 닫기
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-quinquies (MS-B)
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AgentThought } from "@/types";
import { AGENT_LABEL, LAYER_SHORT, layerOfRole, extractSignal } from "@/lib/agentLabels";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineEntry } from "./TimelineEntry";
import { useTimelineStore } from "./useTimeline";
import type { TimelineRow } from "./types";
import { ActivityProgressChart } from "@/components/viz/Primitives";
import { TimelineStrip } from "./TimelineStrip";

interface AgentTimelineProps {
  /** 부모(page.tsx)가 SSE로 모은 전체 thoughts 시간순 배열. */
  thoughts: AgentThought[];
  /** 표시 변형 — full(기본): 풀 타임라인 / strip: 최근 5개 컴팩트 (MS-S3) */
  variant?: "full" | "strip";
}

export function AgentTimeline({ thoughts, variant = "full" }: AgentTimelineProps) {
  const filters = useTimelineStore((s) => s.filters);
  const groupMode = useTimelineStore((s) => s.groupMode);
  const paused = useTimelineStore((s) => s.paused);
  const followLatest = useTimelineStore((s) => s.followLatest);
  const setFollowLatest = useTimelineStore((s) => s.setFollowLatest);
  const collapseAll = useTimelineStore((s) => s.collapseAll);

  // paused일 때는 화면에 노출되는 thoughts를 동결.
  // 일시정지 진입 시점에 thoughts 스냅샷을 잡고, 일시정지 동안 백그라운드 thoughts 변동은 무시.
  const [frozenSnapshot, setFrozenSnapshot] = useState<AgentThought[]>([]);
  const thoughtsRef = useRef(thoughts);
  // 최신 thoughts 미러링 (effect로만 ref 업데이트)
  useEffect(() => {
    thoughtsRef.current = thoughts;
  }, [thoughts]);
  // 일시정지 진입 순간에만 스냅샷
  useEffect(() => {
    if (paused) {
      setFrozenSnapshot(thoughtsRef.current);
    }
  }, [paused]);
  const visibleThoughts = paused ? frozenSnapshot : thoughts;

  // 필터 적용
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return visibleThoughts.filter((t) => {
      if (filters.roles.size > 0 && !filters.roles.has(t.role)) return false;
      if (filters.statuses.size > 0 && !filters.statuses.has(t.status)) return false;
      if (filters.signalOnly && !extractSignal(t.metadata)) return false;
      if (q.length > 0) {
        const name = (AGENT_LABEL[t.role] ?? "").toLowerCase();
        if (!t.content.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [visibleThoughts, filters]);

  // 그룹화
  const rows: TimelineRow[] = useMemo(() => {
    if (groupMode === "none") {
      return filtered.map((t, i) => ({
        kind: "entry" as const,
        key: `${t.timestamp}-${t.role}-${i}`,
        thought: t,
        index: i,
      }));
    }

    // 그룹 키 도출
    const groupKey = (t: AgentThought): { key: string; label: string } => {
      if (groupMode === "stage") {
        const idx = layerOfRole(t.role);
        return { key: `stage-${idx}`, label: LAYER_SHORT[idx] };
      }
      // agent
      return { key: `agent-${t.role}`, label: AGENT_LABEL[t.role] ?? t.role };
    };

    // 안정 정렬: 그룹별 슬롯 유지
    const groups = new Map<string, { label: string; items: AgentThought[] }>();
    for (const t of filtered) {
      const { key, label } = groupKey(t);
      let g = groups.get(key);
      if (!g) {
        g = { label, items: [] };
        groups.set(key, g);
      }
      g.items.push(t);
    }

    const out: TimelineRow[] = [];
    let idx = 0;
    for (const [key, g] of groups) {
      out.push({ kind: "group", key: `g-${key}`, label: g.label, count: g.items.length });
      for (const t of g.items) {
        out.push({
          kind: "entry",
          key: `${key}-${t.timestamp}-${idx}`,
          thought: t,
          index: idx,
        });
        idx++;
      }
    }
    return out;
  }, [filtered, groupMode]);

  // ── react-virtuoso 자동 스크롤 ────────────────────────────────
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const prevLenRef = useRef(rows.length);

  useEffect(() => {
    if (rows.length > prevLenRef.current && followLatest && !paused) {
      virtuosoRef.current?.scrollToIndex({
        index: rows.length - 1,
        align: "end",
        behavior: "smooth",
      });
    }
    prevLenRef.current = rows.length;
  }, [rows.length, followLatest, paused]);

  const scrollToLatest = useCallback(() => {
    setFollowLatest(true);
    virtuosoRef.current?.scrollToIndex({
      index: rows.length - 1,
      align: "end",
      behavior: "smooth",
    });
  }, [rows.length, setFollowLatest]);

  // ── aria-live: 새 thought 도착 알림 (외부 SSE 데이터 → 화면 동기화) ─
  const [liveMessage, setLiveMessage] = useState("");
  const announcedRef = useRef(0);
  useEffect(() => {
    if (paused) return;
    const newCount = thoughts.length - announcedRef.current;
    if (newCount > 0 && announcedRef.current > 0) {
      const last = thoughts[thoughts.length - 1];
      // SSE로 도착한 외부 데이터를 a11y 안내 문자열로 동기화 — set-state-in-effect는 의도적
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveMessage(
        `${AGENT_LABEL[last.role] ?? last.role} 새 활동: ${last.content.slice(0, 60)}`,
      );
    }
    announcedRef.current = thoughts.length;
  }, [thoughts, paused]);

  // ── 키보드: Ctrl+K 검색 포커스, Esc 펼침 닫기 ───────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="타임라인 검색"]',
        );
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
      } else if (e.key === "Escape") {
        collapseAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapseAll]);

  // 그룹 단위 now — 결정론적: 마지막 thought의 timestamp 또는 epoch 0
  // (Date.now()를 렌더 중 호출하지 않기 위함)
  const now = useMemo(() => {
    const last = thoughts[thoughts.length - 1];
    return last ? new Date(last.timestamp).getTime() : 0;
  }, [thoughts]);

  // MS-S3: 사이드바용 strip 변형 — 모든 훅 호출 후 분기.
  if (variant === "strip") {
    return <TimelineStrip thoughts={thoughts} limit={5} />;
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 0,
      }}
    >
      <TimelineToolbar
        visibleCount={filtered.length}
        totalCount={visibleThoughts.length}
        thoughts={thoughts}
      />

      {/* MS-D D3: 분석 진행률 미니 차트 (시간축 X / 활성 thought 수 Y) */}
      {thoughts.length >= 4 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 6px",
            borderTop: "1px dashed var(--border-subtle)",
            borderBottom: "1px dashed var(--border-subtle)",
          }}
          aria-label="분석 진행률"
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
            진행률
          </span>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <ActivityProgressChart
              timestamps={thoughts.map((t) => t.timestamp)}
              width={320}
              height={28}
              bucketMs={2000}
            />
          </div>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
            {thoughts.length}건
          </span>
        </div>
      )}

      {/* 일시정지 안내 */}
      {paused && (
        <div
          role="status"
          style={{
            fontSize: 10,
            color: "var(--warning)",
            background: "var(--warning-subtle, #FEF3C7)",
            padding: "4px 8px",
            borderRadius: "var(--radius-sm, 4px)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>스트림 일시정지 중 (백그라운드 데이터는 계속 수신)</span>
        </div>
      )}

      {/* aria-live region */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {liveMessage}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {rows.length === 0 ? (
          <EmptyState hasThoughts={visibleThoughts.length > 0} />
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={rows}
            atBottomStateChange={(atBottom) => setFollowLatest(atBottom)}
            followOutput={followLatest && !paused ? "smooth" : false}
            increaseViewportBy={{ top: 200, bottom: 200 }}
            itemContent={(_index, row) => {
              if (row.kind === "group") {
                return (
                  <div
                    style={{
                      padding: "6px 4px 4px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-tertiary)",
                      letterSpacing: "0.04em",
                      borderBottom: "1px dashed var(--border-subtle)",
                      marginBottom: 4,
                    }}
                  >
                    {row.label}{" "}
                    <span style={{ fontWeight: 500, color: "var(--text-tertiary)" }}>
                      · {row.count}개
                    </span>
                  </div>
                );
              }
              return (
                <div style={{ paddingLeft: 10, position: "relative" }}>
                  <TimelineEntry thought={row.thought} rowKey={row.key} now={now} />
                </div>
              );
            }}
            computeItemKey={(_, row) => row.key}
          />
        )}

        {/* 최신으로 점프 버튼 */}
        {!followLatest && rows.length > 0 && !paused && (
          <button
            type="button"
            onClick={scrollToLatest}
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              padding: "6px 12px",
              background: "var(--brand)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "var(--shadow-md)",
              zIndex: 2,
            }}
          >
            ↓ 최신으로
          </button>
        )}
      </div>
    </div>
  );
}

// ── 빈 상태 ────────────────────────────────────────────────────
function EmptyState({ hasThoughts }: { hasThoughts: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-tertiary)",
        fontSize: 12,
        border: "1px dashed var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        textAlign: "center",
        padding: 16,
      }}
    >
      {hasThoughts
        ? "조건에 맞는 활동이 없습니다 · 필터를 조정하거나 초기화 해보세요"
        : "에이전트 활동 대기 중 · 분석을 시작하면 여기 실시간으로 표시됩니다"}
    </div>
  );
}

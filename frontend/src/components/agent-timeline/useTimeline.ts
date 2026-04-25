/**
 * useTimeline — Zustand 스토어.
 *
 * 검색·필터·일시정지·줌·그룹모드·확장 상태를 보관.
 * thoughts 데이터 자체는 page.tsx의 React state(SSE 스트림)이 SSOT.
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-quinquies
 */

"use client";

import { create } from "zustand";
import type { AgentRole, AgentStatus } from "@/types";
import type { TimelineFilters, TimelineGroupMode, TimelineZoom } from "./types";
import { DEFAULT_FILTERS } from "./types";

interface TimelineState {
  // ── 필터 ──────────────────────────────
  filters: TimelineFilters;
  setQuery: (q: string) => void;
  toggleRole: (role: AgentRole) => void;
  toggleStatus: (s: AgentStatus) => void;
  toggleSignalOnly: () => void;
  resetFilters: () => void;

  // ── 표시 ──────────────────────────────
  zoom: TimelineZoom;
  setZoom: (z: TimelineZoom) => void;

  groupMode: TimelineGroupMode;
  setGroupMode: (m: TimelineGroupMode) => void;

  // ── 일시정지 / 자동 스크롤 ─────────────
  paused: boolean;
  setPaused: (p: boolean) => void;
  togglePaused: () => void;

  followLatest: boolean;
  setFollowLatest: (f: boolean) => void;

  // ── 항목 인라인 펼침 ────────────────────
  expanded: Set<string>;
  toggleExpanded: (key: string) => void;
  collapseAll: () => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  filters: { ...DEFAULT_FILTERS, roles: new Set(), statuses: new Set() },

  setQuery: (q) =>
    set((s) => ({ filters: { ...s.filters, query: q } })),

  toggleRole: (role) =>
    set((s) => {
      const next = new Set(s.filters.roles);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return { filters: { ...s.filters, roles: next } };
    }),

  toggleStatus: (status) =>
    set((s) => {
      const next = new Set(s.filters.statuses);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return { filters: { ...s.filters, statuses: next } };
    }),

  toggleSignalOnly: () =>
    set((s) => ({ filters: { ...s.filters, signalOnly: !s.filters.signalOnly } })),

  resetFilters: () =>
    set(() => ({
      filters: { ...DEFAULT_FILTERS, roles: new Set(), statuses: new Set() },
    })),

  zoom: "comfortable",
  setZoom: (z) => set(() => ({ zoom: z })),

  groupMode: "none",
  setGroupMode: (m) => set(() => ({ groupMode: m })),

  paused: false,
  setPaused: (p) => set(() => ({ paused: p })),
  togglePaused: () => set((s) => ({ paused: !s.paused })),

  followLatest: true,
  setFollowLatest: (f) => set(() => ({ followLatest: f })),

  expanded: new Set<string>(),
  toggleExpanded: (key) =>
    set((s) => {
      const next = new Set(s.expanded);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { expanded: next };
    }),
  collapseAll: () => set(() => ({ expanded: new Set() })),
}));

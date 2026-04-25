"use client";

/**
 * useAgentOffice — 사무실 전역 클라이언트 상태.
 *
 * MS-C: 캐릭터 ↔ 타임라인 양방향 하이라이트, 인스펙터, 북마크, Command Palette.
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies (MS-C)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AgentRole, AgentThought } from "@/types";

interface InspectorState {
  /** 인스펙터에 띄울 에이전트 (없으면 닫힘) */
  role: AgentRole | null;
  /** 추적 모달에 띄울 thought (탭이 thought-detail로 전환됨) */
  thought: AgentThought | null;
}

export interface BookmarkRecord {
  id: string; // hash of role+timestamp
  role: AgentRole;
  status: string;
  content: string;
  timestamp: string;
  signal: string | null;
  note?: string;
  savedAt: string;
}

interface OfficeState {
  // ── 포커스/하이라이트 (캐릭터 ↔ 타임라인 양방향) ──
  focusedRole: AgentRole | null;
  setFocusedRole: (role: AgentRole | null) => void;

  // ── 인스펙터 슬라이드 패널 ──
  inspector: InspectorState;
  openInspector: (role: AgentRole, thought?: AgentThought | null) => void;
  closeInspector: () => void;

  // ── 질문 모달 ──
  askTarget: { role: AgentRole; thought: AgentThought | null } | null;
  openAsk: (role: AgentRole, thought?: AgentThought | null) => void;
  closeAsk: () => void;

  // ── Command Palette ──
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;

  // ── 단축키 오버레이 ──
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;

  // ── 북마크 (persist) ──
  bookmarks: BookmarkRecord[];
  addBookmark: (rec: BookmarkRecord) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (id: string) => boolean;
}

export const useAgentOffice = create<OfficeState>()(
  persist(
    (set, get) => ({
      focusedRole: null,
      setFocusedRole: (role) => set({ focusedRole: role }),

      inspector: { role: null, thought: null },
      openInspector: (role, thought = null) =>
        set({ inspector: { role, thought }, focusedRole: role }),
      closeInspector: () => set({ inspector: { role: null, thought: null } }),

      askTarget: null,
      openAsk: (role, thought = null) => set({ askTarget: { role, thought } }),
      closeAsk: () => set({ askTarget: null }),

      paletteOpen: false,
      setPaletteOpen: (v) => set({ paletteOpen: v }),
      togglePalette: () => set({ paletteOpen: !get().paletteOpen }),

      shortcutsOpen: false,
      setShortcutsOpen: (v) => set({ shortcutsOpen: v }),

      bookmarks: [],
      addBookmark: (rec) => {
        const cur = get().bookmarks;
        if (cur.some((b) => b.id === rec.id)) return;
        set({ bookmarks: [rec, ...cur].slice(0, 500) }); // 상한 500
      },
      removeBookmark: (id) =>
        set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) }),
      isBookmarked: (id) => get().bookmarks.some((b) => b.id === id),
    }),
    {
      name: "agent-office-store",
      storage: createJSONStorage(() => localStorage),
      // 휘발성 상태(인스펙터/팔레트/포커스/askTarget)는 persist 제외
      partialize: (s) => ({ bookmarks: s.bookmarks }),
    },
  ),
);

/**
 * Thought → 안정 ID. role + timestamp + content 첫 32자로 해시 대용.
 */
export function thoughtId(t: { role: string; timestamp: string; content: string }): string {
  return `${t.role}:${t.timestamp}:${t.content.slice(0, 32)}`;
}

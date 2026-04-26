"use client";

/**
 * useAgentStage — 무대 모드 컨트롤러 (MS-S1).
 *
 * Live(라이브) ↔ Story(스토리) ↔ Report(리포트) 3 모드 전환.
 *
 * docs/AGENT_STAGE_REDESIGN_PROPOSAL.md §3.2, §6.2
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type StageMode = "live" | "story" | "report";

interface AgentStageState {
  /** 현재 모드 */
  mode: StageMode;
  /** 자동 전환 사용 여부 (사용자 토글) */
  autoMode: boolean;
  /** 사용자가 수동 전환을 한 시각 — 자동 트리거가 일정 시간 동안 양보 */
  manualOverrideAt: number | null;

  setMode: (mode: StageMode, manual?: boolean) => void;
  setAutoMode: (v: boolean) => void;
  /** 새 분석 시작 시 호출 — 모드를 live로 리셋. */
  resetForNewAnalysis: () => void;
}

/** 사용자가 수동으로 모드를 바꾼 후 자동 전환을 양보할 시간(ms). */
export const MANUAL_OVERRIDE_MS = 30_000;

export const useAgentStage = create<AgentStageState>()(
  persist(
    (set) => ({
      mode: "live",
      autoMode: true,
      manualOverrideAt: null,

      setMode: (mode, manual = false) =>
        set({
          mode,
          manualOverrideAt: manual ? Date.now() : null,
        }),
      setAutoMode: (v) => set({ autoMode: v }),
      resetForNewAnalysis: () =>
        set({ mode: "live", manualOverrideAt: null }),
    }),
    {
      name: "kta_agent_stage_v1",
      storage: createJSONStorage(() => localStorage),
      // mode는 새 세션에서 live로 시작하도록 persist에서 제외
      partialize: (s) => ({ autoMode: s.autoMode }),
    },
  ),
);

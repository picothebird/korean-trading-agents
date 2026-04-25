"use client";

/**
 * MS-F — 개인화 스토어
 *
 * 사용자가 워크스페이스를 자기 워크플로에 맞춰 조정할 수 있도록 핀/순서/숨김,
 * 저장된 뷰(필터 조합), 활동 로그 컬럼 표시, 알림 규칙을 영구 보관한다.
 *
 * @see docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.4 (MS-F)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AgentRole, AgentStatus } from "@/types";

// ── 저장된 뷰 (F2) ──────────────────────────────────────
export interface SavedView {
  id: string;                  // crypto-random or timestamp 기반
  name: string;                // 사용자 지정 (예: "위험 경고만")
  query: string;
  roles: AgentRole[];          // 빈 배열 = 전부
  statuses: AgentStatus[];     // 빈 배열 = 전부
  signalOnly: boolean;
  createdAt: string;           // ISO
}

// ── 알림 규칙 (F5) ──────────────────────────────────────
export type NotificationCondition =
  | { kind: "signal"; signal: "bull" | "bear" | "risk" }
  | { kind: "confidence-min"; min: number } // 0~1
  | { kind: "role"; role: AgentRole }
  | { kind: "status"; status: AgentStatus };

export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  /** AND 조합 — 모든 조건이 매치되어야 발화 */
  conditions: NotificationCondition[];
  /** 토스트(인앱) + browser Notification API */
  channels: { toast: boolean; browser: boolean };
  createdAt: string;
}

// ── 활동 로그 컬럼 (F3) ─────────────────────────────────
export interface TimelineColumns {
  time: boolean;
  agent: boolean;
  signal: boolean;
  stage: boolean;
}

const DEFAULT_COLUMNS: TimelineColumns = {
  time: true,
  agent: true,
  signal: true,
  stage: true,
};

interface PersonalizationState {
  // ── F1: 에이전트 핀/순서/숨김 ──
  pinnedRoles: AgentRole[];           // 표시 순서 고정 (앞쪽)
  hiddenRoles: AgentRole[];           // 완전 숨김
  roleOrder: AgentRole[];             // 명시적 순서 (빈 배열이면 기본 순서)
  togglePin: (role: AgentRole) => void;
  toggleHidden: (role: AgentRole) => void;
  setRoleOrder: (order: AgentRole[]) => void;
  resetLayout: () => void;

  // ── F2: 저장된 뷰 ──
  savedViews: SavedView[];
  addSavedView: (v: Omit<SavedView, "id" | "createdAt">) => SavedView;
  removeSavedView: (id: string) => void;
  renameSavedView: (id: string, name: string) => void;

  // ── F3: 활동 로그 컬럼 ──
  timelineColumns: TimelineColumns;
  toggleColumn: (key: keyof TimelineColumns) => void;
  resetColumns: () => void;

  // ── F5: 알림 규칙 ──
  notificationRules: NotificationRule[];
  notificationsPermission: "default" | "granted" | "denied";
  setNotificationsPermission: (p: "default" | "granted" | "denied") => void;
  addNotificationRule: (r: Omit<NotificationRule, "id" | "createdAt">) => NotificationRule;
  updateNotificationRule: (id: string, patch: Partial<NotificationRule>) => void;
  removeNotificationRule: (id: string) => void;
  toggleNotificationRule: (id: string) => void;
}

function rid(): string {
  // 짧은 랜덤 ID — UUID 미포함 의도적, 의존성 0
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const usePersonalization = create<PersonalizationState>()(
  persist(
    (set, get) => ({
      // F1
      pinnedRoles: [],
      hiddenRoles: [],
      roleOrder: [],
      togglePin: (role) =>
        set((s) => {
          const next = s.pinnedRoles.includes(role)
            ? s.pinnedRoles.filter((r) => r !== role)
            : [...s.pinnedRoles, role];
          // 핀과 숨김은 상호 배타
          const nextHidden = s.hiddenRoles.filter((r) => r !== role);
          return { pinnedRoles: next, hiddenRoles: nextHidden };
        }),
      toggleHidden: (role) =>
        set((s) => {
          const next = s.hiddenRoles.includes(role)
            ? s.hiddenRoles.filter((r) => r !== role)
            : [...s.hiddenRoles, role];
          const nextPinned = s.pinnedRoles.filter((r) => r !== role);
          return { hiddenRoles: next, pinnedRoles: nextPinned };
        }),
      setRoleOrder: (order) => set({ roleOrder: order }),
      resetLayout: () => set({ pinnedRoles: [], hiddenRoles: [], roleOrder: [] }),

      // F2
      savedViews: [],
      addSavedView: (v) => {
        const view: SavedView = { ...v, id: rid(), createdAt: new Date().toISOString() };
        set((s) => ({ savedViews: [view, ...s.savedViews].slice(0, 50) }));
        return view;
      },
      removeSavedView: (id) =>
        set((s) => ({ savedViews: s.savedViews.filter((v) => v.id !== id) })),
      renameSavedView: (id, name) =>
        set((s) => ({
          savedViews: s.savedViews.map((v) => (v.id === id ? { ...v, name } : v)),
        })),

      // F3
      timelineColumns: DEFAULT_COLUMNS,
      toggleColumn: (key) =>
        set((s) => ({ timelineColumns: { ...s.timelineColumns, [key]: !s.timelineColumns[key] } })),
      resetColumns: () => set({ timelineColumns: DEFAULT_COLUMNS }),

      // F5
      notificationRules: [],
      notificationsPermission: "default",
      setNotificationsPermission: (p) => set({ notificationsPermission: p }),
      addNotificationRule: (r) => {
        const rule: NotificationRule = { ...r, id: rid(), createdAt: new Date().toISOString() };
        set((s) => ({ notificationRules: [rule, ...s.notificationRules].slice(0, 50) }));
        return rule;
      },
      updateNotificationRule: (id, patch) =>
        set((s) => ({
          notificationRules: s.notificationRules.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        })),
      removeNotificationRule: (id) =>
        set((s) => ({
          notificationRules: s.notificationRules.filter((r) => r.id !== id),
        })),
      toggleNotificationRule: (id) => {
        const r = get().notificationRules.find((x) => x.id === id);
        if (!r) return;
        get().updateNotificationRule(id, { enabled: !r.enabled });
      },
    }),
    {
      name: "kta-personalization-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/**
 * 9개 역할을 사용자 설정에 따라 정렬·필터한다.
 * - 숨김 처리 (hiddenRoles)
 * - 핀 우선 (pinnedRoles 안에 있는 것들이 앞쪽)
 * - 그 외는 roleOrder 또는 입력 순서 유지
 */
export function applyRolePersonalization(
  defaultRoles: AgentRole[],
  cfg: Pick<PersonalizationState, "pinnedRoles" | "hiddenRoles" | "roleOrder">,
): AgentRole[] {
  const visible = defaultRoles.filter((r) => !cfg.hiddenRoles.includes(r));
  const order = cfg.roleOrder.length > 0 ? cfg.roleOrder : visible;
  // pinned 먼저, 그 다음 order 순
  const pinnedSet = new Set(cfg.pinnedRoles);
  const pinnedOrdered = cfg.pinnedRoles.filter((r) => visible.includes(r));
  const rest = order.filter((r) => visible.includes(r) && !pinnedSet.has(r));
  // visible 중 order에 없는 항목은 뒤에 append
  const seen = new Set([...pinnedOrdered, ...rest]);
  const tail = visible.filter((r) => !seen.has(r));
  return [...pinnedOrdered, ...rest, ...tail];
}

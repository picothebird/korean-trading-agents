"use client";

/**
 * MS-F F5 — 알림 엔진
 *
 * 새 thought가 도착할 때마다 사용자 정의 NotificationRule을 평가해
 * 매치 시 토스트(인앱) + browser Notification API로 알린다.
 *
 * 사용처: page.tsx (또는 SSE 수신부)
 *   const notify = useNotificationEngine();
 *   useEffect(() => { notify(latestThought); }, [latestThought]);
 *
 * @see stores/usePersonalization.ts
 */

import { useCallback, useEffect } from "react";
import type { AgentThought } from "@/types";
import {
  usePersonalization,
  type NotificationCondition,
  type NotificationRule,
} from "@/stores/usePersonalization";
import { extractSignal } from "@/lib/agentLabels";

const FIRED_THIS_SESSION: Set<string> = new Set();

function key(rule: NotificationRule, t: AgentThought): string {
  return `${rule.id}:${t.role}:${t.timestamp}`;
}

function evaluate(rule: NotificationRule, t: AgentThought): boolean {
  if (!rule.enabled) return false;
  if (rule.conditions.length === 0) return false; // 빈 규칙은 무발화 (안전)
  for (const c of rule.conditions) {
    if (!evaluateCondition(c, t)) return false;
  }
  return true;
}

function evaluateCondition(c: NotificationCondition, t: AgentThought): boolean {
  switch (c.kind) {
    case "signal": {
      const sig = extractSignal(t.metadata);
      return sig === c.signal;
    }
    case "confidence-min": {
      const conf = typeof t.metadata?.confidence === "number" ? (t.metadata.confidence as number) : null;
      return conf != null && conf >= c.min;
    }
    case "role":
      return t.role === c.role;
    case "status":
      return t.status === c.status;
    default:
      return false;
  }
}

function fireBrowserNotification(rule: NotificationRule, t: AgentThought) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(`[${rule.name}] ${t.role}`, {
      body: t.content.slice(0, 140),
      tag: rule.id, // 같은 규칙은 가장 최근만 표시
      silent: false,
    });
  } catch {
    // Some browsers throw on too-many notifications — ignore silently
  }
}

/**
 * 토스트 콜백 — page.tsx에 이미 toast helper가 있다면 주입한다.
 * 디폴트는 console.log (개발 시 확인용).
 */
export type NotifyToast = (msg: { title: string; body: string; tone?: "info" | "warning" | "success" }) => void;

const defaultToast: NotifyToast = (m) => {
  console.info(`[notify] ${m.title} — ${m.body}`);
};

/**
 * 알림 엔진. thought를 인자로 호출하면 활성 규칙들을 평가하고,
 * 처음 매치되는 thought당 한 번 발화한다(중복 발화 방지).
 */
export function useNotificationEngine(toast: NotifyToast = defaultToast) {
  const rules = usePersonalization((s) => s.notificationRules);

  return useCallback(
    (t: AgentThought | null | undefined) => {
      if (!t) return;
      for (const rule of rules) {
        if (!evaluate(rule, t)) continue;
        const k = key(rule, t);
        if (FIRED_THIS_SESSION.has(k)) continue;
        FIRED_THIS_SESSION.add(k);
        const title = rule.name;
        const body = `${t.role} · ${t.content.slice(0, 120)}`;
        if (rule.channels.toast) {
          toast({ title, body, tone: "info" });
        }
        if (rule.channels.browser) {
          fireBrowserNotification(rule, t);
        }
      }
    },
    [rules, toast],
  );
}

/**
 * 최신 thought가 변경될 때마다 알림 엔진을 자동 호출하는 헬퍼.
 */
export function useAutoNotify(latestThought: AgentThought | null, toast?: NotifyToast) {
  const notify = useNotificationEngine(toast);
  useEffect(() => {
    notify(latestThought);
  }, [latestThought, notify]);
}

/**
 * 브라우저 알림 권한 요청. SettingsPanel에서 호출.
 */
export async function requestNotificationPermission(): Promise<"granted" | "denied" | "default"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}

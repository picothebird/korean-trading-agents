/**
 * MS-E E1 — 모션 토큰 (Motion design tokens)
 *
 * Framer Motion 컴포넌트 전반에서 일관된 easing/duration을 위해 사용.
 * CSS 토큰 (--ease-*, --duration-*)과 의도적으로 동일한 값을 유지.
 *
 * @see docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.3 (E1)
 */

import type { Transition, Variants } from "framer-motion";

// ── Easing ──────────────────────────────────────────────
export const easeStandard: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
export const easeEnter: [number, number, number, number] = [0.16, 1, 0.3, 1]; // expo-out
export const easeExit: [number, number, number, number] = [0.4, 0, 1, 1]; // ease-in
export const easeSpring: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

// ── Duration (seconds, Framer Motion 기준) ─────────────
export const durationFast = 0.12;
export const durationMed = 0.2;
export const durationSlow = 0.28;
export const durationPage = 0.36;

// ── Spring presets ─────────────────────────────────────
export const springSoft: Transition = { type: "spring", stiffness: 200, damping: 22 };
export const springSnappy: Transition = { type: "spring", stiffness: 300, damping: 26 };
export const springBadge: Transition = { type: "spring", stiffness: 200, damping: 18 };

// ── 변환 프리셋 ─────────────────────────────────────────

/** thought 도착: 100ms 페이드 + 4px 상승 */
export const thoughtArriveTransition: Transition = {
  duration: durationFast,
  ease: easeEnter,
};
export const thoughtArriveVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -2, transition: { duration: durationFast, ease: easeExit } },
};

/** 카드 펼침: 180ms height auto */
export const expandTransition: Transition = {
  duration: 0.18,
  ease: easeStandard,
};

/** 신호 배지 변화: spring(stiffness:200, damping:18) */
export const signalBadgeTransition: Transition = springBadge;

/** 탭/패널 전환: 200ms 페이드 + 8px slide */
export const panelEnterVariants: Variants = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0, transition: { duration: durationMed, ease: easeStandard } },
  exit: { opacity: 0, x: -8, transition: { duration: durationFast, ease: easeExit } },
};

/** 모달/Dialog 진입: 200ms 페이드 + 4px 상승 + 0.97→1 scale */
export const dialogVariants: Variants = {
  initial: { opacity: 0, y: 4, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: durationMed, ease: easeEnter } },
  exit: { opacity: 0, y: 2, scale: 0.98, transition: { duration: durationFast, ease: easeExit } },
};

/** 호버 떠오름 (translateY -2px) — Framer style prop 또는 whileHover */
export const hoverLiftStyle = { y: -2 } as const;
export const tapPressStyle = { scale: 0.98 } as const;

// ── reduced-motion helper ─────────────────────────────

/**
 * `prefers-reduced-motion` 매체 쿼리 동기 체크.
 * Framer Motion은 자동으로 transition.duration을 단축하지만,
 * 명시적으로 분기가 필요한 곳(예: 무한 pulse animation)에서 사용.
 *
 * @example
 * const reduced = prefersReducedMotion();
 * <motion.span animate={reduced ? {} : { opacity: [1, 0.4, 1] }} />
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

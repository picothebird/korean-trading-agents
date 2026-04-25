"use client";
import React, { useEffect, useState } from "react";

export interface CoachStep {
  selector: string;       // CSS selector to highlight
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface OnboardingTourProps {
  steps: CoachStep[];
  storageKey?: string;    // localStorage key to remember dismissal
  onComplete?: () => void;
}

/**
 * Lightweight onboarding tour. Shows a tooltip pinned to a target element
 * for each step. Dismissed state is remembered via localStorage.
 */
export function OnboardingTour({
  steps,
  storageKey = "kta_onboarding_v1",
  onComplete,
}: OnboardingTourProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Mount: check localStorage and start
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey)) return;
    } catch { /* ignore */ }
    // Wait a tick for layout
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
  }, [storageKey]);

  // Track target rect for current step
  useEffect(() => {
    if (!active) return;
    const update = () => {
      const cur = steps[step];
      if (!cur) return;
      const el = document.querySelector(cur.selector);
      if (el) {
        const r = (el as HTMLElement).getBoundingClientRect();
        setRect(r);
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        setRect(null);
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const id = window.setInterval(update, 800);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(id);
    };
  }, [active, step, steps]);

  if (!active) return null;
  const cur = steps[step];
  if (!cur) return null;

  const finish = (skip?: boolean) => {
    setActive(false);
    try { window.localStorage.setItem(storageKey, skip ? "skipped" : "done"); } catch { /* ignore */ }
    onComplete?.();
  };
  const next = () => {
    if (step >= steps.length - 1) finish();
    else setStep(step + 1);
  };

  const popover = computePopover(rect, cur.placement ?? "bottom");

  return (
    <Coachmark
      rect={rect}
      title={cur.title}
      body={cur.body}
      stepLabel={`${step + 1} / ${steps.length}`}
      onSkip={() => finish(true)}
      onNext={next}
      onPrev={step > 0 ? () => setStep(step - 1) : undefined}
      isLast={step >= steps.length - 1}
      popoverStyle={popover}
    />
  );
}

function computePopover(rect: DOMRect | null, placement: "top" | "bottom" | "left" | "right"): React.CSSProperties {
  if (!rect) {
    // Fallback: center of viewport
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }
  const gap = 12;
  const w = 320;
  switch (placement) {
    case "top":
      return { left: Math.min(window.innerWidth - w - 16, Math.max(16, rect.left + rect.width / 2 - w / 2)), top: Math.max(16, rect.top - gap - 160) };
    case "left":
      return { left: Math.max(16, rect.left - w - gap), top: rect.top };
    case "right":
      return { left: Math.min(window.innerWidth - w - 16, rect.right + gap), top: rect.top };
    case "bottom":
    default:
      return { left: Math.min(window.innerWidth - w - 16, Math.max(16, rect.left + rect.width / 2 - w / 2)), top: Math.min(window.innerHeight - 200, rect.bottom + gap) };
  }
}

interface CoachmarkProps {
  rect: DOMRect | null;
  title: string;
  body: string;
  stepLabel?: string;
  onSkip: () => void;
  onNext: () => void;
  onPrev?: () => void;
  isLast?: boolean;
  popoverStyle: React.CSSProperties;
}

export function Coachmark({ rect, title, body, stepLabel, onSkip, onNext, onPrev, isLast, popoverStyle }: CoachmarkProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "var(--bg-scrim)",
        animation: "coach-fade 220ms var(--ease-out-expo)",
      }}
    >
      {rect && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            border: "2px solid var(--brand)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
            pointerEvents: "none",
            transition: "all 220ms var(--ease-out-expo)",
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-title"
        style={{
          position: "fixed",
          width: 320,
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          padding: 16,
          ...popoverStyle,
        }}
      >
        {stepLabel && (
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", margin: 0, letterSpacing: "0.04em" }}>{stepLabel}</p>
        )}
        <h3 id="coach-title" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "4px 0 6px" }}>{title}</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{body}</p>
        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            onClick={onSkip}
            style={{
              background: "transparent", border: "none",
              color: "var(--text-tertiary)", fontSize: 12, fontWeight: 500,
              cursor: "pointer", padding: 0,
            }}
          >
            건너뛰기
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            {onPrev && (
              <button
                type="button"
                onClick={onPrev}
                style={{
                  background: "var(--bg-overlay)", color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  padding: "6px 12px", borderRadius: "var(--radius-sm)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              style={{
                background: "var(--brand)", color: "var(--text-inverse)",
                border: "1px solid var(--brand)",
                padding: "6px 14px", borderRadius: "var(--radius-sm)",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              {isLast ? "시작하기" : "다음"}
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes coach-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

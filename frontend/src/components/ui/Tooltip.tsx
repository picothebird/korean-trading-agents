"use client";

import {
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

// ── Tooltip ─────────────────────────────────────────────────────────
// Lightweight, design-system-friendly tooltip.
// - Replaces native `title=` attributes (ugly, uncontrollable).
// - Hover + focus reveal, ESC to dismiss.
// - Auto-positions above the trigger; collapses to bottom near top edge.
// - Uses CSS variables so it adapts to light/dark themes.

export type TooltipProps = {
  /** Tooltip body. Plain string or rich content. */
  content: ReactNode;
  /** The element that triggers the tooltip on hover/focus. */
  children: ReactElement;
  /** Preferred placement. */
  placement?: "top" | "bottom";
  /** Delay before showing (ms). */
  delay?: number;
  /** Force a max width (px). Default 240. */
  maxWidth?: number;
  /** Disable the tooltip (renders children only). */
  disabled?: boolean;
};

export function Tooltip({
  content,
  children,
  placement = "top",
  delay = 120,
  maxWidth = 240,
  disabled,
}: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; place: "top" | "bottom"; arrowOffset: number } | null>(null);

  const compute = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let place: "top" | "bottom" = placement;
    // Flip if not enough room above; or for bottom if not enough below
    if (placement === "top" && rect.top < 56) place = "bottom";
    if (placement === "bottom" && vh - rect.bottom < 80) place = "top";
    const top = place === "top" ? rect.top - margin : rect.bottom + margin;
    // Estimate bubble width using maxWidth as upper bound; clamp center to viewport
    const halfW = Math.min(maxWidth, 320) / 2;
    const desired = rect.left + rect.width / 2;
    const edgePad = 10;
    const left = Math.max(halfW + edgePad, Math.min(vw - halfW - edgePad, desired));
    const arrowOffset = desired - left; // relative to bubble center, used if needed
    setCoords({ top, left, place, arrowOffset });
  }, [placement, maxWidth]);

  const show = useCallback(() => {
    if (disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      compute();
      setOpen(true);
    }, delay);
  }, [compute, delay, disabled]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const onScroll = () => compute();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, compute, hide]);

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(
    children as ReactElement<Record<string, unknown>>,
    {
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node;
        const original = (children as { ref?: unknown }).ref;
        if (typeof original === "function") (original as (n: HTMLElement | null) => void)(node);
        else if (original && typeof original === "object") {
          const refObj = original as { current: HTMLElement | null };
          // eslint-disable-next-line react-hooks/immutability
          refObj.current = node;
        }
      },
      onMouseEnter: (e: React.MouseEvent) => {
        (children.props as { onMouseEnter?: (e: React.MouseEvent) => void }).onMouseEnter?.(e);
        show();
      },
      onMouseLeave: (e: React.MouseEvent) => {
        (children.props as { onMouseLeave?: (e: React.MouseEvent) => void }).onMouseLeave?.(e);
        hide();
      },
      onFocus: (e: React.FocusEvent) => {
        (children.props as { onFocus?: (e: React.FocusEvent) => void }).onFocus?.(e);
        show();
      },
      onBlur: (e: React.FocusEvent) => {
        (children.props as { onBlur?: (e: React.FocusEvent) => void }).onBlur?.(e);
        hide();
      },
      "aria-describedby": open ? id : undefined,
    }
  );

  const bubbleStyle: CSSProperties | undefined = coords
    ? {
        position: "fixed",
        top: coords.top,
        left: coords.left,
        transform:
          coords.place === "top"
            ? "translate(-50%, -100%)"
            : "translate(-50%, 0)",
        maxWidth,
        background: "var(--tooltip-bg, #111418)",
        color: "var(--tooltip-fg, #f5f7fa)",
        border: "1px solid var(--tooltip-border, rgba(255,255,255,0.08))",
        boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
        padding: "9px 12px",
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        pointerEvents: "none",
        whiteSpace: "normal",
        wordBreak: "keep-all",
        zIndex: 1000,
      }
    : undefined;

  return (
    <>
      {trigger}
      {open && coords && (
        <div ref={bubbleRef} id={id} role="tooltip" style={bubbleStyle}>
          {content}
        </div>
      )}
    </>
  );
}

export default Tooltip;

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
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// ── Tooltip ─────────────────────────────────────────────────────────
// Lightweight, design-system-friendly tooltip.
// - Replaces native `title=` attributes (ugly, uncontrollable).
// - Hover + focus reveal, ESC to dismiss.
// - Auto-positions above the trigger; collapses to bottom near top edge.
// - Uses CSS variables so it adapts to light/dark themes.

// 안내 문구가 한 줄로 길어지지 않도록, 문장 끝/구분자(`·`) 뒤에 자동 줄바꿈을
// 삽입한다. 숫자 소수점(0.18, 1.5bps 등)은 영향 받지 않도록 공백+한글/영문
// 시작 문자만 매칭한다.
function formatTooltipText(s: string): string {
  return s
    .replace(/([.!?])\s+(?=[가-힣A-Za-z(])/g, "$1\n")
    .replace(/\s+·\s+/g, "\n· ");
}

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
    // 실제 버블 크기를 알 수 있으면 그것으로, 아니면 보수적으로 추정 (≈180px 높이까지 가능).
    const bubble = bubbleRef.current;
    const estH = bubble?.offsetHeight ?? 180;
    let place: "top" | "bottom" = placement;
    // 위쪽 공간이 추정 높이보다 모자라면 아래로 뒤집는다.
    if (placement === "top" && rect.top - margin < estH + 8) place = "bottom";
    if (placement === "bottom" && vh - rect.bottom - margin < estH + 8) place = "top";
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

  // 버블이 마운트된 직후 실제 크기로 다시 위치 계산해서 뷰포트 상단/하단 잘림 방지.
  useLayoutEffect(() => {
    if (!open) return;
    compute();
    // 한 번 더 — 첫 compute 결과로 transform 이 적용된 뒤에 실측이 정확해진다.
    const raf = requestAnimationFrame(() => compute());
    return () => cancelAnimationFrame(raf);
  }, [open, compute]);

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
        lineHeight: 1.55,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        pointerEvents: "none",
        whiteSpace: "pre-line",
        wordBreak: "keep-all",
        zIndex: 1000,
      }
    : undefined;

  return (
    <>
      {trigger}
      {open && coords && (
        <div ref={bubbleRef} id={id} role="tooltip" style={bubbleStyle}>
          {typeof content === "string" ? formatTooltipText(content) : content}
        </div>
      )}
    </>
  );
}

export default Tooltip;

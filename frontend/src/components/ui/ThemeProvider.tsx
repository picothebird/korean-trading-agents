"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * 테마 모드.
 * - light/dark: 명시적 선택
 * - system: OS 컬러 스킴 추종
 */
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/**
 * UI 폰트/배율 스케일.
 * - sm: 기본 (디폴트)
 * - md: 중간 — 약 +12%
 * - lg: 크게 — 약 +25% (시력이 낮은 사용자용)
 *
 * 적용은 globals.css 의 `:root[data-font-scale="..."]` 룰에서 `zoom` 속성으로 처리한다.
 * px 기반 인라인 스타일이 많은 코드베이스 특성상, rem 변환 없이 한 번에 비례 확대가 가능한
 * `zoom` 이 가장 신뢰할 수 있는 방법이다 (모던 브라우저 호환).
 */
export type FontScale = "sm" | "md" | "lg";

const STORAGE_KEY = "kta:theme";
const FONT_SCALE_KEY = "kta:font-scale";
const VALID_MODES: ReadonlySet<string> = new Set(["light", "dark", "system"]);
const VALID_FONT_SCALES: ReadonlySet<string> = new Set(["sm", "md", "lg"]);

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v && VALID_MODES.has(v)) return v as ThemeMode;
  return "system";
}

function readStoredFontScale(): FontScale {
  if (typeof window === "undefined") return "sm";
  const v = window.localStorage.getItem(FONT_SCALE_KEY);
  if (v && VALID_FONT_SCALES.has(v)) return v as FontScale;
  return "sm";
}

function detectSystem(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved === "dark" ? "dark" : "light";
}

function applyFontScaleDom(scale: FontScale) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-font-scale", scale);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");
  const [fontScale, setFontScaleState] = useState<FontScale>("sm");

  // Initial sync from storage + system (post-mount).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStoredMode());
    setSystemTheme(detectSystem());
    setFontScaleState(readStoredFontScale());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const resolved: ResolvedTheme = useMemo(() => {
    if (mode === "system") return systemTheme;
    return mode;
  }, [mode, systemTheme]);

  // Reflect to <html data-theme>
  useEffect(() => {
    applyDom(resolved);
  }, [resolved]);

  // Reflect to <html data-font-scale>
  useEffect(() => {
    applyFontScaleDom(fontScale);
  }, [fontScale]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore storage errors (private mode etc.) */
    }
  }, []);

  const setFontScale = useCallback((next: FontScale) => {
    setFontScaleState(next);
    try {
      window.localStorage.setItem(FONT_SCALE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, setMode, fontScale, setFontScale }),
    [mode, resolved, setMode, fontScale, setFontScale]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback: avoid throwing in unrelated trees; return inert default
    return {
      mode: "system",
      resolved: "light",
      setMode: () => {
        /* noop */
      },
      fontScale: "sm",
      setFontScale: () => {
        /* noop */
      },
    };
  }
  return ctx;
}

/** Inline script string injected into <head> to set theme + font-scale before first paint (FOUC prevention). */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var valid=(s==='light'||s==='dark'||s==='system');var m=valid?s:'system';var r=(m==='system')?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.setAttribute('data-theme',r);document.documentElement.style.colorScheme=(r==='dark')?'dark':'light';var fs=localStorage.getItem('${FONT_SCALE_KEY}');var fsv=(fs==='sm'||fs==='md'||fs==='lg')?fs:'sm';document.documentElement.setAttribute('data-font-scale',fsv);}catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-font-scale','sm');}})();`;

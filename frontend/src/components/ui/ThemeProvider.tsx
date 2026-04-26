"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * 테마 모드.
 * - light/dark: 명시적 선택
 * - system: OS 컬러 스킴 추종
 */
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "kta:theme";
const VALID_MODES: ReadonlySet<string> = new Set(["light", "dark", "system"]);

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v && VALID_MODES.has(v)) return v as ThemeMode;
  return "system";
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");

  // Initial sync from storage + system (post-mount).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStoredMode());
    setSystemTheme(detectSystem());
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

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore storage errors (private mode etc.) */
    }
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

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
    };
  }
  return ctx;
}

/** Inline script string injected into <head> to set theme before first paint (FOUC prevention). */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var valid=(s==='light'||s==='dark'||s==='system');var m=valid?s:'system';var r=(m==='system')?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.setAttribute('data-theme',r);document.documentElement.style.colorScheme=(r==='dark')?'dark':'light';}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

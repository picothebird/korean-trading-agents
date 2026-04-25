"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "kta:theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function detectSystem(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");

  // Initial sync from storage + system (post-mount; FOUC handled by inline head script).
  // setState inside effect is the standard pattern for SSR-safe localStorage hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStoredMode());
    setSystemTheme(detectSystem());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme = mode === "system" ? systemTheme : mode;

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
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var m=(s==='light'||s==='dark'||s==='system')?s:'system';var sysDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=m==='system'?(sysDark?'dark':'light'):m;document.documentElement.setAttribute('data-theme',r);document.documentElement.style.colorScheme=r;}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { kstTimeBand } from "@/lib/krMarket";

/**
 * MS-E E4/E6 — 테마 모드.
 * - light/dark: 명시적 선택
 * - system: OS 컬러 스킴 추종
 * - warm: 따뜻한 베이지/카카오 톤 (E4)
 * - hanok: 한옥 묵향 + 자연광 톤 (E4)
 * - auto-time: 사용자 한국 표준시 기준 자동 (아침/낮=light, 저녁/밤=dark) (E6)
 */
export type ThemeMode = "light" | "dark" | "system" | "warm" | "hanok" | "auto-time";
export type ResolvedTheme = "light" | "dark" | "warm" | "hanok";

const STORAGE_KEY = "kta:theme";
const VALID_MODES: ReadonlySet<string> = new Set(["light", "dark", "system", "warm", "hanok", "auto-time"]);

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

function resolveAutoTime(): ResolvedTheme {
  // 아침/낮 → light, 저녁/밤 → dark (KST 기준)
  const band = kstTimeBand();
  return band === "morning" || band === "day" ? "light" : "dark";
}

function applyDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
  // color-scheme은 light/dark만 의미 있음. warm/hanok도 라이트 베이스이므로 light로 고정.
  document.documentElement.style.colorScheme = resolved === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");
  const [autoTimeTheme, setAutoTimeTheme] = useState<ResolvedTheme>("light");

  // Initial sync from storage + system + auto-time (post-mount).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStoredMode());
    setSystemTheme(detectSystem());
    setAutoTimeTheme(resolveAutoTime());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    // 매 5분마다 auto-time 재계산 (장 시간대 경계에서 부드러운 전환)
    const interval = window.setInterval(() => setAutoTimeTheme(resolveAutoTime()), 5 * 60 * 1000);
    return () => {
      mq.removeEventListener("change", onChange);
      window.clearInterval(interval);
    };
  }, []);

  const resolved: ResolvedTheme = useMemo(() => {
    if (mode === "system") return systemTheme;
    if (mode === "auto-time") return autoTimeTheme;
    return mode;
  }, [mode, systemTheme, autoTimeTheme]);

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
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var valid=(s==='light'||s==='dark'||s==='system'||s==='warm'||s==='hanok'||s==='auto-time');var m=valid?s:'system';var r;if(m==='system'){r=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}else if(m==='auto-time'){var d=new Date();var utc=d.getTime()+d.getTimezoneOffset()*60000;var kst=new Date(utc+9*3600000);var hr=kst.getHours();r=(hr>=6&&hr<18)?'light':'dark';}else{r=m;}document.documentElement.setAttribute('data-theme',r);document.documentElement.style.colorScheme=(r==='dark')?'dark':'light';}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

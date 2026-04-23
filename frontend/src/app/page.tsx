"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought, AgentRole, TradeDecision, BacktestResult, StockIndicators } from "@/types";
import { AgentOffice, ActivityFeed } from "@/components/AgentOffice";
import { DecisionCard } from "@/components/DecisionCard";
import { BacktestPanel } from "@/components/BacktestPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { startAnalysis, streamAnalysis, getMarketIndices, runBacktest, getStock, searchStocks, startAgentBacktest, streamAgentBacktest } from "@/lib/api";

const POPULAR_TICKERS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "005380", name: "현대차" },
  { code: "035420", name: "NAVER" },
  { code: "051910", name: "LG화학" },
  { code: "000270", name: "기아" },
];

type Tab = "analysis" | "backtest";
const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.4 };

// ── Utility: KRX market session check ────────────────────────────
function isKRXOpen(): boolean {
  try {
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const h = kst.getHours(), m = kst.getMinutes();
    const total = h * 60 + m;
    const day = kst.getDay();
    return day >= 1 && day <= 5 && total >= 9 * 60 && total <= 15 * 60 + 30;
  } catch { return false; }
}

// ── Stock Context Bar ─────────────────────────────────────────────
function StockContextBar({ info, ticker, companyName }: { info: StockIndicators | null; ticker: string; companyName: string }) {
  const open = isKRXOpen();
  const isUp = (info?.change_pct ?? 0) >= 0;
  const priceColor = isUp ? "var(--bull)" : "var(--bear)";

  const rangeProgress = info && info.high_52w > info.low_52w
    ? ((info.current_price - info.low_52w) / (info.high_52w - info.low_52w)) * 100
    : 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)", padding: "11px 18px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 0, overflowX: "auto",
      }}
    >
      {/* Company name + ticker */}
      {(companyName || ticker) && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, paddingRight: 14, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
              {companyName || ticker}
            </span>
            {companyName && (
              <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {ticker}
              </span>
            )}
          </div>
          <div style={{ width: 1, height: 22, background: "var(--border-subtle)", flexShrink: 0, marginRight: 14 }} />
        </>
      )}

      {/* Market session */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 16, flexShrink: 0 }}>
        <motion.div
          animate={open ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={{ duration: 2, repeat: open ? Infinity : 0 }}
          style={{ width: 7, height: 7, borderRadius: "50%", background: open ? "var(--success)" : "var(--text-tertiary)", flexShrink: 0 }}
        />
        <span style={{ fontSize: 10, color: open ? "var(--success)" : "var(--text-tertiary)", fontWeight: 700, whiteSpace: "nowrap" }}>
          {open ? "장 개장" : "장 마감"}
        </span>
      </div>

      <div style={{ width: 1, height: 22, background: "var(--border-subtle)", flexShrink: 0, marginRight: 16 }} />

      {/* Price */}
      {info ? (
        <>
          <div style={{ paddingRight: 16, flexShrink: 0 }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: priceColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {info.current_price.toLocaleString("ko-KR")}
            </p>
            <p style={{ fontSize: 10, color: priceColor, fontVariantNumeric: "tabular-nums", marginTop: 2, fontWeight: 600 }}>
              {isUp ? "▲" : "▼"} {Math.abs(info.change_pct).toFixed(2)}%
            </p>
          </div>

          <div style={{ width: 1, height: 22, background: "var(--border-subtle)", flexShrink: 0, marginRight: 16 }} />

          {/* RSI-14 */}
          {info.rsi_14 != null && (
            <>
              <div style={{ paddingRight: 16, flexShrink: 0 }}>
                <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4 }}>RSI-14</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 44, height: 3, background: "var(--bg-overlay)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(100, info.rsi_14)}%`, height: "100%", borderRadius: 99,
                      background: info.rsi_14 >= 70 ? "var(--bull)" : info.rsi_14 <= 30 ? "var(--bear)" : "var(--brand)",
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    color: info.rsi_14 >= 70 ? "var(--bull)" : info.rsi_14 <= 30 ? "var(--bear)" : "var(--text-primary)" }}>
                    {info.rsi_14.toFixed(0)}
                  </span>
                  {info.rsi_14 >= 70 && <span style={{ fontSize: 8, color: "var(--bull)", fontWeight: 700 }}>과매수</span>}
                  {info.rsi_14 <= 30 && <span style={{ fontSize: 8, color: "var(--bear)", fontWeight: 700 }}>과매도</span>}
                </div>
              </div>
              <div style={{ width: 1, height: 22, background: "var(--border-subtle)", flexShrink: 0, marginRight: 16 }} />
            </>
          )}

          {/* 52W Range bar */}
          <div style={{ flex: 1, minWidth: 100, paddingRight: 16 }}>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4 }}>52주 범위</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {(info.low_52w / 1000).toFixed(0)}K
              </span>
              <div style={{ flex: 1, height: 3, background: "var(--bg-overlay)", borderRadius: 99, position: "relative" }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, rangeProgress))}%`, height: "100%",
                  background: "var(--brand)", borderRadius: 99, position: "absolute",
                }} />
                <div style={{
                  position: "absolute", left: `${Math.min(96, Math.max(2, rangeProgress))}%`,
                  top: -4, width: 11, height: 11, borderRadius: "50%",
                  background: priceColor, border: "2px solid var(--bg-surface)", transform: "translateX(-50%)",
                }} />
              </div>
              <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {(info.high_52w / 1000).toFixed(0)}K
              </span>
            </div>
          </div>

          {/* Volume */}
          {info.volume > 0 && (
            <>
              <div style={{ width: 1, height: 22, background: "var(--border-subtle)", flexShrink: 0, marginRight: 16 }} />
              <div style={{ flexShrink: 0 }}>
                <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 2 }}>거래량</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {info.volume >= 1_000_000 ? `${(info.volume / 1_000_000).toFixed(1)}M`
                    : info.volume >= 1_000 ? `${(info.volume / 1_000).toFixed(0)}K`
                    : String(info.volume)}
                </p>
              </div>
            </>
          )}
        </>
      ) : (
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{companyName || ticker} · 시세 데이터 로딩 중...</span>
      )}
    </motion.div>
  );
}

// ── Pipeline Progress ─────────────────────────────────────────────
const PIPELINE_LAYERS = [
  { name: "L1 · 데이터", roles: ["technical_analyst", "fundamental_analyst", "sentiment_analyst", "macro_analyst"] as AgentRole[], total: 4 },
  { name: "L2 · 토론", roles: ["bull_researcher", "bear_researcher"] as AgentRole[], total: 2 },
  { name: "L3 · 결정", roles: ["risk_manager", "portfolio_manager"] as AgentRole[], total: 2 },
] as const;

function PipelineProgress({ thoughts, isRunning, isDone }: {
  thoughts: Map<AgentRole, AgentThought>;
  isRunning: boolean;
  isDone: boolean;
}) {
  if (!isRunning && thoughts.size === 0) return null;

  const layerStates = PIPELINE_LAYERS.map((l) => {
    const done = l.roles.filter(r => thoughts.get(r)?.status === "done").length;
    const active = l.roles.filter(r => ["thinking", "analyzing", "debating", "deciding"].includes(thoughts.get(r)?.status ?? "")).length;
    return { ...l, done, active, complete: done === l.total };
  });

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={SPRING}
      style={{ overflow: "hidden", marginBottom: 14 }}
    >
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)", padding: "12px 20px",
        display: "flex", alignItems: "center",
      }}>
        {layerStates.map((layer, i) => {
          const isActive = !layer.complete && layer.active > 0;
          const dotColor = layer.complete ? "var(--success)" : isActive ? "var(--brand)" : "var(--text-tertiary)";
          return (
            <div key={layer.name} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : 0 }}>
              {/* Step circle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <motion.div
                  animate={isActive ? { scale: [1, 1.14, 1] } : { scale: 1 }}
                  transition={{ duration: 1.4, repeat: isActive ? Infinity : 0 }}
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: layer.complete ? "var(--success-subtle)" : isActive ? "var(--brand-subtle)" : "var(--bg-elevated)",
                    border: `2px solid ${dotColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: dotColor, flexShrink: 0,
                  }}
                >
                  {layer.complete ? "✓" : `${layer.done}`}
                </motion.div>
                <div style={{ flexShrink: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                    color: layer.complete ? "var(--success)" : isActive ? "var(--brand)" : "var(--text-tertiary)" }}>
                    {layer.name}
                  </p>
                  <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                    {layer.complete ? "완료" : isActive ? `${layer.active}개 진행` : `0/${layer.total}`}
                  </p>
                </div>
              </div>
              {/* Connector line */}
              {i < 2 && (
                <div style={{ flex: 1, height: 2, margin: "0 10px", background: "var(--bg-overlay)", position: "relative", overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: layer.complete ? "100%" : "0%" }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    style={{ position: "absolute", inset: 0, background: "var(--success)" }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {isDone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12, flexShrink: 0 }}
          >
            <span style={{ fontSize: 14 }}>✅</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--success)", whiteSpace: "nowrap" }}>분석 완료</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Ticker Search Input (자동완성) ────────────────────────────────
type StockSuggestion = { code: string; name: string; market: string };

function TickerSearchInput({
  ticker,
  companyName,
  onChange,
}: {
  ticker: string;
  companyName: string;
  onChange: (code: string, name: string) => void;
}) {
  const [query, setQuery] = useState(companyName ? `${companyName} (${ticker})` : ticker);
  const [results, setResults] = useState<StockSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 외부 클릭시 드롭다운 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ticker/companyName 외부 변경 반영
  useEffect(() => {
    setQuery(companyName ? `${companyName} (${ticker})` : ticker);
  }, [companyName, ticker]);

  const handleInput = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      const res = await searchStocks(value);
      setResults(res);
    }, 300);
  };

  const handleSelect = (item: StockSuggestion) => {
    onChange(item.code, item.name);
    setQuery(`${item.name} (${item.code})`);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder="종목명 또는 코드 입력"
        style={{
          width: "100%", padding: "8px 10px", borderRadius: "var(--radius-md)",
          background: "var(--bg-input)", border: "1px solid var(--border-default)",
          color: "var(--text-primary)", fontSize: 11, outline: "none",
          boxSizing: "border-box",
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)", overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {results.map((item) => (
            <button
              key={item.code}
              onClick={() => handleSelect(item)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "8px 12px",
                background: "transparent", border: "none", borderBottom: "1px solid var(--border-subtle)",
                cursor: "pointer", textAlign: "left", transition: "background 120ms",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 1 }}>{item.name}</p>
                <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{item.market}</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 8 }}>
                {item.code}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Human Approval Modal ──────────────────────────────────────────
function HumanApprovalModal({
  decision,
  onApprove,
  onReject,
}: {
  decision: TradeDecision;
  onApprove: () => void;
  onReject: () => void;
}) {
  const cfg = decision.action === "BUY"
    ? { color: "var(--bull)", label: "매수" }
    : decision.action === "SELL"
    ? { color: "var(--bear)", label: "매도" }
    : { color: "var(--hold)", label: "관망" };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(12,13,16,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        transition={SPRING}
        style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-2xl)", padding: 28, maxWidth: 440, width: "100%",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--warning)" }}>인간 승인 필요</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>고신뢰도 / 대규모 포지션 결정</p>
          </div>
        </div>

        <div style={{
          background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)",
          padding: "14px 16px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: cfg.color }}>{cfg.label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{decision.ticker}</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>{decision.reasoning}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, background: "var(--bg-overlay)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
              <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>신뢰도</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>{Math.round(decision.confidence * 100)}%</p>
            </div>
            <div style={{ flex: 1, background: "var(--bg-overlay)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
              <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Kelly 포지션</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {decision.agents_summary?.kelly_position_pct ?? decision.agents_summary?.position_size_pct ?? 0}%
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onReject} style={{
            flex: 1, padding: "10px 0", borderRadius: "var(--radius-lg)",
            background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
            color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            거부
          </button>
          <button onClick={onApprove} style={{
            flex: 2, padding: "10px 0", borderRadius: "var(--radius-lg)",
            background: cfg.color, border: "none",
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            승인 — {cfg.label} 진행
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [ticker, setTicker] = useState("005930");
  const [companyName, setCompanyName] = useState("삼성전자");
  const [isRunning, setIsRunning] = useState(false);
  const [thoughts, setThoughts] = useState<Map<AgentRole, AgentThought>>(new Map());
  const [activeAgents, setActiveAgents] = useState<Set<AgentRole>>(new Set());
  const [decision, setDecision] = useState<TradeDecision | null>(null);
  const [logs, setLogs] = useState<AgentThought[]>([]);
  const [marketData, setMarketData] = useState<Record<string, { current: number; change_pct: number }>>({});
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btMode, setBtMode] = useState<"ma" | "agent">("ma");
  const [btProgress, setBtProgress] = useState<Array<{ date: string; signal: string; confidence: number; step: number; total: number }>>([]);
  const btCleanupRef = useRef<(() => void) | null>(null);
  const [approvalModal, setApprovalModal] = useState(false);
  const [stockInfo, setStockInfo] = useState<StockIndicators | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMarketIndices().then(setMarketData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ticker) return;
    setStockInfo(null);
    const timer = setTimeout(() => {
      getStock(ticker).then(res => {
        setStockInfo(res.indicators ?? null);
        if (res.info?.name && res.info.name !== "Unknown") setCompanyName(res.info.name);
      }).catch(() => setStockInfo(null));
    }, 700);
    return () => clearTimeout(timer);
  }, [ticker]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tgt.tagName)) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (tab === "analysis") handleAnalyze();
        else handleBacktest();
      }
      if (e.key === "Escape") setApprovalModal(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, handleAnalyze, handleBacktest]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleAnalyze = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setDecision(null);
    setThoughts(new Map());
    setActiveAgents(new Set());
    setLogs([]);
    try {
      const { session_id } = await startAnalysis(ticker);
      streamAnalysis(
        session_id,
        (thought) => {
          setThoughts((prev) => new Map(prev).set(thought.role as AgentRole, thought));
          setActiveAgents((prev) => {
            const next = new Set(prev);
            if (thought.status === "done" || thought.status === "idle") next.delete(thought.role as AgentRole);
            else next.add(thought.role as AgentRole);
            return next;
          });
          setLogs((prev) => [...prev.slice(-99), thought]);
        },
        (dec) => {
          setDecision(dec);
          if (dec.agents_summary?.requires_human_approval) {
            setApprovalModal(true);
          }
        },
        () => { setIsRunning(false); setActiveAgents(new Set()); }
      );
    } catch { setIsRunning(false); }
  }, [ticker, isRunning]);

  const handleBacktest = useCallback(async () => {
    setBtLoading(true); setBtResult(null); setBtProgress([]);
    if (btMode === "ma") {
      try {
        const result = await runBacktest({ ticker, start_date: "2022-01-01", end_date: "2024-12-31", initial_capital: 10_000_000 });
        setBtResult(result);
      } finally { setBtLoading(false); }
    } else {
      try {
        const { session_id } = await startAgentBacktest({ ticker, start_date: "2022-01-01", end_date: "2024-12-31", initial_capital: 10_000_000 });
        const cleanup = streamAgentBacktest(
          session_id,
          (evt) => {
            if (evt.metadata?.step && evt.metadata?.total) {
              setBtProgress(prev => [...prev, {
                date: evt.metadata?.date ?? "",
                signal: evt.metadata?.signal ?? "HOLD",
                confidence: evt.metadata?.confidence ?? 0.5,
                step: evt.metadata.step!,
                total: evt.metadata.total!,
              }]);
            }
          },
          (result) => { setBtResult(result); },
          () => { setBtLoading(false); }
        );
        btCleanupRef.current = cleanup;
      } catch {
        setBtLoading(false);
      }
    }
  }, [ticker, btMode]);

  // active agent count for status badge
  const activeCount = activeAgents.size;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: 248, flexShrink: 0, background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)", display: "flex",
        flexDirection: "column", padding: "20px 0", position: "sticky",
        top: 0, height: "100vh", overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{
              width: 32, height: 32, borderRadius: "var(--radius-md)",
              background: "var(--brand)", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 16, flexShrink: 0,
            }}>🤖</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>Korean Trading</p>
              <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>AI 멀티에이전트</p>
            </div>
          </div>
        </div>

        {/* Market indices */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            시장 지수
          </p>
          {Object.keys(marketData).length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>로딩 중...</p>
          ) : (
            Object.entries(marketData).map(([name, data]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{name}</p>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {data.current.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                  </p>
                  <p style={{ fontSize: 10, color: data.change_pct >= 0 ? "var(--bull)" : "var(--bear)", fontVariantNumeric: "tabular-nums" }}>
                    {data.change_pct >= 0 ? "+" : ""}{data.change_pct.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stock selector */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            종목 선택
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
            {POPULAR_TICKERS.map(({ code, name }) => (
              <button key={code} onClick={() => { setTicker(code); setCompanyName(name); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 10px", borderRadius: "var(--radius-md)", border: "none",
                  background: ticker === code ? "var(--brand-subtle)" : "transparent",
                  color: ticker === code ? "var(--brand)" : "var(--text-secondary)",
                  fontSize: 12, fontWeight: ticker === code ? 600 : 400,
                  cursor: "pointer", textAlign: "left", transition: "all 150ms",
                }}
                onMouseEnter={(e) => { if (ticker !== code) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                onMouseLeave={(e) => { if (ticker !== code) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span>{name}</span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{code}</span>
              </button>
            ))}
          </div>
          <TickerSearchInput
            ticker={ticker}
            companyName={companyName}
            onChange={(code, name) => { setTicker(code); setCompanyName(name); }}
          />
        </div>

        {/* Nav tabs */}
        <div style={{ padding: "16px 20px" }}>
          {(["analysis", "backtest"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "9px 10px", borderRadius: "var(--radius-md)", border: "none",
                background: tab === t ? "var(--bg-elevated)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 12, fontWeight: tab === t ? 600 : 400,
                cursor: "pointer", marginBottom: 2, transition: "all 150ms",
              }}
            >
              <span>{t === "analysis" ? "🔍" : "📈"}</span>
              {t === "analysis" ? "AI 분석" : "백테스트"}
              {t === "analysis" && activeCount > 0 && (
                <span style={{
                  marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "1px 6px",
                  borderRadius: 99, background: "var(--brand)", color: "#fff",
                }}>
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Disclaimer + Settings button */}
        <div style={{ marginTop: "auto", padding: "16px 20px" }}>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "9px 10px", borderRadius: "var(--radius-md)", border: "none",
              background: "var(--bg-elevated)", color: "var(--text-secondary)",
              fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 10,
              transition: "all 150ms",
            }}
          >
            <span>⚙️</span> 설정
          </button>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            ⚠ 본 시스템은 투자 참고용입니다.<br />실제 투자 결정은 본인 책임입니다.
          </p>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, padding: "24px 28px", overflowY: "auto" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>
              {tab === "analysis" ? "AI 에이전트 분석" : "전략 백테스트"}
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              {companyName && <><span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{companyName}</span> · </>}
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{ticker}</span>
              {tab === "analysis"
                ? " · 8개 에이전트 병렬 분석"
                : " · 2022.01 ~ 2024.12 · 초기자본 1,000만원"}
            </p>
          </div>
          <motion.button
            onClick={tab === "analysis" ? handleAnalyze : handleBacktest}
            disabled={isRunning || btLoading}
            whileTap={{ scale: 0.96 }}
            style={{
              padding: "10px 22px", borderRadius: "var(--radius-xl)", border: "none",
              background: (isRunning || btLoading) ? "var(--bg-elevated)" : "var(--brand)",
              color: (isRunning || btLoading) ? "var(--text-tertiary)" : "#fff",
              fontSize: 13, fontWeight: 700, cursor: (isRunning || btLoading) ? "not-allowed" : "pointer",
              boxShadow: (isRunning || btLoading) ? "none" : "0 4px 16px var(--brand-glow)",
              transition: "all 200ms",
            }}
          >
            {tab === "analysis"
              ? isRunning ? "분석 중..." : "분석 시작"
              : btLoading ? "실행 중..." : "백테스트 실행"}
            {!isRunning && !btLoading && (
              <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 6, fontWeight: 400 }}>Space</span>
            )}
          </motion.button>
        </div>

        {/* ── Stock Context Bar ──────────────────────────────── */}
        <StockContextBar info={stockInfo} ticker={ticker} companyName={companyName} />

        <AnimatePresence mode="wait">
          {tab === "analysis" ? (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
              style={{ display: "flex", flexDirection: "column", gap: 0 }}
            >
              {/* Pipeline progress */}
              <PipelineProgress thoughts={thoughts} isRunning={isRunning} isDone={!isRunning && !!decision} />

              {/* Main 2-column grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
              {/* Left: Agent grid + activity feed */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Agent office */}
                <div style={{
                  background: "var(--bg-surface)", borderRadius: "var(--radius-2xl)",
                  border: "1px solid var(--border-subtle)", padding: 20,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                    에이전트 오피스
                  </p>
                  <AgentOffice thoughts={thoughts} activeAgents={activeAgents} />
                </div>

                {/* Activity feed */}
                <div style={{
                  background: "var(--bg-surface)", borderRadius: "var(--radius-2xl)",
                  border: "1px solid var(--border-subtle)", padding: 20,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                    실시간 활동 피드
                  </p>
                  <ActivityFeed logs={logs} logEndRef={logEndRef} />
                </div>
              </div>

              {/* Right: Decision + system info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {decision ? (
                  <DecisionCard
                    decision={decision}
                    onHumanApproval={decision.agents_summary?.requires_human_approval ? () => setApprovalModal(true) : undefined}
                  />
                ) : (
                  <div style={{
                    background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-2xl)", padding: "40px 20px",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 12, textAlign: "center",
                  }}>
                    <motion.span
                      animate={{ rotate: isRunning ? [0, 10, -10, 0] : 0 }}
                      transition={{ duration: 1.5, repeat: isRunning ? Infinity : 0 }}
                      style={{ fontSize: 48 }}
                    >
                      {isRunning ? "🔍" : "🎯"}
                    </motion.span>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {isRunning ? "에이전트들이 분석 중입니다..." : "분석 시작을 눌러 AI 에이전트를 가동하세요"}
                    </p>
                    {isRunning && (
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {activeCount}개 에이전트 활성화
                      </p>
                    )}
                  </div>
                )}

                {/* System info card */}
                <div style={{
                  background: "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-xl)", padding: "16px 18px",
                }}>
                  <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    시스템 구성
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      ["Layer 1", "기술/펀더/감성/매크로 병렬 분석"],
                      ["Layer 2", "강세 vs 약세 AI 토론"],
                      ["Layer 3", "Kelly 기준 리스크 & 최종 결정"],
                    ].map(([layer, desc]) => (
                      <div key={layer} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99,
                          background: "var(--brand-subtle)", color: "var(--brand)", flexShrink: 0,
                        }}>{layer}</span>
                        <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="backtest"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
              style={{
                background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-2xl)", padding: 24,
              }}
            >
              {/* 전략 선택 토글 */}
              {!btResult && !btLoading && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    백테스트 전략
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([
                      { key: "ma" as const, label: "MA 교차 전략", desc: "이동평균 골든/데드크로스 · 즉시 실행", icon: "📊" },
                      { key: "agent" as const, label: "AI 에이전트", desc: "월별 LLM 시그널 · 실제 AI 판단 적용", icon: "🤖" },
                    ]).map(({ key, label, desc, icon }) => {
                      const active = btMode === key;
                      return (
                        <button key={key} onClick={() => setBtMode(key)}
                          style={{
                            flex: 1, padding: "14px 16px", borderRadius: "var(--radius-xl)",
                            border: `1.5px solid ${active ? "var(--brand)" : "var(--border-default)"}`,
                            background: active ? "rgba(49,130,246,0.08)" : "var(--bg-elevated)",
                            cursor: "pointer", textAlign: "left", transition: "all 150ms",
                          }}
                        >
                          <p style={{ fontSize: 18, marginBottom: 6 }}>{icon}</p>
                          <p style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--brand)" : "var(--text-primary)", marginBottom: 3 }}>{label}</p>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{desc}</p>
                          {key === "agent" && (
                            <p style={{ fontSize: 9, color: "var(--brand)", marginTop: 4, fontWeight: 600 }}>
                              gpt-5.4-mini · 월별 {`~`}24회 호출
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {btResult ? (
                <div>
                  {/* 사용된 전략 뱃지 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                      background: "var(--brand-subtle)", color: "var(--brand)",
                    }}>
                      {btMode === "agent" ? "🤖 AI 에이전트 백테스트" : "📊 MA 교차 전략"}
                    </span>
                    <button
                      onClick={() => { setBtResult(null); setBtProgress([]); }}
                      style={{
                        fontSize: 10, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0,
                      }}
                    >
                      ↩ 다시 설정
                    </button>
                  </div>
                  <BacktestPanel result={btResult} />
                </div>
              ) : btLoading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    style={{ fontSize: 48 }}
                  >
                    {btMode === "agent" ? "🤖" : "⚙️"}
                  </motion.span>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {btMode === "agent" ? "AI 에이전트가 과거 시점별 판단 중..." : "시뮬레이션 실행 중..."}
                  </p>

                  {/* AI 모드: 진행 로그 */}
                  {btMode === "agent" && btProgress.length > 0 && (
                    <div style={{
                      width: "100%", maxWidth: 480, maxHeight: 200, overflowY: "auto",
                      background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)",
                      padding: "12px 14px", border: "1px solid var(--border-subtle)",
                    }}>
                      {/* 진행 바 */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>진행</span>
                          <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                            {btProgress[btProgress.length - 1]?.step ?? 0} / {btProgress[btProgress.length - 1]?.total ?? "?"}
                          </span>
                        </div>
                        <div style={{ height: 4, background: "var(--border-subtle)", borderRadius: 2, overflow: "hidden" }}>
                          <motion.div
                            animate={{ width: `${((btProgress[btProgress.length - 1]?.step ?? 0) / (btProgress[btProgress.length - 1]?.total ?? 1)) * 100}%` }}
                            style={{ height: "100%", background: "var(--brand)", borderRadius: 2 }}
                          />
                        </div>
                      </div>
                      {/* 시그널 로그 */}
                      {[...btProgress].reverse().slice(0, 8).map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{p.date}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, flexShrink: 0,
                            background: p.signal === "BUY" ? "rgba(47,202,115,0.15)" : p.signal === "SELL" ? "rgba(240,68,82,0.15)" : "var(--bg-surface)",
                            color: p.signal === "BUY" ? "var(--success)" : p.signal === "SELL" ? "var(--bear)" : "var(--text-tertiary)",
                          }}>
                            {p.signal}
                          </span>
                          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{(p.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", height: 200, gap: 12,
                }}>
                  <span style={{ fontSize: 48 }}>📈</span>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    전략을 선택하고 백테스트 실행 버튼을 누르세요
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Human Approval Modal ────────────────────────────────── */}
      <AnimatePresence>
        {approvalModal && decision && (
          <HumanApprovalModal
            decision={decision}
            onApprove={() => setApprovalModal(false)}
            onReject={() => {
              setApprovalModal(false);
              setDecision(null);
            }}
          />
        )}
      </AnimatePresence>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}



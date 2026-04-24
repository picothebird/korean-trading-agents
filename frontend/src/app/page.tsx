"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought, AgentRole, TradeDecision, BacktestResult, StockIndicators } from "@/types";
import { ActivityFeed } from "@/components/AgentOffice";
import { DecisionCard } from "@/components/DecisionCard";
import { BacktestPanel } from "@/components/BacktestPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { KisPanel } from "@/components/KisPanel";
import { PixelOffice } from "@/components/PixelOffice";
import {
  startAnalysis, streamAnalysis, getMarketIndices, runBacktest,
  getStock, searchStocks, startAgentBacktest, streamAgentBacktest,
} from "@/lib/api";

// ── Constants ────────────────────────────────────────────────────
const POPULAR_TICKERS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "005380", name: "현대차" },
  { code: "035420", name: "NAVER" },
  { code: "051910", name: "LG화학" },
  { code: "000270", name: "기아" },
];

type Tab = "analysis" | "backtest" | "trading";
const SPRING = { ease: [0.16, 1, 0.3, 1] as const, duration: 0.4 };

// ── Utilities ─────────────────────────────────────────────────────
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

function formatPrice(n: number): string {
  return n.toLocaleString("ko-KR");
}

// ── Toss-style Stock Price Card ───────────────────────────────────
function StockPriceCard({
  info,
  ticker,
  companyName,
}: {
  info: StockIndicators | null;
  ticker: string;
  companyName: string;
}) {
  const open = isKRXOpen();
  const isUp = (info?.change_pct ?? 0) >= 0;
  const priceColor = isUp ? "var(--bull)" : "var(--bear)";

  const rangeProgress =
    info && info.high_52w > info.low_52w
      ? ((info.current_price - info.low_52w) / (info.high_52w - info.low_52w)) * 100
      : 50;

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-xl)",
        padding: "16px 18px",
        marginBottom: 2,
      }}
    >
      {/* Company header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
            {companyName || ticker}
          </p>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {ticker}
            <span style={{ marginLeft: 8 }}>
              <motion.span
                animate={open ? { opacity: [1, 0.3, 1] } : { opacity: 0.4 }}
                transition={{ duration: 2, repeat: open ? Infinity : 0 }}
                style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: open ? "var(--success)" : "var(--text-tertiary)", marginRight: 3, verticalAlign: "middle" }}
              />
              <span style={{ color: open ? "var(--success)" : "var(--text-tertiary)", fontSize: 9, fontWeight: 600 }}>
                {open ? "장 개장" : "장 마감"}
              </span>
            </span>
          </p>
        </div>

        {info && (
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>거래량</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {info.volume >= 1_000_000
                ? `${(info.volume / 1_000_000).toFixed(1)}M`
                : info.volume >= 1_000
                ? `${(info.volume / 1_000).toFixed(0)}K`
                : String(info.volume)}
            </p>
          </div>
        )}
      </div>

      {/* Price */}
      {info ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <p
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: priceColor,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              &#8361;{formatPrice(info.current_price)}
            </p>
            <p
              style={{
                fontSize: 13,
                color: priceColor,
                fontVariantNumeric: "tabular-nums",
                marginTop: 5,
                fontWeight: 600,
              }}
            >
              {isUp ? "▲" : "▼"} {Math.abs(info.change_pct).toFixed(2)}%
            </p>
          </div>

          {/* Key indicators row */}
          <div style={{ display: "flex", gap: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
            {/* RSI */}
            {info.rsi_14 != null && (
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4 }}>RSI-14</p>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ flex: 1, height: 3, background: "var(--bg-overlay)", borderRadius: 99, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, info.rsi_14)}%`,
                        height: "100%",
                        borderRadius: 99,
                        background:
                          info.rsi_14 >= 70 ? "var(--bull)" : info.rsi_14 <= 30 ? "var(--bear)" : "var(--brand)",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color:
                        info.rsi_14 >= 70 ? "var(--bull)" : info.rsi_14 <= 30 ? "var(--bear)" : "var(--text-primary)",
                    }}
                  >
                    {info.rsi_14.toFixed(0)}
                  </span>
                </div>
              </div>
            )}

            {/* 52W Range */}
            {info.high_52w > 0 && (
              <div style={{ flex: 2 }}>
                <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4 }}>52주 범위</p>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {(info.low_52w / 1000).toFixed(0)}K
                  </span>
                  <div style={{ flex: 1, height: 3, background: "var(--bg-overlay)", borderRadius: 99, position: "relative" }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, rangeProgress))}%`,
                        height: "100%",
                        background: "var(--brand)",
                        borderRadius: 99,
                        position: "absolute",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: `${Math.min(96, Math.max(2, rangeProgress))}%`,
                        top: -4,
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        background: priceColor,
                        border: "2px solid var(--bg-elevated)",
                        transform: "translateX(-50%)",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {(info.high_52w / 1000).toFixed(0)}K
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* MA indicators */}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {[
              { label: "MA5", val: info.ma5 },
              { label: "MA20", val: info.ma20 },
              ...(info.ma60 != null ? [{ label: "MA60", val: info.ma60 }] : []),
            ].map(({ label, val }) => (
              <div key={label} style={{ flex: 1, background: "var(--bg-overlay)", borderRadius: "var(--radius-md)", padding: "6px 8px" }}>
                <p style={{ fontSize: 8, color: "var(--text-tertiary)", marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: val > info.current_price ? "var(--bear)" : "var(--bull)", fontVariantNumeric: "tabular-nums" }}>
                  {(val / 1000).toFixed(1)}K
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          {/* Skeleton */}
          <div style={{ height: 36, background: "var(--bg-overlay)", borderRadius: 6, marginBottom: 8 }} />
          <div style={{ height: 18, width: "60%", background: "var(--bg-overlay)", borderRadius: 6 }} />
        </div>
      )}
    </div>
  );
}

// ── Pipeline Progress Bar ─────────────────────────────────────────
const PIPELINE_LAYERS = [
  { name: "L1", full: "데이터 수집", roles: ["technical_analyst", "fundamental_analyst", "sentiment_analyst", "macro_analyst"] as AgentRole[], total: 4 },
  { name: "L2", full: "토론", roles: ["bull_researcher", "bear_researcher"] as AgentRole[], total: 2 },
  { name: "L3", full: "결정", roles: ["risk_manager", "portfolio_manager"] as AgentRole[], total: 2 },
] as const;

function PipelineProgress({
  thoughts,
  isRunning,
  isDone,
}: {
  thoughts: Map<AgentRole, AgentThought>;
  isRunning: boolean;
  isDone: boolean;
}) {
  if (!isRunning && thoughts.size === 0) return null;

  const layerStates = PIPELINE_LAYERS.map((l) => {
    const done = l.roles.filter((r) => thoughts.get(r)?.status === "done").length;
    const active = l.roles.filter((r) =>
      ["thinking", "analyzing", "debating", "deciding"].includes(thoughts.get(r)?.status ?? "")
    ).length;
    return { ...l, done, active, complete: done === l.total };
  });

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={SPRING}
      style={{ overflow: "hidden", marginBottom: 12 }}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-lg)",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 0,
        }}
      >
        {layerStates.map((layer, i) => {
          const isActive = !layer.complete && layer.active > 0;
          const dotColor = layer.complete ? "var(--success)" : isActive ? "var(--brand)" : "var(--text-tertiary)";
          return (
            <div key={layer.name} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <motion.div
                  animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 1.4, repeat: isActive ? Infinity : 0 }}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: layer.complete ? "var(--success-subtle)" : isActive ? "var(--brand-subtle)" : "var(--bg-overlay)",
                    border: `2px solid ${dotColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                    color: dotColor,
                    flexShrink: 0,
                  }}
                >
                  {layer.complete ? "✓" : `${layer.done}`}
                </motion.div>
                <div style={{ flexShrink: 0 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, whiteSpace: "nowrap", color: layer.complete ? "var(--success)" : isActive ? "var(--brand)" : "var(--text-tertiary)" }}>
                    {layer.name} · {layer.full}
                  </p>
                  <p style={{ fontSize: 8, color: "var(--text-tertiary)" }}>
                    {layer.complete ? "완료" : isActive ? `${layer.active}개 진행` : `0/${layer.total}`}
                  </p>
                </div>
              </div>
              {i < 2 && (
                <div style={{ flex: 1, height: 2, margin: "0 8px", background: "var(--bg-overlay)", position: "relative", overflow: "hidden" }}>
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
            style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 10, flexShrink: 0 }}
          >
            <span style={{ fontSize: 12 }}>✅</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--success)", whiteSpace: "nowrap" }}>완료</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Stock Search Input ────────────────────────────────────────────
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setQuery(companyName ? `${companyName} (${ticker})` : ticker);
  }, [companyName, ticker]);

  const handleInput = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await searchStocks(value);
        setResults(res);
      } catch { setResults([]); }
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
        placeholder="종목명 또는 코드 검색..."
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
          fontSize: 12,
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 150ms",
        }}
        onFocusCapture={(e) => ((e.target as HTMLInputElement).style.borderColor = "var(--brand)")}
        onBlurCapture={(e) => ((e.target as HTMLInputElement).style.borderColor = "var(--border-default)")}
      />
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 60,
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {results.map((item) => (
              <button
                key={item.code}
                onClick={() => handleSelect(item)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 120ms",
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
          </motion.div>
        )}
      </AnimatePresence>
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
  const cfg =
    decision.action === "BUY"
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
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(12,13,16,0.88)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        transition={SPRING}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-2xl)",
          padding: 28,
          maxWidth: 440,
          width: "100%",
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

        <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "14px 16px", marginBottom: 16 }}>
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
          <button
            onClick={onReject}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            거부
          </button>
          <button
            onClick={onApprove}
            style={{
              flex: 2,
              padding: "11px 0",
              borderRadius: "var(--radius-lg)",
              background: cfg.color,
              border: "none",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            승인 — {cfg.label} 진행
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Analysis tab empty state ──────────────────────────────────────
function AnalysisEmptyState({ isRunning, activeCount }: { isRunning: boolean; activeCount: number }) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-xl)",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
      }}
    >
      <motion.span
        animate={{ rotate: isRunning ? [0, 10, -10, 0] : 0 }}
        transition={{ duration: 1.5, repeat: isRunning ? Infinity : 0 }}
        style={{ fontSize: 36 }}
      >
        {isRunning ? "🔍" : "🎯"}
      </motion.span>
      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        {isRunning ? "에이전트들이 분석 중..." : "분석 시작을 눌러 AI 에이전트를 가동하세요"}
      </p>
      {isRunning && (
        <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
          {activeCount}개 에이전트 활성화
        </p>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [ticker, setTicker] = useState("005930");
  const [companyName, setCompanyName] = useState("삼성전자");
  const [isRunning, setIsRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
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
  const analysisCleanupRef = useRef<(() => void) | null>(null);
  const [approvalModal, setApprovalModal] = useState(false);
  const [stockInfo, setStockInfo] = useState<StockIndicators | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [kisOrderTicker, setKisOrderTicker] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // Market data
  useEffect(() => {
    getMarketIndices().then(setMarketData).catch(() => {});
  }, []);

  // Stock info on ticker change
  useEffect(() => {
    if (!ticker) return;
    setStockInfo(null);
    const timer = setTimeout(() => {
      getStock(ticker)
        .then((res) => {
          setStockInfo(res.indicators ?? null);
          if (res.info?.name && res.info.name !== "Unknown") setCompanyName(res.info.name);
        })
        .catch(() => setStockInfo(null));
    }, 700);
    return () => clearTimeout(timer);
  }, [ticker]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Core handlers ──────────────────────────────────────────────
  const handleCancelAnalysis = useCallback(() => {
    analysisCleanupRef.current?.();
    analysisCleanupRef.current = null;
    setIsRunning(false);
    setActiveAgents(new Set());
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (isRunning) return;
    // Close any existing SSE before starting new analysis
    analysisCleanupRef.current?.();
    analysisCleanupRef.current = null;
    setIsRunning(true);
    setAnalysisError(null);
    setDecision(null);
    setThoughts(new Map());
    setActiveAgents(new Set());
    setLogs([]);
    try {
      const { session_id } = await startAnalysis(ticker);
      const cleanup = streamAnalysis(
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
          if (dec.agents_summary?.requires_human_approval) setApprovalModal(true);
        },
        () => {
          setIsRunning(false);
          setActiveAgents(new Set());
        },
        (errMsg) => {
          setAnalysisError(errMsg);
        }
      );
      analysisCleanupRef.current = cleanup;
    } catch {
      setIsRunning(false);
      setAnalysisError("분석 요청 실패. 백엔드가 실행 중인지 확인하세요.");
    }
  }, [ticker, isRunning]);

  const handleBacktest = useCallback(async () => {
    if (btLoading) return;
    setBtLoading(true);
    setBtResult(null);
    setBtProgress([]);
    if (btMode === "ma") {
      try {
        const result = await runBacktest({
          ticker,
          start_date: "2022-01-01",
          end_date: "2024-12-31",
          initial_capital: 10_000_000,
        });
        setBtResult(result);
      } finally {
        setBtLoading(false);
      }
    } else {
      try {
        const { session_id } = await startAgentBacktest({
          ticker,
          start_date: "2022-01-01",
          end_date: "2024-12-31",
          initial_capital: 10_000_000,
        });
        const cleanup = streamAgentBacktest(
          session_id,
          (evt) => {
            if (evt.metadata?.step && evt.metadata?.total) {
              const meta = evt.metadata;
              setBtProgress((prev) => [
                ...prev,
                {
                  date: meta.date ?? "",
                  signal: meta.signal ?? "HOLD",
                  confidence: meta.confidence ?? 0.5,
                  step: meta.step!,
                  total: meta.total!,
                },
              ]);
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
  }, [ticker, btMode, btLoading]);

  // Cleanup SSE connections on unmount
  useEffect(() => {
    return () => {
      analysisCleanupRef.current?.();
      btCleanupRef.current?.();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tgt.tagName)) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (tab === "analysis") {
          if (isRunning) handleCancelAnalysis();
          else handleAnalyze();
        } else if (tab === "backtest") {
          handleBacktest();
        }
      }
      if (e.key === "Escape") {
        setApprovalModal(false);
        if (isRunning) handleCancelAnalysis();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, handleAnalyze, handleBacktest, handleCancelAnalysis, isRunning]);

  const activeCount = activeAgents.size;

  // Tab navigation handler
  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    if (newTab === "trading" && decision?.ticker && !kisOrderTicker) {
      setKisOrderTicker(decision.ticker);
    }
  }, [decision, kisOrderTicker]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      {/* ═══════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Toss-style stock + controls               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside
        style={{
          width: 420,
          flexShrink: 0,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {/* ── Logo header ────────────────────────────────────── */}
        <div
          style={{
            padding: "16px 20px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-md)",
                background: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              🤖
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>Korean Trading</p>
              <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>AI 멀티에이전트 투자 시스템</p>
            </div>
          </div>

          {/* Market indices compact */}
          <div style={{ display: "flex", gap: 10 }}>
            {Object.entries(marketData)
              .slice(0, 2)
              .map(([name, data]) => (
                <div key={name} style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 8, color: "var(--text-tertiary)", marginBottom: 1 }}>{name}</p>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: data.change_pct >= 0 ? "var(--bull)" : "var(--bear)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {data.change_pct >= 0 ? "+" : ""}
                    {data.change_pct.toFixed(2)}%
                  </p>
                </div>
              ))}
          </div>
        </div>

        {/* ── Scrollable content area ────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Stock search + popular tickers */}
          <div style={{ marginBottom: 10 }}>
            <TickerSearchInput
              ticker={ticker}
              companyName={companyName}
              onChange={(code, name) => { setTicker(code); setCompanyName(name); }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {POPULAR_TICKERS.map(({ code, name }) => (
                <button
                  key={code}
                  onClick={() => { setTicker(code); setCompanyName(name); }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 99,
                    border: `1px solid ${ticker === code ? "var(--brand)" : "var(--border-default)"}`,
                    background: ticker === code ? "var(--brand-subtle)" : "transparent",
                    color: ticker === code ? "var(--brand)" : "var(--text-tertiary)",
                    fontSize: 10,
                    fontWeight: ticker === code ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 150ms",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Toss-style stock price card */}
          <StockPriceCard info={stockInfo} ticker={ticker} companyName={companyName} />

          {/* ── Pill Tab Navigation ──────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "12px 0 10px",
              borderBottom: "1px solid var(--border-subtle)",
              marginBottom: 14,
              flexShrink: 0,
            }}
          >
            {(["analysis", "backtest", "trading"] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: active ? "var(--brand)" : "var(--bg-elevated)",
                    color: active ? "#fff" : "var(--text-secondary)",
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    cursor: "pointer",
                    transition: "all 200ms var(--ease-out-expo)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    position: "relative",
                  }}
                >
                  <span>{t === "analysis" ? "🔍" : t === "backtest" ? "📊" : "💰"}</span>
                  <span>{t === "analysis" ? "분석" : t === "backtest" ? "백테스트" : "매매"}</span>
                  {t === "analysis" && activeCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 4,
                        fontSize: 8,
                        fontWeight: 700,
                        padding: "1px 4px",
                        borderRadius: 99,
                        background: active ? "rgba(255,255,255,0.3)" : "var(--brand)",
                        color: "#fff",
                        lineHeight: 1.4,
                      }}
                    >
                      {activeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Tab content ─────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {tab === "analysis" && (
              <motion.div
                key="analysis"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={SPRING}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {/* Run / Cancel button row */}
                <div style={{ display: "flex", gap: 6 }}>
                  <motion.button
                    onClick={handleAnalyze}
                    disabled={isRunning}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      flex: 1,
                      padding: "12px 0",
                      borderRadius: "var(--radius-xl)",
                      border: "none",
                      background: isRunning ? "var(--bg-elevated)" : "var(--brand)",
                      color: isRunning ? "var(--text-tertiary)" : "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: isRunning ? "not-allowed" : "pointer",
                      boxShadow: isRunning ? "none" : "0 4px 16px var(--brand-glow)",
                      transition: "all 200ms",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {isRunning ? (
                      <>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          style={{ fontSize: 14 }}
                        >
                          ⚙️
                        </motion.span>
                        분석 중...
                      </>
                    ) : (
                      <>
                        🔍 분석 시작
                        <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 400 }}>Space</span>
                      </>
                    )}
                  </motion.button>
                  {isRunning && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={handleCancelAnalysis}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-xl)",
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-elevated)",
                        color: "var(--text-tertiary)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                      title="분석 중단 (Esc)"
                    >
                      중단
                    </motion.button>
                  )}
                </div>

                {/* Error state */}
                <AnimatePresence>
                  {analysisError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-lg)",
                        background: "rgba(240,68,82,0.1)",
                        border: "1px solid rgba(240,68,82,0.25)",
                      }}
                    >
                      <span style={{ fontSize: 14 }}>⚠️</span>
                      <p style={{ fontSize: 11, color: "var(--bear)", flex: 1 }}>{analysisError}</p>
                      <button
                        onClick={() => setAnalysisError(null)}
                        style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0, lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pipeline progress */}
                <AnimatePresence>
                  {(isRunning || thoughts.size > 0) && (
                    <PipelineProgress
                      thoughts={thoughts}
                      isRunning={isRunning}
                      isDone={!isRunning && !!decision}
                    />
                  )}
                </AnimatePresence>

                {/* Decision card or empty state */}
                {decision ? (
                  <>
                    <DecisionCard
                      decision={decision}
                      onHumanApproval={
                        decision.agents_summary?.requires_human_approval
                          ? () => setApprovalModal(true)
                          : undefined
                      }
                    />
                    <motion.button
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setKisOrderTicker(decision.ticker); handleTabChange("trading"); }}
                      style={{
                        width: "100%",
                        padding: "10px 0",
                        borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-elevated)",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 150ms",
                      }}
                    >
                      💰 KIS 매매 탭에서 주문하기
                    </motion.button>
                  </>
                ) : (
                  <AnalysisEmptyState isRunning={isRunning} activeCount={activeCount} />
                )}

                {/* System info */}
                <div
                  style={{
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--radius-lg)",
                    padding: "12px 14px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    시스템 구성
                  </p>
                  {[
                    ["Layer 1", "기술/펀더/감성/매크로 병렬 분석"],
                    ["Layer 2", "강세 vs 약세 AI 토론"],
                    ["Layer 3", "Kelly 기준 리스크 & 최종 결정"],
                  ].map(([l, d]) => (
                    <div key={l} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 5 }}>
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          padding: "2px 5px",
                          borderRadius: 99,
                          background: "var(--brand-subtle)",
                          color: "var(--brand)",
                          flexShrink: 0,
                        }}
                      >
                        {l}
                      </span>
                      <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>{d}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {tab === "backtest" && (
              <motion.div
                key="backtest"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={SPRING}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {/* Strategy selector */}
                {!btResult && !btLoading && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {(
                      [
                        { key: "ma" as const, label: "MA 교차", desc: "이동평균 골든/데드크로스", icon: "📊" },
                        { key: "agent" as const, label: "AI 에이전트", desc: "월별 LLM 시그널 적용", icon: "🤖" },
                      ] as const
                    ).map(({ key, label, desc, icon }) => {
                      const active = btMode === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setBtMode(key)}
                          style={{
                            flex: 1,
                            padding: "12px 10px",
                            borderRadius: "var(--radius-xl)",
                            border: `1.5px solid ${active ? "var(--brand)" : "var(--border-default)"}`,
                            background: active ? "rgba(49,130,246,0.08)" : "var(--bg-elevated)",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 150ms",
                          }}
                        >
                          <p style={{ fontSize: 16, marginBottom: 4 }}>{icon}</p>
                          <p style={{ fontSize: 11, fontWeight: 700, color: active ? "var(--brand)" : "var(--text-primary)", marginBottom: 2 }}>{label}</p>
                          <p style={{ fontSize: 9, color: "var(--text-tertiary)", lineHeight: 1.4 }}>{desc}</p>
                          {key === "agent" && (
                            <p style={{ fontSize: 8, color: "var(--brand)", marginTop: 3, fontWeight: 600 }}>
                              gpt-5.4-mini · ~24회/월
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Run button */}
                {!btResult && (
                  <motion.button
                    onClick={handleBacktest}
                    disabled={btLoading}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      width: "100%",
                      padding: "12px 0",
                      borderRadius: "var(--radius-xl)",
                      border: "none",
                      background: btLoading ? "var(--bg-elevated)" : "var(--brand)",
                      color: btLoading ? "var(--text-tertiary)" : "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: btLoading ? "not-allowed" : "pointer",
                      boxShadow: btLoading ? "none" : "0 4px 16px var(--brand-glow)",
                      transition: "all 200ms",
                    }}
                  >
                    {btLoading ? "실행 중..." : "백테스트 실행"}
                    {!btLoading && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 6, fontWeight: 400 }}>Space</span>}
                  </motion.button>
                )}

                {/* Loading state */}
                {btLoading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      style={{ fontSize: 36 }}
                    >
                      {btMode === "agent" ? "🤖" : "⚙️"}
                    </motion.span>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {btMode === "agent" ? "AI 에이전트 과거 판단 중..." : "시뮬레이션 실행 중..."}
                    </p>

                    {btMode === "agent" && btProgress.length > 0 && (
                      <div
                        style={{
                          width: "100%",
                          background: "var(--bg-elevated)",
                          borderRadius: "var(--radius-lg)",
                          padding: "10px 12px",
                          maxHeight: 160,
                          overflowY: "auto",
                        }}
                      >
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>진행</span>
                            <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                              {btProgress[btProgress.length - 1]?.step ?? 0} / {btProgress[btProgress.length - 1]?.total ?? "?"}
                            </span>
                          </div>
                          <div style={{ height: 3, background: "var(--border-subtle)", borderRadius: 2, overflow: "hidden" }}>
                            <motion.div
                              animate={{
                                width: `${((btProgress[btProgress.length - 1]?.step ?? 0) / (btProgress[btProgress.length - 1]?.total ?? 1)) * 100}%`,
                              }}
                              style={{ height: "100%", background: "var(--brand)", borderRadius: 2 }}
                            />
                          </div>
                        </div>
                        {[...btProgress]
                          .reverse()
                          .slice(0, 6)
                          .map((p, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                              <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{p.date}</span>
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: 99,
                                  flexShrink: 0,
                                  background:
                                    p.signal === "BUY"
                                      ? "rgba(47,202,115,0.15)"
                                      : p.signal === "SELL"
                                      ? "rgba(240,68,82,0.15)"
                                      : "var(--bg-surface)",
                                  color:
                                    p.signal === "BUY"
                                      ? "var(--success)"
                                      : p.signal === "SELL"
                                      ? "var(--bear)"
                                      : "var(--text-tertiary)",
                                }}
                              >
                                {p.signal}
                              </span>
                              <span style={{ fontSize: 8, color: "var(--text-tertiary)" }}>{(p.confidence * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Result */}
                {btResult && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: 99,
                          background: "var(--brand-subtle)",
                          color: "var(--brand)",
                        }}
                      >
                        {btMode === "agent" ? "🤖 AI 에이전트" : "📊 MA 교차"}
                      </span>
                      <button
                        onClick={() => { setBtResult(null); setBtProgress([]); }}
                        style={{ fontSize: 9, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        ↩ 다시 설정
                      </button>
                    </div>
                    <BacktestPanel result={btResult} />
                  </div>
                )}

                {/* Empty state */}
                {!btResult && !btLoading && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "24px 0",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 36 }}>📈</span>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
                      전략을 선택하고 백테스트 실행 버튼을 누르세요
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center" }}>
                      {ticker} · 2022.01 ~ 2024.12 · 초기자본 1,000만원
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {tab === "trading" && (
              <motion.div
                key="trading"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={SPRING}
              >
                <KisPanel prefillTicker={kisOrderTicker || ticker} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 150ms",
              flexShrink: 0,
            }}
          >
            ⚙️ 설정
          </button>
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            ⚠ 투자 참고용. 실제 투자는 본인 책임.
          </p>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Pixel Agent Office                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg-base)",
        }}
      >
        {/* ── Right panel header ─────────────────────────────── */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              에이전트 오피스
            </p>
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                background: "var(--bg-elevated)",
                padding: "2px 8px",
                borderRadius: 99,
                border: "1px solid var(--border-subtle)",
              }}
            >
              8 에이전트 · 3 레이어
            </span>
          </div>

          {/* Status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isRunning && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand)", display: "inline-block" }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--brand)" }}>
                  분석 중 · {activeCount}개 활성
                </span>
              </motion.div>
            )}
            {!isRunning && thoughts.size > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: decision ? "var(--success)" : "var(--text-tertiary)" }}>
                {decision ? "✅ 분석 완료" : `${thoughts.size}/8 완료`}
              </span>
            )}
          </div>
        </div>

        {/* ── Pixel Office Canvas ─────────────────────────────── */}
        <div style={{ flex: 1, minHeight: 0, padding: "12px 16px 0", overflow: "hidden", display: "flex", alignItems: "flex-start" }}>
          <PixelOffice thoughts={thoughts} activeAgents={activeAgents} />
        </div>

        {/* ── Activity Feed ───────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            height: 160,
            borderTop: "1px solid var(--border-subtle)",
            padding: "10px 16px",
            overflow: "hidden",
          }}
        >
          <p
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            실시간 활동 로그
          </p>
          <ActivityFeed logs={logs} logEndRef={logEndRef} />
        </div>
      </main>

      {/* ── Human Approval Modal ────────────────────────────── */}
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

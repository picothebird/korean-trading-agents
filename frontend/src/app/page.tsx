"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentThought, AgentRole, TradeDecision, BacktestResult, StockIndicators, AppUser } from "@/types";
import { ActivityFeed } from "@/components/AgentOffice";
import { DecisionCard } from "@/components/DecisionCard";
import { AnalysisReport } from "@/components/AnalysisReport";
import { BacktestPanel } from "@/components/BacktestPanel";
import { SettingsPanel, type SettingsTab } from "@/components/SettingsPanel";
import { KisPanel } from "@/components/KisPanel";
import { PixelOffice } from "@/components/PixelOffice";
import { StockChartPanel } from "@/components/StockChartPanel";
import { AutoLoopPanel, type AutoTradeRecord } from "@/components/AutoLoopPanel";
import { PortfolioLoopPanel } from "@/components/PortfolioLoopPanel";
import { TabPills, OnboardingTour, type CoachStep, BrandMark, Icon, Tooltip, Dialog, Loader } from "@/components/ui";
import { useRouter } from "next/navigation";
import {
  startAnalysis, streamAnalysis, getMarketIndices, runBacktest,
  getStock, searchStocks, startAgentBacktest, streamAgentBacktest, cancelAgentBacktest,
  listAgentBacktestHistory, getAgentBacktestResult,
  getAccessToken, clearAccessToken, getMe,
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

const RECENT_STOCKS_KEY = "kta_recent_stocks_v1";
const FAVORITE_STOCKS_KEY = "kta_favorite_stocks_v1";
type SavedStock = { code: string; name: string };
type BacktestMode = "ma" | "agent";

type Tab = "analysis" | "backtest" | "trading" | "portfolio";
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

function formatYearMonth(dateStr: string): string {
  const [y = "", m = ""] = dateStr.split("-");
  if (!y || !m) return dateStr;
  return `${y}.${m}`;
}

function InfoTip({ tip, subtle = false }: { tip: string; subtle?: boolean }) {
  return (
    <Tooltip content={tip}>
      <button
        type="button"
        aria-label={tip}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `1px solid ${subtle ? "var(--border-subtle)" : "var(--border-default)"}`,
          color: subtle ? "var(--text-tertiary)" : "var(--text-secondary)",
          background: "transparent",
          padding: 0,
          cursor: "help",
          flexShrink: 0,
          lineHeight: 0,
        }}
      >
        <Icon name="info" size={11} strokeWidth={2} decorative />
      </button>
    </Tooltip>
  );
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
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name={isUp ? "trend-up" : "trend-down"} size={12} strokeWidth={2.2} decorative />
              {Math.abs(info.change_pct).toFixed(2)}%
            </p>
          </div>

          {/* Key indicators row */}
          <div style={{ display: "flex", gap: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
            {/* RSI */}
            {info.rsi_14 != null && (
              <div style={{ flex: 1 }}>
                <Tooltip
                  content="RSI(상대강도 지수) - 최근 14일간 오른 날과 내린 날의 힘을 비교해 0~100으로 점수화한 값. 70 이상이면 '너무 많이 올랐다(과매수)', 30 이하면 '너무 많이 떨어졌다(과매도)' 관점. 30~70 사이는 중립 구간입니다."
                  maxWidth={300}
                >
                  <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4, display: "inline-block", borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>ℹ RSI-14</p>
                </Tooltip>
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
                <Tooltip
                  content="최근 1년(52주) 동안의 최고가와 최저가 구간. 막대 위의 표시는 현재가가 그 구간의 어디에 있는지 알려주어요. 원쪽에 가까우면 1년 중 최고점 근처(차익실실 필요), 왼쪽이면 최저점 근처(반등 기회 가능성)를 뜻합니다."
                  maxWidth={320}
                >
                  <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4, display: "inline-block", borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>ℹ 52주 범위</p>
                </Tooltip>
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
              { label: "MA5", val: info.ma5, tip: "최근 5거래일 종가 평균입니다. 단기 추세를 빠르게 반영합니다." },
              { label: "MA20", val: info.ma20, tip: "최근 20거래일 종가 평균입니다. 약 1개월 흐름을 보여주는 대표 기준선입니다." },
              ...(info.ma60 != null ? [{ label: "MA60", val: info.ma60, tip: "최근 60거래일 평균으로 중기 추세 확인에 사용합니다." }] : []),
            ].map(({ label, val, tip }) => (
              <div key={label} style={{ flex: 1, background: "var(--bg-overlay)", borderRadius: "var(--radius-md)", padding: "6px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <p style={{ fontSize: 8, color: "var(--text-tertiary)" }}>{label}</p>
                  <InfoTip tip={tip} subtle />
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: val != null ? (val > info.current_price ? "var(--bear)" : "var(--bull)") : "var(--text-quaternary)", fontVariantNumeric: "tabular-nums" }}>
                  {val != null ? `${(val / 1000).toFixed(1)}K` : "-"}
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
  { name: "L3", full: "결정", roles: ["risk_manager", "portfolio_manager", "guru_agent"] as AgentRole[], total: 3 },
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
                  {layer.complete ? <Icon name="check" size={12} strokeWidth={2.4} decorative /> : `${layer.done}`}
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
            <Icon name="check-circle" size={12} decorative style={{ color: "var(--success)" }} />
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(companyName ? `${companyName} (${ticker})` : ticker);
  }, [companyName, ticker]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
              boxShadow: "var(--shadow-lg)",
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
  onOpenSettings,
}: {
  decision: TradeDecision;
  onApprove: () => void;
  onReject: () => void;
  onOpenSettings?: () => void;
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
        background: "var(--bg-scrim)",
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
          <Icon name="warning" size={22} decorative style={{ color: "var(--warning)" }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--warning)" }}>인간 승인 필요</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>고신뢰도 / 대규모 포지션 결정 (실주문은 매매 탭에서 승인)</p>
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

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: "8px 0",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="settings" size={12} decorative />
            승인 정책 설정 열기
          </button>
        )}

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
              color: "var(--text-inverse)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            승인하고 매매 탭으로 이동
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Analysis tab empty state ──────────────────────────────────────
function AnalysisEmptyState({
  isRunning,
  activeCount,
  hasThoughts,
  hadError,
}: {
  isRunning: boolean;
  activeCount: number;
  hasThoughts: boolean;
  hadError: boolean;
}) {
  // 3가지 상태로 분기:
  // 1) 실행 중 → "분석 중" + 활성 에이전트 수
  // 2) 실행 끝났지만 결과 없음 (decision === null && hasThoughts) → "결과를 불러오지 못함"
  // 3) 처음 진입 (idle) → "분석 시작을 눌러주세요"
  let title: string;
  let sub: string | null = null;
  let iconName: "search" | "target" | "warning";

  if (isRunning) {
    iconName = "search";
    title = "에이전트들이 분석 중...";
    sub = `${activeCount}개 에이전트 활성화`;
  } else if (hasThoughts && !hadError) {
    iconName = "warning";
    title = "분석은 끝났지만 최종 결정을 받지 못했어요";
    sub = "잠시 후 다시 시도하거나 백엔드 로그를 확인하세요.";
  } else {
    iconName = "target";
    title = "분석 시작을 눌러 AI 에이전트를 가동하세요";
  }

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
      {isRunning ? (
        <Loader size={36} center={false} />
      ) : (
        <span style={{ display: "inline-flex", color: iconName === "warning" ? "var(--warning)" : "var(--brand)" }}>
          <Icon name={iconName} size={36} strokeWidth={1.5} decorative />
        </span>
      )}
      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{title}</p>
      {sub && (
        <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{sub}</p>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [ticker, setTicker] = useState("005930");
  const [companyName, setCompanyName] = useState("삼성전자");
  const [isNarrowLayout, setIsNarrowLayout] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [thoughts, setThoughts] = useState<Map<AgentRole, AgentThought>>(new Map());
  const [activeAgents, setActiveAgents] = useState<Set<AgentRole>>(new Set());
  const [decision, setDecision] = useState<TradeDecision | null>(null);
  const [logs, setLogs] = useState<AgentThought[]>([]);
  const [marketData, setMarketData] = useState<Record<string, { current: number; change_pct: number }>>({});
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [btMode, setBtMode] = useState<BacktestMode>("ma");
  const [btStartDate, setBtStartDate] = useState("2022-01-01");
  const [btEndDate, setBtEndDate] = useState("2024-12-31");
  const [btInitialCapital, setBtInitialCapital] = useState(10_000_000);
  const [btDecisionIntervalDays, setBtDecisionIntervalDays] = useState(20);
  const [btProgress, setBtProgress] = useState<Array<{ date: string; signal: string; confidence: number; step: number; total: number }>>([]);
  const [btConfirmOpen, setBtConfirmOpen] = useState(false);
  const [btSessionId, setBtSessionId] = useState<string | null>(null);
  const [btCancelling, setBtCancelling] = useState(false);
  const [btHistory, setBtHistory] = useState<import("@/lib/api").AgentBacktestHistoryItem[]>([]);
  const [btHistoryLoading, setBtHistoryLoading] = useState(false);
  const btCleanupRef = useRef<(() => void) | null>(null);
  const analysisCleanupRef = useRef<(() => void) | null>(null);
  const [approvalModal, setApprovalModal] = useState(false);
  const [stockInfo, setStockInfo] = useState<StockIndicators | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("overview");
  const [kisOrderTicker, setKisOrderTicker] = useState("");
  const [recentStocks, setRecentStocks] = useState<SavedStock[]>([]);
  const [favoriteStocks, setFavoriteStocks] = useState<SavedStock[]>([]);
  const [autoTradeRecords, setAutoTradeRecords] = useState<AutoTradeRecord[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setCurrentUser(null);
      setAuthReady(true);
      return;
    }

    getMe()
      .then((res) => {
        setCurrentUser(res.user);
        setAuthError(null);
      })
      .catch(() => {
        clearAccessToken();
        setCurrentUser(null);
        setAuthError("로그인이 필요합니다.");
      })
      .finally(() => {
        setAuthReady(true);
      });
  }, []);

  // Once auth check completes, send unauthenticated users straight to /login.
  useEffect(() => {
    if (authReady && !currentUser) {
      router.replace("/login");
    }
  }, [authReady, currentUser, router]);

  // Load local stock preferences
  useEffect(() => {
    try {
      const recentRaw = localStorage.getItem(RECENT_STOCKS_KEY);
      const favoriteRaw = localStorage.getItem(FAVORITE_STOCKS_KEY);
      if (recentRaw) {
        const parsed = JSON.parse(recentRaw) as SavedStock[];
        if (Array.isArray(parsed)) setRecentStocks(parsed.slice(0, 8));
      }
      if (favoriteRaw) {
        const parsed = JSON.parse(favoriteRaw) as SavedStock[];
        if (Array.isArray(parsed)) setFavoriteStocks(parsed.slice(0, 12));
      }
    } catch {
      // localStorage parse failure should not block UI
    }
  }, []);

  // Persist local stock preferences
  useEffect(() => {
    localStorage.setItem(RECENT_STOCKS_KEY, JSON.stringify(recentStocks));
  }, [recentStocks]);

  useEffect(() => {
    localStorage.setItem(FAVORITE_STOCKS_KEY, JSON.stringify(favoriteStocks));
  }, [favoriteStocks]);

  // Market data
  useEffect(() => {
    if (!currentUser) return;
    const loadIndices = () => {
      getMarketIndices().then(setMarketData).catch(() => {});
    };
    loadIndices();
    const timer = setInterval(loadIndices, 60_000);
    return () => clearInterval(timer);
  }, [currentUser]);

  // Responsive split layout (desktop 50/50, narrow stacked)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1260px)");
    const apply = () => setIsNarrowLayout(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Stock info on ticker change
  useEffect(() => {
    if (!currentUser) return;
    if (!ticker) return;
    setStockInfo(null);
    const timer = setTimeout(() => {
      getStock(ticker)
        .then((res) => {
          setStockInfo(res.indicators ?? null);
          if (res.info?.name && res.info.name !== "Unknown") setCompanyName(res.info.name);
        })
        .catch(() => {
          setStockInfo(null);
          setCompanyName(ticker);
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [ticker, currentUser]);

  const openSettings = useCallback((tabKey: SettingsTab = "overview") => {
    setSettingsInitialTab(tabKey);
    setSettingsOpen(true);
  }, []);

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
    if (!currentUser) {
      setAnalysisError("로그인이 필요합니다.");
      return;
    }
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
  }, [ticker, isRunning, currentUser]);

  const handleBacktest = useCallback(async () => {
    if (!currentUser) {
      setBtError("로그인이 필요합니다.");
      return;
    }
    if (btLoading) return;

    const normalizedCapital = Number(btInitialCapital);
    const normalizedInterval = Number(btDecisionIntervalDays);
    const start = new Date(btStartDate);
    const end = new Date(btEndDate);

    if (!btStartDate || !btEndDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setBtError("시뮬레이션 기간을 올바르게 입력하세요.");
      return;
    }
    if (start >= end) {
      setBtError("종료일은 시작일보다 뒤여야 합니다.");
      return;
    }
    if (!Number.isFinite(normalizedCapital) || normalizedCapital < 100_000) {
      setBtError("초기 자본은 10만원 이상으로 입력하세요.");
      return;
    }
    if (!Number.isFinite(normalizedInterval) || normalizedInterval < 1 || normalizedInterval > 120) {
      setBtError("판단 주기는 1~120 거래일 사이로 입력하세요.");
      return;
    }

    setBtLoading(true);
    setBtResult(null);
    setBtProgress([]);
    setBtError(null);
    if (btMode === "ma") {
      try {
        const result = await runBacktest({
          ticker,
          start_date: btStartDate,
          end_date: btEndDate,
          initial_capital: normalizedCapital,
          decision_interval_days: Math.floor(normalizedInterval),
        });
        setBtResult(result);
      } catch (e: unknown) {
        setBtError(e instanceof Error ? e.message : "시뮬레이션 실패. 종목 데이터를 확인하세요.");
      } finally {
        setBtLoading(false);
      }
    } else {
      try {
        const { session_id } = await startAgentBacktest({
          ticker,
          start_date: btStartDate,
          end_date: btEndDate,
          initial_capital: normalizedCapital,
          decision_interval_days: Math.floor(normalizedInterval),
        });
        setBtSessionId(session_id);
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
          () => { setBtLoading(false); setBtSessionId(null); setBtCancelling(false); },
          (errMsg) => { setBtError(errMsg); }
        );
        btCleanupRef.current = cleanup;
      } catch (e: unknown) {
        setBtError(e instanceof Error ? e.message : "AI 시뮬레이션 요청 실패.");
        setBtLoading(false);
        setBtSessionId(null);
      }
    }
  }, [ticker, btMode, btLoading, btStartDate, btEndDate, btInitialCapital, btDecisionIntervalDays, currentUser]);

  const handleCancelBacktest = useCallback(async () => {
    if (!btSessionId || btCancelling) return;
    setBtCancelling(true);
    try {
      await cancelAgentBacktest(btSessionId);
    } catch {
      // 서버 이미 종료/접근 불가—로컬 정리로 계속 진행
    } finally {
      btCleanupRef.current?.();
      btCleanupRef.current = null;
      setBtLoading(false);
      setBtSessionId(null);
      setBtCancelling(false);
      setBtError("사용자 요청으로 시뮬레이션을 중단했습니다.");
    }
  }, [btSessionId, btCancelling]);

  // Cleanup SSE connections on unmount
  useEffect(() => {
    return () => {
      analysisCleanupRef.current?.();
      btCleanupRef.current?.();
    };
  }, []);

  // 사용자별 백테스트 이력 fetch (탭 진입 시 + 새 결과 도착 시 자동 갱신)
  const refreshBacktestHistory = useCallback(async () => {
    if (!currentUser) return;
    setBtHistoryLoading(true);
    try {
      const items = await listAgentBacktestHistory(20);
      setBtHistory(items);
    } catch {
      // ignore
    } finally {
      setBtHistoryLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (tab === "backtest") {
      refreshBacktestHistory();
    }
  }, [tab, refreshBacktestHistory]);

  useEffect(() => {
    // 새 결과가 들어오면 이력 새로고침
    if (btResult) refreshBacktestHistory();
  }, [btResult, refreshBacktestHistory]);

  const handleLoadHistoryItem = useCallback(async (sessionId: string) => {
    const result = await getAgentBacktestResult(sessionId);
    if (result) {
      setBtResult(result);
      setBtError(null);
    } else {
      setBtError("이력의 결과 데이터를 불러오지 못했어요.");
    }
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
          if (!btLoading && !btResult) setBtConfirmOpen(true);
        }
      }
      if (e.key === "Escape") {
        setApprovalModal(false);
        if (isRunning) handleCancelAnalysis();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, handleAnalyze, handleBacktest, handleCancelAnalysis, isRunning, btLoading, btResult]);

  const activeCount = activeAgents.size;

  const handleTickerSelect = useCallback((code: string, name: string) => {
    const item = { code, name };
    setTicker(code);
    setCompanyName(name);
    setRecentStocks((prev) => [item, ...prev.filter((s) => s.code !== code)].slice(0, 8));
  }, []);

  const isFavorite = favoriteStocks.some((s) => s.code === ticker);

  const toggleFavorite = useCallback(() => {
    const current = { code: ticker, name: companyName || ticker };
    setFavoriteStocks((prev) => {
      if (prev.some((s) => s.code === current.code)) {
        return prev.filter((s) => s.code !== current.code);
      }
      return [current, ...prev].slice(0, 12);
    });
  }, [ticker, companyName]);

  const backtestSummaryText = `${ticker} · ${formatYearMonth(btStartDate)} ~ ${formatYearMonth(btEndDate)} · 초기자본 ${Math.round(btInitialCapital).toLocaleString("ko-KR")}원 · 판단주기 ${Math.max(1, Math.floor(btDecisionIntervalDays))}거래일`;
  const chartPredictionMarkers = (btResult?.ticker === ticker ? btResult?.prediction_trace ?? [] : []).map((p) => ({
    date: p.prediction_date,
    signal: p.signal,
    confidence: p.confidence,
  }));
  const chartTradeMarkers = autoTradeRecords.filter((t) => t.ticker === ticker);

  // Tab navigation handler
  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    if (newTab === "trading" && decision?.ticker) {
      setKisOrderTicker(decision.ticker);
    }
  }, [decision]);

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg-canvas)",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        인증 상태를 확인하는 중입니다...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "var(--bg-canvas)",
          color: "var(--text-tertiary)",
          fontSize: 13,
        }}
      >
        {authError ? "로그인 페이지로 이동합니다…" : "로그인 페이지로 이동 중…"}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isNarrowLayout ? "column" : "row",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-canvas)",
      }}
    >
      {/* Onboarding tour — first-visit only */}
      <OnboardingTour
        steps={[
          { selector: '[data-tour="search"]', title: "1. 종목을 골라요", body: "관심 있는 한국 주식의 이름이나 6자리 코드로 검색하면 가격·차트가 바로 표시돼요.", placement: "bottom" },
          { selector: '[data-tour="tab-nav"]', title: "2. 작업을 선택해요", body: "분석은 AI 에이전트 9명이 함께 검토하고, 시뮬레이션·매매·포트폴리오로 자유롭게 전환할 수 있어요.", placement: "bottom" },
          { selector: '[data-tour="console"]', title: "3. AI가 일하는 모습을 봐요", body: "오른쪽에서 에이전트들의 실시간 사고와 결정을 확인할 수 있어요. 분석을 시작하면 자동으로 활성화돼요.", placement: "left" },
        ] satisfies CoachStep[]}
      />
      {/* ═══════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Toss-style stock + controls               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside
        style={{
          width: isNarrowLayout ? "100%" : "50%",
          flexShrink: 0,
          minWidth: 0,
          background: "var(--bg-surface)",
          borderRight: isNarrowLayout ? "none" : "1px solid var(--border-subtle)",
          borderBottom: isNarrowLayout ? "1px solid var(--border-subtle)" : "none",
          display: "flex",
          flexDirection: "column",
          height: isNarrowLayout ? "56vh" : "100vh",
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
            <BrandMark size={32} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2, letterSpacing: "0.04em" }}>KTA</p>
              <p style={{ fontSize: 9, color: "var(--text-tertiary)" }}>한국 트레이딩 에이전트</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 9, color: "var(--text-secondary)", fontWeight: 700 }}>
                {currentUser.username || currentUser.email}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                <a href="/activity" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--brand)", fontSize: 10, textDecoration: "none", fontWeight: 700 }}>
                  <Icon name="activity" size={11} decorative />
                  활동 로그
                </a>
                {currentUser.role === "master" && (
                  <a
                    href="/master"
                    title="마스터 콘솔"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--warning)",
                      background: "var(--warning-subtle)",
                      border: "1px solid var(--warning-border)",
                      borderRadius: 99,
                      padding: "2px 8px",
                      fontSize: 10,
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    <Icon name="shield" size={11} decorative />
                    마스터
                  </a>
                )}
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
          <div data-tour="search" style={{ marginBottom: 10 }}>
            <TickerSearchInput
              ticker={ticker}
              companyName={companyName}
              onChange={handleTickerSelect}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <p style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600 }}>
                개인 목록
              </p>
              <button
                onClick={toggleFavorite}
                style={{
                  border: "1px solid var(--border-default)",
                  background: isFavorite ? "var(--warning-subtle)" : "transparent",
                  color: isFavorite ? "var(--warning)" : "var(--text-tertiary)",
                  borderRadius: 99,
                  padding: "3px 9px",
                  fontSize: 9,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {isFavorite ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="star-filled" size={10} decorative />
                    즐겨찾기 해제
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="star" size={10} decorative />
                    즐겨찾기 추가
                  </span>
                )}
              </button>
            </div>

            {favoriteStocks.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <p style={{ fontSize: 8, color: "var(--text-tertiary)", marginBottom: 4 }}>즐겨찾기</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {favoriteStocks.map(({ code, name }) => (
                    <button
                      key={`fav-${code}`}
                      onClick={() => handleTickerSelect(code, name)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 99,
                        border: `1px solid ${ticker === code ? "var(--warning)" : "var(--border-default)"}`,
                        background: ticker === code ? "var(--warning-subtle)" : "transparent",
                        color: ticker === code ? "var(--warning)" : "var(--text-secondary)",
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="star-filled" size={10} decorative />
                        {name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recentStocks.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <p style={{ fontSize: 8, color: "var(--text-tertiary)", marginBottom: 4 }}>최근 검색</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {recentStocks.map(({ code, name }) => (
                    <button
                      key={`recent-${code}`}
                      onClick={() => handleTickerSelect(code, name)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 99,
                        border: `1px solid ${ticker === code ? "var(--brand)" : "var(--border-default)"}`,
                        background: ticker === code ? "var(--brand-subtle)" : "transparent",
                        color: ticker === code ? "var(--brand)" : "var(--text-tertiary)",
                        fontSize: 10,
                        fontWeight: ticker === code ? 600 : 400,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {POPULAR_TICKERS.map(({ code, name }) => (
                <button
                  key={code}
                  onClick={() => handleTickerSelect(code, name)}
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

          {/* Always-visible market chart */}
          <StockChartPanel
            ticker={ticker}
            predictionMarkers={chartPredictionMarkers}
            tradeMarkers={chartTradeMarkers}
          />

          {/* ── Pill Tab Navigation ──────────────────────────── */}
          <div
            data-tour="tab-nav"
            style={{
              display: "flex",
              padding: "12px 0 10px",
              borderBottom: "1px solid var(--border-subtle)",
              marginBottom: 14,
              flexShrink: 0,
            }}
          >
            <TabPills<Tab>
              ariaLabel="작업 영역 선택"
              fullWidth
              size="md"
              value={tab}
              onChange={(v) => handleTabChange(v)}
              items={[
                { value: "analysis", label: "분석", icon: <Icon name="search" size={14} decorative />, badge: activeCount > 0 ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                    background: "var(--brand)", color: "var(--text-inverse)", lineHeight: 1.4, marginLeft: 2,
                  }}>{activeCount}</span>
                ) : undefined },
                { value: "backtest", label: "시뮬레이션", icon: <Icon name="chart-bar" size={14} decorative /> },
                { value: "trading", label: "매매", icon: <Icon name="wallet" size={14} decorative /> },
                { value: "portfolio", label: "포트폴리오", icon: <Icon name="briefcase" size={14} decorative /> },
              ]}
            />
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
                      color: isRunning ? "var(--text-tertiary)" : "var(--text-inverse)",
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
                        <Loader size={16} center={false} />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <Icon name="search" size={14} decorative />
                        분석 시작
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
                        background: "var(--error-subtle)",
                        border: "1px solid var(--error-border)",
                      }}
                    >
                      <Icon name="warning" size={14} decorative style={{ color: "var(--bear)" }} />
                      <p style={{ fontSize: 11, color: "var(--bear)", flex: 1 }}>{analysisError}</p>
                      <button
                        onClick={() => setAnalysisError(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0, lineHeight: 0 }}
                      >
                        <Icon name="x" size={14} decorative />
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

                {/* Decision card / Analysis report / Empty state */}
                {decision ? (
                  <>
                    <DecisionCard
                      decision={decision}
                      onHumanApproval={
                        decision.agents_summary?.requires_human_approval
                          ? () => setApprovalModal(true)
                          : undefined
                      }
                      onOpenSettings={() => openSettings("guru")}
                    />
                    <AnalysisReport decision={decision} />
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
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <Icon name="wallet" size={13} decorative />
                      KIS 매매 탭에서 주문하기
                    </motion.button>
                  </>
                ) : (
                  <AnalysisEmptyState
                    isRunning={isRunning}
                    activeCount={activeCount}
                    hasThoughts={thoughts.size > 0}
                    hadError={!!analysisError}
                  />
                )}
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
                        {
                          key: "ma" as const,
                          label: "MA 교차 전략",
                          desc: "5일 평균이 20일 평균을 위로 뚫으면 매수 · 아래로 뚫으면 매도",
                          icon: "chart-bar" as const,
                          tip: "기술적 추세 추종 전략입니다. LLM 사용 없이 과거 가격만으로 동작하므로 빠르고 비용이 발생하지 않습니다.",
                        },
                        {
                          key: "agent" as const,
                          label: "AI 에이전트 전략",
                          desc: "매달 AI가 종목을 분석해 매수/매도/보유 신호를 내고 그 다음 거래일에 체결",
                          icon: "robot" as const,
                          tip: "설정한 기간을 월 단위로 쪼개서, 매번 기술지표·재무·뉴스 요약을 LLM에 넘겨 BUY/SELL/HOLD 결정을 받습니다. 실제 LLM 호출이 일어나므로 소액의 API 비용이 발생합니다.",
                        },
                      ] as const
                    ).map(({ key, label, desc, icon, tip }) => {
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
                            background: active ? "var(--brand-subtle)" : "var(--bg-elevated)",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 150ms",
                          }}
                        >
                          <p style={{ marginBottom: 6, color: active ? "var(--brand)" : "var(--text-secondary)" }}>
                            <Icon name={icon} size={20} decorative />
                          </p>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--brand)" : "var(--text-primary)" }}>{label}</p>
                            <InfoTip tip={tip} subtle={!active} />
                          </div>
                          <p style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{desc}</p>
                        </button>
                      );
                    })}
                  </div>
                )}

                  {!btResult && !btLoading && (
                    <div
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-lg)",
                        padding: "10px 11px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          시뮬레이션 설정
                        </p>
                        <InfoTip tip="원하는 기간/초기자본을 넣어 동일 전략을 다양한 시장 구간에서 비교할 수 있습니다." subtle />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>시작일</span>
                          <input
                            type="date"
                            value={btStartDate}
                            onChange={(e) => setBtStartDate(e.target.value)}
                            style={{
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-input)",
                              color: "var(--text-primary)",
                              padding: "9px 10px",
                              fontSize: 13,
                            }}
                          />
                        </label>

                        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>종료일</span>
                          <input
                            type="date"
                            value={btEndDate}
                            onChange={(e) => setBtEndDate(e.target.value)}
                            style={{
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-input)",
                              color: "var(--text-primary)",
                              padding: "9px 10px",
                              fontSize: 13,
                            }}
                          />
                        </label>
                      </div>

                      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>초기 자본 (원)</span>
                        <input
                          type="number"
                          min={100000}
                          step={100000}
                          value={btInitialCapital}
                          onChange={(e) => setBtInitialCapital(Number(e.target.value || 0))}
                          style={{
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-default)",
                            background: "var(--bg-input)",
                            color: "var(--text-primary)",
                            padding: "9px 10px",
                            fontSize: 13,
                          }}
                        />
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>예: 10,000,000원 = 천만원</span>
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                          판단 주기 (거래일)
                          <InfoTip tip="며칠마다 한 번씩 매수/매도 여부를 판단할지 정합니다. 1로 두면 매일, 5로 두면 5거래일마다 한 번 판단해요. 값이 작을수록 자주 거래합니다." subtle />
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={btDecisionIntervalDays}
                          onChange={(e) => setBtDecisionIntervalDays(Number(e.target.value || 1))}
                          style={{
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-default)",
                            background: "var(--bg-input)",
                            color: "var(--text-primary)",
                            padding: "9px 10px",
                            fontSize: 13,
                          }}
                        />
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>1 = 매일 판단 · 5 = 일주일에 한 번 · 20 = 한 달에 한 번</span>
                      </label>

                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                        현재 설정: {backtestSummaryText}
                      </p>
                    </div>
                  )}

                {/* Run button → opens pre-run review dialog */}
                {!btResult && (
                  <motion.button
                    onClick={() => setBtConfirmOpen(true)}
                    disabled={btLoading}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      width: "100%",
                      padding: "12px 0",
                      borderRadius: "var(--radius-xl)",
                      border: "none",
                      background: btLoading ? "var(--bg-elevated)" : "var(--brand)",
                      color: btLoading ? "var(--text-tertiary)" : "var(--text-inverse)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: btLoading ? "not-allowed" : "pointer",
                      boxShadow: btLoading ? "none" : "0 4px 16px var(--brand-glow)",
                      transition: "all 200ms",
                    }}
                  >
                    {btLoading ? "실행 중..." : "시뮬레이션 검토 후 실행"}
                    {!btLoading && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 6, fontWeight: 400 }}>Space</span>}
                  </motion.button>
                )}

                {/* Loading state */}
                {btLoading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <Loader
                      size={48}
                      label={btMode === "agent" ? "AI 에이전트가 과거 시점마다 판단하는 중…" : "시뮬레이션을 실행 중…"}
                    />
                    {btMode === "agent" && btSessionId && (
                      <button
                        type="button"
                        onClick={handleCancelBacktest}
                        disabled={btCancelling}
                        style={{
                          marginTop: 4,
                          padding: "8px 16px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--bear)",
                          background: btCancelling ? "var(--bg-elevated)" : "var(--bear-subtle, rgba(240,68,82,0.1))",
                          color: "var(--bear)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: btCancelling ? "not-allowed" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon name="x" size={12} decorative />
                        {btCancelling ? "중단 요청 중…" : "시뮬레이션 중단"}
                      </button>
                    )}

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
                                      ? "var(--bull-subtle)"
                                      : p.signal === "SELL"
                                      ? "var(--bear-subtle)"
                                      : "var(--bg-surface)",
                                  color:
                                    p.signal === "BUY"
                                      ? "var(--bull)"
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
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: 99,
                          background: "var(--brand-subtle)",
                          color: "var(--brand)",
                        }}
                      >
                        <Icon name={btMode === "agent" ? "robot" : "chart-bar"} size={12} decorative />
                        {btMode === "agent" ? "AI 에이전트 전략" : "MA 교차 전략"}
                      </span>
                      <button
                        onClick={() => { setBtResult(null); setBtProgress([]); setBtError(null); }}
                        style={{
                          marginLeft: "auto",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#fff",
                          background: "var(--brand)",
                          border: "none",
                          borderRadius: "var(--radius-md)",
                          padding: "8px 14px",
                          cursor: "pointer",
                          boxShadow: "0 2px 10px var(--brand-glow)",
                          transition: "transform 120ms ease, box-shadow 120ms ease",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
                      >
                        <Icon name="settings" size={13} decorative />
                        설정 변경하고 다시 실행
                      </button>
                    </div>
                    <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 10 }}>
                      {backtestSummaryText}
                    </p>
                    <BacktestPanel result={btResult} />
                  </div>
                )}

                {/* Backtest error state */}
                <AnimatePresence>
                  {btError && !btLoading && (
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
                        background: "var(--error-subtle)",
                        border: "1px solid var(--error-border)",
                      }}
                    >
                      <Icon name="warning" size={14} decorative style={{ color: "var(--bear)" }} />
                      <p style={{ fontSize: 11, color: "var(--bear)", flex: 1 }}>{btError}</p>
                      <button
                        onClick={() => setBtError(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0, lineHeight: 0 }}
                      >
                        <Icon name="x" size={14} decorative />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

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
                    <span style={{ display: "inline-flex", color: "var(--brand)" }}>
                      <Icon name="trend-up" size={36} strokeWidth={1.5} decorative />
                    </span>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
                      전략을 선택하고 시뮬레이션 실행 버튼을 누르세요
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center" }}>
                      {backtestSummaryText}
                    </p>
                  </div>
                )}

                {/* 최근 시뮬레이션 이력 (실행 중이 아닐 때만) */}
                {!btLoading && btHistory.length > 0 && (
                  <div
                    style={{
                      background: "var(--bg-elevated)",
                      borderRadius: "var(--radius-xl)",
                      border: "1px solid var(--border-subtle)",
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: "var(--text-primary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon name="clock" size={12} decorative /> 최근 시뮬레이션 이력
                      </p>
                      <button
                        onClick={refreshBacktestHistory}
                        disabled={btHistoryLoading}
                        style={{
                          fontSize: 10,
                          color: "var(--text-tertiary)",
                          background: "none",
                          border: "none",
                          cursor: btHistoryLoading ? "wait" : "pointer",
                        }}
                      >
                        {btHistoryLoading ? "갱신 중…" : "새로고침"}
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {btHistory.slice(0, 8).map((item) => {
                        const ret = item.summary?.total_return;
                        const alpha = item.summary?.alpha;
                        const isDone = item.status === "done";
                        const dateRange =
                          item.summary?.start_date && item.summary?.end_date
                            ? `${item.summary.start_date.slice(0, 10)} ~ ${item.summary.end_date.slice(0, 10)}`
                            : (item.created_at ?? "").slice(0, 10);
                        return (
                          <button
                            key={item.session_id}
                            onClick={() => isDone && handleLoadHistoryItem(item.session_id)}
                            disabled={!isDone}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "60px 1fr auto",
                              gap: 8,
                              alignItems: "center",
                              padding: "8px 10px",
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-default)",
                              borderRadius: "var(--radius-md)",
                              cursor: isDone ? "pointer" : "not-allowed",
                              opacity: isDone ? 1 : 0.6,
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                              {item.ticker}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                              {dateRange}
                              {item.status === "running" && " · 진행 중"}
                              {item.status === "error" && ` · 오류${item.error ? `: ${item.error.slice(0, 30)}` : ""}`}
                            </span>
                            {isDone && typeof ret === "number" && (
                              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: ret >= 0 ? "var(--bull)" : "var(--bear)",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {ret >= 0 ? "+" : ""}{ret.toFixed(1)}%
                                </span>
                                {typeof alpha === "number" && (
                                  <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                                    α {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}%p
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 8, lineHeight: 1.5 }}>
                      💡 시뮬레이션 중에 페이지를 떠나도 백엔드는 끝까지 계산을 마치고 결과를 저장해요. 다시 돌아오면 여기에서 확인하고 클릭해 결과를 다시 볼 수 있습니다.
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
                <KisPanel
                  prefillTicker={kisOrderTicker || ticker}
                  onOpenSettings={(tabKey) => openSettings(tabKey)}
                />
              </motion.div>
            )}

            {tab === "portfolio" && (
              <motion.div
                key="portfolio"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={SPRING}
              >
                <PortfolioLoopPanel
                  ticker={ticker}
                  onTradeRecorded={(trade) => {
                    setAutoTradeRecords((prev) => [trade, ...prev].slice(0, 120));
                    setLogs((prev) => [
                      ...prev.slice(-99),
                      {
                        agent_id: "portfolio_loop",
                        role: "portfolio_manager",
                        status: "done",
                        content: `포트폴리오 거래: ${trade.ticker} ${trade.side} ${trade.qty}주 (${trade.status})`,
                        timestamp: new Date().toISOString(),
                      },
                    ]);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Keep automation loop mounted so it can run continuously across tabs */}
          <div style={{ display: tab === "trading" ? "block" : "none" }}>
            <AutoLoopPanel
              ticker={ticker}
              showVisuals={tab === "trading"}
              onDecision={(autoDecision) => {
                setDecision(autoDecision);
                setKisOrderTicker(autoDecision.ticker);
                setLogs((prev) => [
                  ...prev.slice(-99),
                  {
                    agent_id: "auto_loop",
                    role: "portfolio_manager",
                    status: "done",
                    content: `자동 루프 의사결정: ${autoDecision.action} (${(autoDecision.confidence * 100).toFixed(1)}%)`,
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }}
              onTradeRecorded={(trade) => {
                setAutoTradeRecords((prev) => [trade, ...prev].slice(0, 120));
              }}
            />
          </div>
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
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="warning" size={11} decorative />
            투자 참고용. 실제 투자는 본인 책임.
          </p>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Pixel Agent Office                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <main
        data-tour="console"
        style={{
          width: isNarrowLayout ? "100%" : "50%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          height: isNarrowLayout ? "44vh" : "100vh",
          overflow: "hidden",
          background: "var(--bg-canvas)",
        }}
      >
        {/* ── Right panel header ─────────────────────────────── */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-default)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, var(--brand-subtle) 0%, var(--bg-canvas) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BrandMark size={20} />
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-active)", letterSpacing: "0.08em" }}>
              에이전트 컨트롤룸
            </p>
            <span
              style={{
                fontSize: 9,
                color: "var(--brand-active)",
                background: "var(--bg-surface)",
                padding: "2px 8px",
                borderRadius: 99,
                border: "1px solid var(--brand-border)",
                letterSpacing: "0.06em",
                fontWeight: 600,
              }}
            >
              DATA · DEBATE · DECISION
            </span>
          </div>

          {/* Status badge + Settings */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              <span style={{ fontSize: 10, fontWeight: 600, color: decision ? "var(--success)" : "var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                {decision ? (
                  <>
                    <Icon name="check-circle" size={12} decorative />
                    분석 완료
                  </>
                ) : (
                  `${thoughts.size}/8 완료`
                )}
              </span>
            )}
            <button
              onClick={() => openSettings("overview")}
              title="설정"
              aria-label="설정 열기"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 11px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Icon name="settings" size={13} decorative />
              설정
            </button>
          </div>
        </div>

        {/* ── 50/50 split: Pixel Office + Activity Feed ───────── */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: "10px 14px 12px",
            display: "grid",
            gridTemplateRows: "1fr 1fr",
            gap: 10,
          }}
        >
          <div
            style={{
              minHeight: 0,
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: 8,
              background: "linear-gradient(180deg, rgba(96,48,255,0.06) 0%, rgba(20,21,24,0.65) 100%)",
              overflow: "hidden",
            }}
          >
            <PixelOffice thoughts={thoughts} activeAgents={activeAgents} />
          </div>

          <div
            style={{
              minHeight: 0,
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: "8px 10px",
              background: "linear-gradient(180deg, rgba(116,111,255,0.08) 0%, rgba(18,19,24,0.9) 100%)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <p
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "rgba(214,210,255,0.95)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 6,
                flexShrink: 0,
              }}
            >
              실시간 활동 로그
            </p>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ActivityFeed logs={logs} logEndRef={logEndRef} />
            </div>
          </div>
        </div>
      </main>

      {/* ── Backtest Pre-run Review Dialog ─────────────────── */}
      {(() => {
        const startMs = Date.parse(btStartDate);
        const endMs = Date.parse(btEndDate);
        const calendarDays = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? Math.round((endMs - startMs) / 86_400_000)
          : 0;
        const tradingDays = Math.round(calendarDays * (5 / 7));
        const interval = Math.max(1, Math.floor(btDecisionIntervalDays));
        const decisionsEstimate = tradingDays > 0 ? Math.max(1, Math.ceil(tradingDays / interval)) : 0;
        const fmtKRW = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
        const intervalLabel = interval === 1 ? "매 거래일" : interval >= 20 ? `약 ${Math.round(interval / 20)}개월에 한 번` : interval >= 5 ? `약 ${(interval / 5).toFixed(0)}주에 한 번` : `${interval}거래일마다`;
        // 토큰/비용 추정치 (gpt-5.5 기준 placeholder rate). 판단 1회당 입력 ≈ 4K, 출력 ≈ 0.8K 토큰 가정.
        const inputTokensPerCall = 4000;
        const outputTokensPerCall = 800;
        const totalInputTokens = decisionsEstimate * inputTokensPerCall;
        const totalOutputTokens = decisionsEstimate * outputTokensPerCall;
        const totalTokens = totalInputTokens + totalOutputTokens;
        // gpt-5.5 추정 단가 (USD per 1M tokens) — 실제 청구는 OpenAI 대시보드 기준
        const inputRatePerMTok = 5.0;
        const outputRatePerMTok = 15.0;
        const estimatedUsd = (totalInputTokens * inputRatePerMTok + totalOutputTokens * outputRatePerMTok) / 1_000_000;
        const fmtTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`;
        return (
          <Dialog
            open={btConfirmOpen}
            onClose={() => setBtConfirmOpen(false)}
            title="시뮬레이션 실행 전 확인"
            description={`아래 설정으로 ${btMode === "agent" ? "AI 에이전트" : "MA 교차"} 백테스트를 시작합니다.`}
            width={520}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setBtConfirmOpen(false)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBtConfirmOpen(false);
                    void handleBacktest();
                  }}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "var(--brand)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  시뮬레이션 시작
                </button>
              </>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 10px" }}>
                <span style={{ color: "var(--text-tertiary)" }}>전략</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {btMode === "agent" ? "AI 에이전트 (LLM 기반 BUY/SELL/HOLD 판단)" : "MA 교차 (5일/20일 이동평균)"}
                </span>

                <span style={{ color: "var(--text-tertiary)" }}>종목</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {ticker}{companyName ? ` · ${companyName}` : ""}
                </span>

                <span style={{ color: "var(--text-tertiary)" }}>기간</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {btStartDate} ~ {btEndDate} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(약 {calendarDays}일)</span>
                </span>

                <span style={{ color: "var(--text-tertiary)" }}>초기 자본</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmtKRW(btInitialCapital)}</span>

                <span style={{ color: "var(--text-tertiary)" }}>판단 주기</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {interval}거래일 <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>({intervalLabel})</span>
                </span>

                {btMode === "agent" && (
                  <>
                    <span style={{ color: "var(--text-tertiary)" }}>예상 판단 횟수</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      약 {decisionsEstimate}회 <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(거래일 ≈ {tradingDays}일)</span>
                    </span>

                    <span style={{ color: "var(--text-tertiary)" }}>예상 토큰 사용</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      약 {fmtTokens(totalTokens)} 토큰{" "}
                      <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                        (입력 {fmtTokens(totalInputTokens)} · 출력 {fmtTokens(totalOutputTokens)})
                      </span>
                    </span>

                    <span style={{ color: "var(--text-tertiary)" }}>예상 비용</span>
                    <span style={{ color: "var(--warning)", fontWeight: 700 }}>
                      ≈ ${estimatedUsd.toFixed(estimatedUsd < 1 ? 3 : 2)} USD{" "}
                      <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                        (gpt-5.5 기준 추정치)
                      </span>
                    </span>
                  </>
                )}
              </div>

              <div
                style={{
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: btMode === "agent" ? "var(--warning-subtle)" : "var(--bg-overlay)",
                  border: `1px solid ${btMode === "agent" ? "var(--warning-border)" : "var(--border-subtle)"}`,
                  fontSize: 12,
                  color: btMode === "agent" ? "var(--warning)" : "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                {btMode === "agent"
                  ? `각 판단 시점마다 LLM 호출이 1회 발생합니다. 약 ${decisionsEstimate}회 호출 · 약 ${fmtTokens(totalTokens)} 토큰 · 예상 비용 ≈ $${estimatedUsd.toFixed(estimatedUsd < 1 ? 3 : 2)} USD가 사용자의 OpenAI 키에 청구됩니다. (실제 청구는 OpenAI 대시보드 기준)`
                  : "MA 교차 전략은 LLM을 사용하지 않으므로 API 비용이 발생하지 않습니다. 과거 가격 데이터만 사용합니다."}
              </div>
            </div>
          </Dialog>
        );
      })()}

      {/* ── Human Approval Modal ────────────────────────────── */}
      <AnimatePresence>
        {approvalModal && decision && (
          <HumanApprovalModal
            decision={decision}
            onApprove={() => {
              setApprovalModal(false);
              setKisOrderTicker(decision.ticker);
              handleTabChange("trading");
            }}
            onReject={() => {
              setApprovalModal(false);
              setDecision(null);
            }}
            onOpenSettings={() => openSettings("guru")}
          />
        )}
      </AnimatePresence>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsInitialTab}
        userRole={currentUser?.role}
      />
    </div>
  );
}

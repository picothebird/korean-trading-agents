"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import type { AgentThought, AgentRole, TradeDecision, BacktestResult } from "@/types";
import { AgentOffice } from "@/components/AgentOffice";
import { DecisionCard } from "@/components/DecisionCard";
import { BacktestPanel } from "@/components/BacktestPanel";
import { startAnalysis, streamAnalysis, getMarketIndices, runBacktest } from "@/lib/api";

const POPULAR_TICKERS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "005380", name: "현대차" },
  { code: "035420", name: "NAVER" },
  { code: "051910", name: "LG화학" },
  { code: "000270", name: "기아" },
];

type Tab = "analysis" | "backtest";

export default function Home() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [ticker, setTicker] = useState("005930");
  const [isRunning, setIsRunning] = useState(false);
  const [thoughts, setThoughts] = useState<Map<AgentRole, AgentThought>>(new Map());
  const [activeAgents, setActiveAgents] = useState<Set<AgentRole>>(new Set());
  const [decision, setDecision] = useState<TradeDecision | null>(null);
  const [logs, setLogs] = useState<AgentThought[]>([]);
  const [marketData, setMarketData] = useState<Record<string, { current: number; change_pct: number }>>({});
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMarketIndices().then(setMarketData).catch(() => {});
  }, []);

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
        (dec) => setDecision(dec),
        () => { setIsRunning(false); setActiveAgents(new Set()); }
      );
    } catch { setIsRunning(false); }
  }, [ticker, isRunning]);

  const handleBacktest = useCallback(async () => {
    setBtLoading(true); setBtResult(null);
    try {
      const result = await runBacktest({ ticker, start_date: "2022-01-01", end_date: "2024-12-31", initial_capital: 10_000_000 });
      setBtResult(result);
    } finally { setBtLoading(false); }
  }, [ticker]);

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 border-b border-gray-200/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Korean Trading Agents</h1>
              <p className="text-xs text-gray-400">다중 AI 에이전트 자동매매</p>
            </div>
          </div>
          <div className="hidden gap-4 md:flex">
            {Object.entries(marketData).map(([name, data]) => (
              <div key={name} className="text-right">
                <p className="text-xs text-gray-400">{name}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {data.current.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                  <span className={clsx("ml-1 text-xs", data.change_pct >= 0 ? "text-red-500" : "text-blue-500")}>
                    {data.change_pct >= 0 ? "+" : ""}{data.change_pct.toFixed(2)}%
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* 컨트롤 바 */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex rounded-2xl bg-white p-1 shadow-sm">
            {(["analysis", "backtest"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={clsx("rounded-xl px-4 py-2 text-sm font-medium transition-all",
                  tab === t ? "bg-gray-900 text-white shadow" : "text-gray-500 hover:text-gray-700")}>
                {t === "analysis" ? "AI 분석" : "백테스트"}
              </button>
            ))}
          </div>
          {POPULAR_TICKERS.map(({ code, name }) => (
            <button key={code} onClick={() => setTicker(code)}
              className={clsx("rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                ticker === code ? "bg-gray-900 text-white" : "bg-white text-gray-600 shadow-sm hover:bg-gray-50")}>
              {name}
            </button>
          ))}
          <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value.trim())}
            placeholder="종목코드" className="w-28 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-gray-400" />
        </div>

        <AnimatePresence mode="wait">
          {tab === "analysis" ? (
            <motion.div key="analysis" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
              className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3 space-y-4">
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">에이전트 오피스</h2>
                      <p className="text-xs text-gray-400">{ticker} 실시간 분석</p>
                    </div>
                    <button onClick={handleAnalyze} disabled={isRunning}
                      className={clsx("rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all",
                        isRunning ? "cursor-not-allowed bg-gray-100 text-gray-400" : "bg-gray-900 text-white hover:bg-gray-700 active:scale-95")}>
                      {isRunning ? "분석 중..." : "분석 시작"}
                    </button>
                  </div>
                  <AgentOffice thoughts={thoughts} activeAgents={activeAgents} />
                </div>
                {logs.length > 0 && (
                  <div className="rounded-3xl bg-white p-4 shadow-sm">
                    <p className="mb-2 text-xs font-medium text-gray-400">실시간 로그</p>
                    <div className="h-36 overflow-y-auto space-y-1 pr-1">
                      {logs.slice(-20).map((log, i) => (
                        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 text-xs">
                          <span className="shrink-0 text-gray-300">{new Date(log.timestamp).toLocaleTimeString("ko-KR")}</span>
                          <span className="text-gray-500 line-clamp-1">{log.content}</span>
                        </motion.div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 space-y-4">
                {decision ? <DecisionCard decision={decision} /> : (
                  <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
                    <p className="text-5xl">🎯</p>
                    <p className="mt-3 text-sm text-gray-400">분석 시작을 누르면<br/>AI 에이전트가 분석합니다</p>
                  </div>
                )}
                <div className="rounded-3xl bg-gradient-to-br from-gray-800 to-gray-900 p-5 text-white">
                  <p className="text-xs font-medium text-gray-400">시스템 안내</p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-100">
                    8개 전문 AI 에이전트가 기술적·감성·매크로 분석을 병렬 수행하고, 강세/약세 토론을 거쳐 최종 매매 결정을 내립니다.
                  </p>
                  <p className="mt-3 text-xs text-gray-500">⚠️ 투자 참고용 — 실제 투자 결정은 본인 책임</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="backtest" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">백테스트</h2>
                    <p className="text-xs text-gray-400">{ticker} | 2022.01~2024.12 | 초기 1,000만원</p>
                  </div>
                  <button onClick={handleBacktest} disabled={btLoading}
                    className={clsx("rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all",
                      btLoading ? "cursor-not-allowed bg-gray-100 text-gray-400" : "bg-gray-900 text-white hover:bg-gray-700")}>
                    {btLoading ? "실행 중..." : "백테스트 실행"}
                  </button>
                </div>
                {btResult ? <BacktestPanel result={btResult} /> : (
                  <div className="flex h-48 items-center justify-center">
                    <div className="text-center">
                      <p className="text-4xl">📈</p>
                      <p className="mt-2 text-sm text-gray-400">백테스트 실행 버튼을 눌러 성과를 확인하세요</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPortfolioLoopStatus,
  scanPortfolioLoop,
  startPortfolioLoop,
  stopPortfolioLoop,
} from "@/lib/api";
import type {
  AutoLoopLog,
  AutoLoopTradeRecord,
  ExecutionSessionMode,
  MonitoringProfile,
  PortfolioLoopStartRequest,
  PortfolioLoopStatus,
  UniverseMarket,
} from "@/types";

interface PortfolioLoopPanelProps {
  ticker: string;
  onTradeRecorded?: (trade: AutoLoopTradeRecord) => void;
}

interface PortfolioLoopSettingsUi {
  enabled: boolean;
  name: string;
  seedTickersText: string;
  preferredTickersText: string;
  excludedTickersText: string;
  interestKeywordsText: string;
  monitoringProfile: MonitoringProfile;
  marketScanEnabled: boolean;
  universeMarket: UniverseMarket;
  universeLimit: number;
  candidateCount: number;
  maxPositions: number;
  maxParallelAnalyses: number;
  cycleIntervalMin: number;
  minConfidence: number;
  maxSinglePositionPct: number;
  rebalanceThresholdPct: number;
  paperTrade: boolean;
  initialCash: number;
  feeBps: number;
  slippageBps: number;
  taxBps: number;
  executionSessionMode: ExecutionSessionMode;
}

const SETTINGS_KEY = "kta_portfolio_loop_settings_v1";
const LOOP_ID_KEY = "kta_portfolio_loop_id_v1";

function LevelDot({ level }: { level: AutoLoopLog["level"] }) {
  const color =
    level === "success"
      ? "var(--success)"
      : level === "warn"
      ? "var(--warning)"
      : level === "error"
      ? "var(--error)"
      : "var(--brand)";
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function toSeedTickers(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  )
    .map((x) => x.replace(/\D/g, ""))
    .filter((x) => x.length > 0)
    .map((x) => x.padStart(6, "0"))
    .slice(0, 60);
}

function toKeywords(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

export function PortfolioLoopPanel({ ticker, onTradeRecorded }: PortfolioLoopPanelProps) {
  const [settings, setSettings] = useState<PortfolioLoopSettingsUi>({
    enabled: false,
    name: "portfolio-main",
    seedTickersText: ticker,
    preferredTickersText: ticker,
    excludedTickersText: "",
    interestKeywordsText: "반도체,AI,2차전지",
    monitoringProfile: "balanced",
    marketScanEnabled: true,
    universeMarket: "ALL",
    universeLimit: 60,
    candidateCount: 8,
    maxPositions: 5,
    maxParallelAnalyses: 3,
    cycleIntervalMin: 20,
    minConfidence: 0.7,
    maxSinglePositionPct: 25,
    rebalanceThresholdPct: 1.5,
    paperTrade: true,
    initialCash: 20_000_000,
    feeBps: 1.5,
    slippageBps: 3,
    taxBps: 18,
    executionSessionMode: "regular_only",
  });

  const [loopId, setLoopId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusData, setStatusData] = useState<PortfolioLoopStatus | null>(null);
  const [uiLogs, setUiLogs] = useState<AutoLoopLog[]>([]);

  const lastTradeKeyRef = useRef<string>("");

  const appendUiLog = useCallback((level: AutoLoopLog["level"], message: string) => {
    const stamp = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setUiLogs((prev) => [...prev, { timestamp: stamp, level, message }].slice(-120));
  }, []);

  const formatRunAt = useCallback((iso: string | null) => {
    if (!iso) return null;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PortfolioLoopSettingsUi>;
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          enabled: false,
        }));
      }
      const storedLoopId = localStorage.getItem(LOOP_ID_KEY);
      if (storedLoopId) setLoopId(storedLoopId);
    } catch {
      // ignore storage parse errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, enabled: false }));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  useEffect(() => {
    try {
      if (loopId) localStorage.setItem(LOOP_ID_KEY, loopId);
      else localStorage.removeItem(LOOP_ID_KEY);
    } catch {
      // ignore storage errors
    }
  }, [loopId]);

  useEffect(() => {
    if (!loopId) return;
    let disposed = false;

    const sync = async () => {
      try {
        const st = await getPortfolioLoopStatus(loopId);
        if (disposed) return;

        setStatusData(st);
        if (settings.enabled !== st.running) {
          setSettings((prev) => ({ ...prev, enabled: st.running }));
        }

        if (st.trade_history.length > 0) {
          const t = st.trade_history[0];
          const key = `${t.timestamp}|${t.ticker}|${t.side}|${t.qty}|${t.status}`;
          if (key !== lastTradeKeyRef.current) {
            lastTradeKeyRef.current = key;
            onTradeRecorded?.(t);
          }
        }
      } catch (e: unknown) {
        if (disposed) return;
        const msg = e instanceof Error ? e.message : "포트폴리오 루프 상태 조회 실패";
        if (msg.includes("404")) {
          setLoopId(null);
          setStatusData(null);
          setSettings((prev) => ({ ...prev, enabled: false }));
          appendUiLog("warn", "저장된 포트폴리오 루프를 찾을 수 없어 상태를 초기화했습니다.");
          return;
        }
        appendUiLog("error", msg);
      }
    };

    void sync();
    const id = setInterval(() => {
      void sync();
    }, 5000);

    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [loopId, settings.enabled, appendUiLog, onTradeRecorded]);

  useEffect(() => {
    setSettings((prev) => {
      if (prev.seedTickersText.includes(ticker)) return prev;
      if (!prev.seedTickersText.trim()) {
        return { ...prev, seedTickersText: ticker };
      }
      return prev;
    });
  }, [ticker]);

  const toggleLoop = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (settings.enabled) {
        if (!loopId) {
          setSettings((prev) => ({ ...prev, enabled: false }));
          appendUiLog("warn", "활성 루프 ID가 없어 토글을 동기화했습니다.");
          return;
        }
        await stopPortfolioLoop(loopId);
        setSettings((prev) => ({ ...prev, enabled: false }));
        setLoopId(null);
        setStatusData((prev) => (prev ? { ...prev, running: false } : prev));
        appendUiLog("warn", "포트폴리오 루프를 중지했습니다.");
        return;
      }

      const req: PortfolioLoopStartRequest = {
        name: settings.name.trim() || "portfolio-main",
        seed_tickers: toSeedTickers(settings.seedTickersText),
        preferred_tickers: toSeedTickers(settings.preferredTickersText),
        excluded_tickers: toSeedTickers(settings.excludedTickersText),
        interest_keywords: toKeywords(settings.interestKeywordsText),
        monitoring_profile: settings.monitoringProfile,
        market_scan_enabled: settings.marketScanEnabled,
        universe_market: settings.universeMarket,
        universe_limit: Math.max(10, Math.min(200, Math.floor(settings.universeLimit))),
        candidate_count: Math.max(1, Math.min(30, Math.floor(settings.candidateCount))),
        max_positions: Math.max(1, Math.min(20, Math.floor(settings.maxPositions))),
        max_parallel_analyses: Math.max(1, Math.min(8, Math.floor(settings.maxParallelAnalyses))),
        cycle_interval_min: Math.max(1, Math.min(1440, Math.floor(settings.cycleIntervalMin))),
        min_confidence: Math.max(0, Math.min(1, settings.minConfidence)),
        max_single_position_pct: Math.max(1, Math.min(100, settings.maxSinglePositionPct)),
        rebalance_threshold_pct: Math.max(0, Math.min(20, settings.rebalanceThresholdPct)),
        paper_trade: settings.paperTrade,
        initial_cash: Math.max(10_000, settings.initialCash),
        fee_bps: Math.max(0, settings.feeBps),
        slippage_bps: Math.max(0, settings.slippageBps),
        tax_bps: Math.max(0, settings.taxBps),
        execution_session_mode: settings.executionSessionMode,
      };

      const started = await startPortfolioLoop(req);
      setLoopId(started.loop_id);
      setSettings((prev) => ({ ...prev, enabled: true }));
      appendUiLog("success", `포트폴리오 루프 시작 · ${req.name} · ${req.cycle_interval_min}분`);
    } catch (e: unknown) {
      appendUiLog("error", e instanceof Error ? e.message : "포트폴리오 루프 요청 처리 실패");
    } finally {
      setBusy(false);
    }
  }, [busy, settings, loopId, appendUiLog]);

  const scanNow = useCallback(async () => {
    if (busy) return;
    if (!loopId) {
      appendUiLog("warn", "수동 스캔을 하려면 먼저 포트폴리오 루프를 시작하세요.");
      return;
    }

    setBusy(true);
    try {
      const st = await scanPortfolioLoop(loopId);
      setStatusData(st);
      appendUiLog("info", `수동 스캔 완료 · 후보 ${st.latest_candidates.length}개`);
    } catch (e: unknown) {
      appendUiLog("error", e instanceof Error ? e.message : "수동 스캔 실패");
    } finally {
      setBusy(false);
    }
  }, [busy, loopId, appendUiLog]);

  const mergedLogs = useMemo(() => {
    const serverLogs = statusData?.logs ?? [];
    return [...serverLogs, ...uiLogs].slice(-200);
  }, [statusData, uiLogs]);

  const statusText = useMemo(() => {
    if (busy) return "요청 처리 중";
    if (statusData?.cycle_running) return "사이클 실행 중";
    if (settings.enabled) return "대기 중";
    return "중지";
  }, [busy, statusData?.cycle_running, settings.enabled]);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-default)",
        padding: "14px 14px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>포트폴리오 오케스트레이션 루프</p>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
            상태: {statusText}
            {statusData?.current_session ? ` · 세션 ${statusData.current_session}` : ""}
            {statusData?.last_run_at ? ` · 마지막 ${formatRunAt(statusData.last_run_at)}` : ""}
            {statusData?.last_scan_at ? ` · 스캔 ${formatRunAt(statusData.last_scan_at)}` : ""}
            {statusData?.next_run_at ? ` · 다음 ${formatRunAt(statusData.next_run_at)}` : ""}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => {
              void scanNow();
            }}
            disabled={busy || !loopId}
            style={{
              border: "1px solid var(--border-default)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              borderRadius: 99,
              padding: "5px 11px",
              fontSize: 10,
              fontWeight: 700,
              cursor: busy || !loopId ? "not-allowed" : "pointer",
              opacity: busy || !loopId ? 0.6 : 1,
            }}
          >
            지금 스캔
          </button>

          <button
            onClick={() => {
              void toggleLoop();
            }}
            disabled={busy}
            style={{
              border: "1px solid var(--border-default)",
              background: settings.enabled ? "rgba(47,202,115,0.15)" : "var(--bg-elevated)",
              color: settings.enabled ? "var(--success)" : "var(--text-secondary)",
              borderRadius: 99,
              padding: "5px 11px",
              fontSize: 10,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {settings.enabled ? "포트폴리오 ON" : "포트폴리오 OFF"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>루프 이름</span>
          <input
            type="text"
            value={settings.name}
            onChange={(e) => setSettings((prev) => ({ ...prev, name: e.target.value }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>시드 종목(콤마/공백 구분)</span>
          <input
            type="text"
            value={settings.seedTickersText}
            onChange={(e) => setSettings((prev) => ({ ...prev, seedTickersText: e.target.value }))}
            placeholder="005930,000660"
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>모니터링 프로파일</span>
          <select
            value={settings.monitoringProfile}
            onChange={(e) => setSettings((prev) => ({ ...prev, monitoringProfile: e.target.value as MonitoringProfile }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          >
            <option value="balanced">균형형</option>
            <option value="momentum">모멘텀형</option>
            <option value="defensive">방어형</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 3" }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>선호 종목</span>
          <input
            type="text"
            value={settings.preferredTickersText}
            onChange={(e) => setSettings((prev) => ({ ...prev, preferredTickersText: e.target.value }))}
            placeholder="005930,000660"
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>제외 종목</span>
          <input
            type="text"
            value={settings.excludedTickersText}
            onChange={(e) => setSettings((prev) => ({ ...prev, excludedTickersText: e.target.value }))}
            placeholder="042660,005490"
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>관심 키워드</span>
          <input
            type="text"
            value={settings.interestKeywordsText}
            onChange={(e) => setSettings((prev) => ({ ...prev, interestKeywordsText: e.target.value }))}
            placeholder="반도체,AI,배당"
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>주기(분)</span>
          <input
            type="number"
            min={1}
            max={1440}
            value={settings.cycleIntervalMin}
            onChange={(e) => setSettings((prev) => ({ ...prev, cycleIntervalMin: Number(e.target.value || 1) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>유니버스</span>
          <input
            type="number"
            min={10}
            max={200}
            value={settings.universeLimit}
            onChange={(e) => setSettings((prev) => ({ ...prev, universeLimit: Number(e.target.value || 10) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>후보 수</span>
          <input
            type="number"
            min={1}
            max={30}
            value={settings.candidateCount}
            onChange={(e) => setSettings((prev) => ({ ...prev, candidateCount: Number(e.target.value || 1) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>최대 보유 수</span>
          <input
            type="number"
            min={1}
            max={20}
            value={settings.maxPositions}
            onChange={(e) => setSettings((prev) => ({ ...prev, maxPositions: Number(e.target.value || 1) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>병렬 분석 수</span>
          <input
            type="number"
            min={1}
            max={8}
            value={settings.maxParallelAnalyses}
            onChange={(e) => setSettings((prev) => ({ ...prev, maxParallelAnalyses: Number(e.target.value || 1) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>최소 신뢰도</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={settings.minConfidence}
            onChange={(e) => setSettings((prev) => ({ ...prev, minConfidence: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>종목당 최대비중(%)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.maxSinglePositionPct}
            onChange={(e) => setSettings((prev) => ({ ...prev, maxSinglePositionPct: Number(e.target.value || 1) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>리밸런싱 임계치(%)</span>
          <input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={settings.rebalanceThresholdPct}
            onChange={(e) => setSettings((prev) => ({ ...prev, rebalanceThresholdPct: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>마켓</span>
          <select
            value={settings.universeMarket}
            onChange={(e) => setSettings((prev) => ({ ...prev, universeMarket: e.target.value as UniverseMarket }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          >
            <option value="ALL">전체</option>
            <option value="KOSPI">KOSPI</option>
            <option value="KOSDAQ">KOSDAQ</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>세션 모델</span>
          <select
            value={settings.executionSessionMode}
            onChange={(e) => setSettings((prev) => ({ ...prev, executionSessionMode: e.target.value as ExecutionSessionMode }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          >
            <option value="regular_only">정규장 전용</option>
            <option value="regular_and_after_hours">정규+시간외</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>초기 자본</span>
          <input
            type="number"
            min={10000}
            value={settings.initialCash}
            onChange={(e) => setSettings((prev) => ({ ...prev, initialCash: Number(e.target.value || 10000) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>수수료(bps)</span>
          <input
            type="number"
            min={0}
            max={500}
            step={0.1}
            value={settings.feeBps}
            onChange={(e) => setSettings((prev) => ({ ...prev, feeBps: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>슬리피지(bps)</span>
          <input
            type="number"
            min={0}
            max={500}
            value={settings.slippageBps}
            onChange={(e) => setSettings((prev) => ({ ...prev, slippageBps: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>거래세(bps)</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={settings.taxBps}
            onChange={(e) => setSettings((prev) => ({ ...prev, taxBps: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.marketScanEnabled}
            onChange={(e) => setSettings((prev) => ({ ...prev, marketScanEnabled: e.target.checked }))}
          />
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>시장 스캔 사용</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.paperTrade}
            onChange={(e) => setSettings((prev) => ({ ...prev, paperTrade: e.target.checked }))}
          />
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>모의 거래</span>
        </label>
      </div>

      {statusData && (
        <div
          style={{
            marginBottom: 10,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>포트폴리오 계좌/통계</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>현금: {Math.round(statusData.account.cash).toLocaleString("ko-KR")}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>평가: {Math.round(statusData.account.total_equity).toLocaleString("ko-KR")}</p>
            <p style={{ fontSize: 10, color: statusData.account.realized_pnl >= 0 ? "var(--success)" : "var(--error)" }}>
              실현손익: {Math.round(statusData.account.realized_pnl).toLocaleString("ko-KR")}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>사이클: {statusData.stats.cycle_count}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>분석: {statusData.stats.analysis_count}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>스캔: {statusData.stats.scan_count}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>수동스캔: {statusData.stats.manual_scan_count}</p>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
            minHeight: 170,
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>유망 후보 Top</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 150, overflowY: "auto" }}>
            {(statusData?.latest_candidates ?? []).slice(0, 10).map((c) => (
              <div key={c.ticker} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                  {c.name || c.ticker} ({c.ticker})
                </p>
                <p style={{ fontSize: 10, color: c.change_pct >= 0 ? "var(--success)" : "var(--error)", fontVariantNumeric: "tabular-nums" }}>
                  {c.change_pct >= 0 ? "+" : ""}
                  {c.change_pct.toFixed(2)}%
                </p>
                <p style={{ fontSize: 10, color: "var(--text-primary)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {c.score.toFixed(2)}
                </p>
              </div>
            ))}
            {(statusData?.latest_candidates?.length ?? 0) === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>아직 후보가 없습니다.</p>}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
            minHeight: 170,
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>목표 배분 vs 현재 배분</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 150, overflowY: "auto" }}>
            {(statusData?.target_allocations ?? []).slice(0, 10).map((a) => (
              <div key={a.ticker} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>{a.ticker}</p>
                <p style={{ fontSize: 10, color: "var(--brand)", fontVariantNumeric: "tabular-nums" }}>{a.target_weight_pct.toFixed(1)}%</p>
                <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{a.current_weight_pct.toFixed(1)}%</p>
              </div>
            ))}
            {(statusData?.target_allocations?.length ?? 0) === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>아직 배분 데이터가 없습니다.</p>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>최근 거래</p>
          <div style={{ maxHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
            {(statusData?.trade_history ?? []).slice(0, 12).map((t, i) => (
              <div key={`${t.timestamp}-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                <p style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.35 }}>
                  {t.ticker} · {t.side === "buy" ? "매수" : "매도"} {t.qty}주
                </p>
                <p style={{ fontSize: 10, color: "var(--text-primary)", fontWeight: 700 }}>{Math.round(t.price).toLocaleString("ko-KR")}</p>
                <p style={{ fontSize: 9, color: t.status === "failed" ? "var(--error)" : t.status === "executed" ? "var(--brand)" : "var(--success)" }}>
                  {t.status}
                </p>
              </div>
            ))}
            {(statusData?.trade_history?.length ?? 0) === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>거래 이력이 없습니다.</p>}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>보유 포지션</p>
          <div style={{ maxHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
            {(statusData?.account.positions ?? []).slice(0, 12).map((p) => (
              <div key={p.ticker} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>{p.ticker}</p>
                <p style={{ fontSize: 10, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{p.weight_pct.toFixed(1)}%</p>
                <p style={{ fontSize: 10, color: p.unrealized_pnl >= 0 ? "var(--success)" : "var(--error)", fontVariantNumeric: "tabular-nums" }}>
                  {p.unrealized_pnl >= 0 ? "+" : ""}
                  {Math.round(p.unrealized_pnl).toLocaleString("ko-KR")}
                </p>
              </div>
            ))}
            {(statusData?.account.positions?.length ?? 0) === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>보유 포지션이 없습니다.</p>}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "8px 10px",
        }}
      >
        <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>포트폴리오 로그</p>
        <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {mergedLogs.slice(-40).reverse().map((log, idx) => (
            <div key={`${log.timestamp}-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <LevelDot level={log.level} />
              <p style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                <span style={{ color: "var(--text-tertiary)", marginRight: 5 }}>{log.timestamp}</span>
                {log.message}
              </p>
            </div>
          ))}
          {mergedLogs.length === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>아직 로그가 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}

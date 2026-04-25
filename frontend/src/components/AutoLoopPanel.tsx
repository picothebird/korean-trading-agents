"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getAutoLoopStatus, startAutoLoop, stopAutoLoop } from "@/lib/api";
import {
  TabPills,
  Icon,
  SettingsSection,
  FieldRow,
  FieldCell,
  fieldInputStyle as inputStyle,
} from "@/components/ui";
import type { AutoLoopStatus, ExecutionSessionMode, SupervisionLevel, TradeDecision } from "@/types";

interface AutoLoopPanelProps {
  ticker: string;
  showVisuals?: boolean;
  onDecision?: (decision: TradeDecision) => void;
  onTradeRecorded?: (trade: AutoTradeRecord) => void;
}

interface AutoLoopSettings {
  enabled: boolean;
  intervalMin: number;
  minConfidence: number;
  orderQty: number;
  paperTrade: boolean;
  feeBps: number;
  slippageBps: number;
  taxBps: number;
  maxPositionPct: number;
  supervisionLevel: SupervisionLevel;
  executionSessionMode: ExecutionSessionMode;
  initialCash: number;
  dailyMaxOrders: number; // 0 = 제한 없음
  dailyMaxLossKrw: number; // 0 = 제한 없음
}

interface LoopLog {
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

interface DecisionHistoryPoint {
  timestamp: string;
  confidence: number;
  actionScore: number;
  action: "BUY" | "SELL" | "HOLD";
}

export interface AutoTradeRecord {
  timestamp: string;
  ticker: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  status: "simulated" | "executed" | "failed";
  confidence: number;
  reason: string;
}

const SETTINGS_KEY = "kta_auto_loop_settings_v1";
const LOOP_ID_KEY = "kta_auto_loop_id_v1";

function LevelDot({ level }: { level: LoopLog["level"] }) {
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

export function AutoLoopPanel({ ticker, showVisuals = true, onDecision, onTradeRecorded }: AutoLoopPanelProps) {
  const [settings, setSettings] = useState<AutoLoopSettings>({
    enabled: false,
    intervalMin: 15,
    minConfidence: 0.72,
    orderQty: 1,
    paperTrade: true,
    feeBps: 1.5,
    slippageBps: 3,
    taxBps: 18,
    maxPositionPct: 25,
    supervisionLevel: "balanced",
    executionSessionMode: "regular_only",
    initialCash: 10_000_000,
    dailyMaxOrders: 0,
    dailyMaxLossKrw: 0,
  });
  const [loopId, setLoopId] = useState<string | null>(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [serverLogs, setServerLogs] = useState<LoopLog[]>([]);
  const [uiLogs, setUiLogs] = useState<LoopLog[]>([]);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryPoint[]>([]);
  const [tradeHistory, setTradeHistory] = useState<AutoTradeRecord[]>([]);
  const [paperAccount, setPaperAccount] = useState<AutoLoopStatus["paper_account"]>(null);
  const [statusInfo, setStatusInfo] = useState<AutoLoopStatus["stats"] | null>(null);
  const [busy, setBusy] = useState(false);
  type InnerTab = "settings" | "activity" | "trades";
  const [innerTab, setInnerTab] = useState<InnerTab>("settings");

  const lastDecisionTsRef = useRef<string>("");
  const lastTradeKeyRef = useRef<string>("");
  const dayBaselineRef = useRef<{ day: string; realizedPnl: number }>({ day: "", realizedPnl: 0 });
  const warnedTickerRef = useRef<string>("");

  const appendUiLog = useCallback((level: LoopLog["level"], message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setUiLogs((prev) => [...prev, { timestamp, level, message }].slice(-80));
  }, []);

  const formatRunAt = useCallback((iso: string | null) => {
    if (!iso) return null;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AutoLoopSettings>;
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          enabled: false,
        }));
      }

      const storedLoopId = localStorage.getItem(LOOP_ID_KEY);
      if (storedLoopId) {
        setLoopId(storedLoopId);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      const saveData = { ...settings, enabled: false };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(saveData));
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

    const syncStatus = async () => {
      try {
        const st = await getAutoLoopStatus(loopId);
        if (disposed) return;

        setRunningCycle(st.cycle_running);
        setLastRunAt(formatRunAt(st.last_run_at));
        setNextRunAt(formatRunAt(st.next_run_at));
        setServerLogs(st.logs.slice(-120));
        setDecisionHistory(st.decision_history.slice(-60));
        setTradeHistory(st.trade_history.slice(0, 80));
        setPaperAccount(st.paper_account);
        setStatusInfo(st.stats);

        if (st.running !== settings.enabled) {
          setSettings((prev) => ({ ...prev, enabled: st.running }));
        }

        if (st.latest_decision?.timestamp && st.latest_decision.timestamp !== lastDecisionTsRef.current) {
          lastDecisionTsRef.current = st.latest_decision.timestamp;
          onDecision?.(st.latest_decision);
        }

        if (st.trade_history.length > 0) {
          const t = st.trade_history[0];
          const key = `${t.timestamp}|${t.side}|${t.qty}|${t.status}`;
          if (key !== lastTradeKeyRef.current) {
            lastTradeKeyRef.current = key;
            onTradeRecorded?.(t);
          }
        }

        if (st.running && st.ticker !== ticker) {
          const warnKey = `${st.loop_id}:${st.ticker}:${ticker}`;
          if (warnedTickerRef.current !== warnKey) {
            warnedTickerRef.current = warnKey;
            appendUiLog("warn", `현재 루프는 ${st.ticker} 대상입니다. 새 종목 ${ticker} 적용은 루프 재시작이 필요합니다.`);
          }
        }
      } catch (e: unknown) {
        if (disposed) return;
        const msg = e instanceof Error ? e.message : "자동 루프 상태 조회에 실패했습니다.";
        if (msg.includes("404")) {
          appendUiLog("warn", "저장된 자동 루프를 찾지 못해 상태를 초기화합니다.");
          setLoopId(null);
          setSettings((prev) => ({ ...prev, enabled: false }));
          setRunningCycle(false);
          setLastRunAt(null);
          setNextRunAt(null);
          setServerLogs([]);
          setPaperAccount(null);
          setStatusInfo(null);
          return;
        }
        appendUiLog("error", msg);
      }
    };

    void syncStatus();
    const id = setInterval(() => {
      void syncStatus();
    }, 4000);

    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [loopId, ticker, settings.enabled, formatRunAt, onDecision, onTradeRecorded, appendUiLog]);

  const toggleAutoLoop = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (settings.enabled) {
        if (!loopId) {
          setSettings((prev) => ({ ...prev, enabled: false }));
          appendUiLog("warn", "활성 루프 ID가 없어 토글 상태를 동기화했습니다.");
          return;
        }
        await stopAutoLoop(loopId);
        setSettings((prev) => ({ ...prev, enabled: false }));
        setLoopId(null);
        setRunningCycle(false);
        setNextRunAt(null);
        appendUiLog("warn", "자동 루프를 중지했습니다.");
        return;
      }

      const started = await startAutoLoop({
        ticker,
        interval_min: Math.max(1, Math.floor(settings.intervalMin)),
        min_confidence: Math.max(0, Math.min(1, settings.minConfidence)),
        order_qty: Math.max(1, Math.floor(settings.orderQty)),
        paper_trade: settings.paperTrade,
        fee_bps: Math.max(0, settings.feeBps),
        slippage_bps: Math.max(0, settings.slippageBps),
        tax_bps: Math.max(0, settings.taxBps),
        max_position_pct: Math.max(1, Math.min(100, settings.maxPositionPct)),
        supervision_level: settings.supervisionLevel,
        execution_session_mode: settings.executionSessionMode,
        initial_cash: Math.max(10_000, settings.initialCash),
      });

      lastDecisionTsRef.current = "";
      lastTradeKeyRef.current = "";
      setLoopId(started.loop_id);
      setSettings((prev) => ({ ...prev, enabled: true }));
      appendUiLog("success", `자동 루프 시작 · ${ticker} · ${Math.max(1, Math.floor(settings.intervalMin))}분 간격`);
    } catch (e: unknown) {
      appendUiLog("error", e instanceof Error ? e.message : "자동 루프 요청 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, settings, ticker, loopId, appendUiLog]);

  const statusText = useMemo(() => {
    if (busy) return "요청 처리 중";
    if (runningCycle) return "사이클 실행 중";
    if (settings.enabled) return "대기 중";
    return "중지";
  }, [busy, runningCycle, settings.enabled]);

  const mergedLogs = useMemo(() => {
    return [...serverLogs, ...uiLogs].slice(-150);
  }, [serverLogs, uiLogs]);

  // ── 일일 한도 추적 ──
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const todayOrderCount = useMemo(() => {
    return tradeHistory.filter((t) => (t.timestamp || "").startsWith(todayKey)).length;
  }, [tradeHistory, todayKey]);
  const todayRealizedDelta = useMemo(() => {
    if (!paperAccount) return 0;
    if (dayBaselineRef.current.day !== todayKey) {
      dayBaselineRef.current = { day: todayKey, realizedPnl: paperAccount.realized_pnl };
      return 0;
    }
    return paperAccount.realized_pnl - dayBaselineRef.current.realizedPnl;
  }, [paperAccount, todayKey]);

  // 일일 한도 초과 시 자동 일시중지
  useEffect(() => {
    if (!settings.enabled) return;
    const overOrders = settings.dailyMaxOrders > 0 && todayOrderCount >= settings.dailyMaxOrders;
    const overLoss = settings.dailyMaxLossKrw > 0 && todayRealizedDelta <= -Math.abs(settings.dailyMaxLossKrw);
    if (overOrders || overLoss) {
      const reason = overOrders
        ? `일일 주문 한도(${settings.dailyMaxOrders}건) 도달`
        : `일일 손실 한도(-${settings.dailyMaxLossKrw.toLocaleString("ko-KR")}원) 도달`;
      appendUiLog("warn", `${reason} → 자동 일시중지`);
      void toggleAutoLoop();
    }
  }, [settings.enabled, settings.dailyMaxOrders, settings.dailyMaxLossKrw, todayOrderCount, todayRealizedDelta, appendUiLog, toggleAutoLoop]);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-default)",
        padding: "14px 14px 12px",
        marginBottom: 14,
      }}
    >
      {/* 역할 안내 배너 — 단일종목 자동매매 (PF1) */}
      <div style={{
        padding: "10px 12px",
        marginBottom: 12,
        background: "var(--info-subtle, var(--bg-elevated))",
        border: "1px solid var(--info-border, var(--border-subtle))",
        borderRadius: "var(--radius-lg)",
        fontSize: 11,
        color: "var(--text-secondary)",
        lineHeight: 1.55,
      }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
          🤖 단일 종목 자동매매란?
        </p>
        지금 분석 중인 한 종목({ticker})에 대해 정해진 주기마다 매수/매도 판단을 반복합니다.
        “어떤 종목을 살지”는 사용자가 정하고, 시점·수량·매도 타이밍을 자동화하는 도구입니다.
        여러 종목을 동시에 굴리려면 <b>포트폴리오 루프</b>를 사용하세요.
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>자동 분석·주문 루프</p>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
            상태: {statusText}{lastRunAt ? ` · 마지막 실행 ${lastRunAt}` : ""}{nextRunAt ? ` · 다음 실행 ${nextRunAt}` : ""}
          </p>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {settings.enabled && paperAccount && paperAccount.shares > 0 && (
            <button
              onClick={() => {
                if (typeof window === "undefined") return;
                const ok = window.confirm(
                  `현재 보유 ${paperAccount.shares.toFixed(2)}주 (평가 ${Math.round(paperAccount.market_value).toLocaleString("ko-KR")}원, 미실현 ${Math.round(paperAccount.unrealized_pnl).toLocaleString("ko-KR")}원).\n\n루프를 중지하고 매도(청산) 페이지로 이동합니다.\n계속하시겠습니까?`
                );
                if (!ok) return;
                void toggleAutoLoop();
                try {
                  window.dispatchEvent(new CustomEvent("kta:liquidate-request", {
                    detail: { ticker, qty: Math.floor(paperAccount.shares) },
                  }));
                } catch { /* ignore */ }
              }}
              disabled={busy}
              title="루프 중지 후 보유 포지션 매도 페이지로 이동"
              style={{
                border: "1px solid var(--bear-border, var(--bear))",
                background: "var(--bear-subtle, transparent)",
                color: "var(--bear)",
                borderRadius: 99,
                padding: "5px 10px",
                fontSize: 10,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              ⛔ 즉시청산
            </button>
          )}
          <button
            onClick={() => {
              void toggleAutoLoop();
            }}
            disabled={busy}
            style={{
              border: settings.enabled ? "1px solid var(--warning-border, var(--success-border))" : "1px solid var(--success-border)",
              background: settings.enabled ? "var(--warning-subtle, var(--success-subtle))" : "var(--success-subtle)",
              color: settings.enabled ? "var(--warning, var(--success))" : "var(--success)",
              borderRadius: 99,
              padding: "5px 11px",
              fontSize: 10,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {settings.enabled ? "⏸ 일시중지" : "▶ 자동 실행"}
          </button>
        </div>
      </div>

      {/* 포지션 요약 카드 (보유 시) */}
      {paperAccount && paperAccount.shares > 0 && (
        <div style={{
          padding: "10px 12px",
          marginBottom: 10,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0,1fr))",
          gap: 8,
        }}>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>보유</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{paperAccount.shares.toFixed(2)}주</p>
          </div>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>평균단가</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{Math.round(paperAccount.avg_buy_price).toLocaleString("ko-KR")}</p>
          </div>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>평가금액</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{Math.round(paperAccount.market_value).toLocaleString("ko-KR")}</p>
          </div>
          <div>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>미실현 손익</p>
            <p style={{ fontSize: 12, fontWeight: 800, color: paperAccount.unrealized_pnl >= 0 ? "var(--bull)" : "var(--bear)" }}>
              {paperAccount.unrealized_pnl >= 0 ? "+" : ""}{Math.round(paperAccount.unrealized_pnl).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
      )}

      {/* 일일 한도 표시 칩 */}
      {(settings.dailyMaxOrders > 0 || settings.dailyMaxLossKrw > 0) && (
        <div style={{
          padding: "8px 12px",
          marginBottom: 10,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          gap: 14,
          alignItems: "center",
          fontSize: 10,
          color: "var(--text-secondary)",
          flexWrap: "wrap",
        }}>
          <span style={{ fontWeight: 700, color: "var(--text-tertiary)" }}>오늘 한도</span>
          {settings.dailyMaxOrders > 0 && (
            <span>
              주문 <b style={{ color: todayOrderCount >= settings.dailyMaxOrders ? "var(--bear)" : "var(--text-primary)" }}>
                {todayOrderCount}/{settings.dailyMaxOrders}
              </b>건
            </span>
          )}
          {settings.dailyMaxLossKrw > 0 && (
            <span>
              손실 <b style={{ color: todayRealizedDelta <= -settings.dailyMaxLossKrw ? "var(--bear)" : "var(--text-primary)" }}>
                {todayRealizedDelta >= 0 ? "+" : ""}{Math.round(todayRealizedDelta).toLocaleString("ko-KR")}
              </b> / 한도 -{settings.dailyMaxLossKrw.toLocaleString("ko-KR")}원
            </span>
          )}
        </div>
      )}

      {/* Internal tab pills — split dense settings/activity/trades */}
      <div style={{ marginBottom: 12 }}>
        <TabPills<InnerTab>
          ariaLabel="자동 루프 내부 탭"
          size="sm"
          fullWidth
          value={innerTab}
          onChange={(v) => setInnerTab(v)}
          items={[
            { value: "settings", label: "설정", icon: <Icon name="settings" size={13} decorative /> },
            { value: "activity", label: "활동", icon: <Icon name="activity" size={13} decorative /> },
            { value: "trades", label: "거래내역", icon: <Icon name="list" size={13} decorative /> },
          ]}
        />
      </div>

      {innerTab === "settings" && (<>
      {/* ── 섹션 1: 판단 주기와 신뢰도 ──────────────────────── */}
      <SettingsSection
        title="판단 기준"
        desc="얼마나 자주 사고팔지 결정할지, 얼마나 확신이 있어야 거래할지 정합니다."
      >
        <FieldRow>
          <FieldCell
            label="판단 주기 (분)"
            hint="몇 분마다 한 번씩 매수/매도 판단을 새로 할지 정합니다. 5로 두면 5분마다 판단해요."
            example="권장: 5~30분"
          >
            <input
              type="number"
              min={1}
              max={240}
              value={settings.intervalMin}
              onChange={(e) => setSettings((prev) => ({ ...prev, intervalMin: Number(e.target.value || 1) }))}
              style={inputStyle}
            />
          </FieldCell>
          <FieldCell
            label="최소 신뢰도 (%)"
            hint="AI가 이 확신도 이상일 때만 주문을 냅니다. 70%면 어지간히 확실한 신호만 거래해요."
            example="권장: 65~80%"
          >
            <input
              type="number"
              min={40}
              max={100}
              value={Math.round(settings.minConfidence * 100)}
              onChange={(e) => setSettings((prev) => ({ ...prev, minConfidence: Math.min(1, Math.max(0.4, Number(e.target.value || 72) / 100)) }))}
              style={inputStyle}
            />
          </FieldCell>
        </FieldRow>
      </SettingsSection>

      {/* ── 섹션 2: 주문 크기 / 비중 한도 ──────────────────── */}
      <SettingsSection
        title="주문 크기"
        desc="한 번에 얼마만큼 거래하고, 한 종목에 자산을 어디까지 투입할지 정합니다."
      >
        <FieldRow>
          <FieldCell
            label="주문 수량 (주)"
            hint="한 번 매수 또는 매도할 때 거래할 주식 수입니다."
            example="예: 10주"
          >
            <input
              type="number"
              min={1}
              max={100000}
              value={settings.orderQty}
              onChange={(e) => setSettings((prev) => ({ ...prev, orderQty: Number(e.target.value || 1) }))}
              style={inputStyle}
            />
          </FieldCell>
          <FieldCell
            label="최대 비중 (%)"
            hint="이 종목이 전체 자산에서 차지할 수 있는 최대 비율. 25%면 한 종목에 자산의 1/4 이상 투입하지 않아요."
            example="권장: 20~30%"
          >
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxPositionPct}
              onChange={(e) => setSettings((prev) => ({ ...prev, maxPositionPct: Number(e.target.value || 25) }))}
              style={inputStyle}
            />
          </FieldCell>
        </FieldRow>
      </SettingsSection>

      {/* ── 섹션 2.5: 일일 안전 한도 ──────────────────────── */}
      <SettingsSection
        title="일일 안전 한도"
        desc="하루 동안 자동매매가 낼 수 있는 주문 수와 손실 한도를 정합니다. 한도에 닿으면 자동으로 일시중지됩니다. 0 = 제한 없음."
      >
        <FieldRow>
          <FieldCell
            label="일일 최대 주문 수 (건)"
            hint="하루에 자동매매가 낼 수 있는 주문(매수+매도)의 최대 횟수입니다. 너무 자주 주문이 나가는 것을 막아줘요."
            example="권장: 5~20건 / 무제한은 0"
          >
            <input
              type="number"
              min={0}
              max={1000}
              value={settings.dailyMaxOrders}
              onChange={(e) => setSettings((prev) => ({ ...prev, dailyMaxOrders: Number(e.target.value || 0) }))}
              style={inputStyle}
            />
          </FieldCell>
          <FieldCell
            label="일일 최대 손실 (원)"
            hint="당일 실현손익이 이 금액만큼 마이너스가 되면 자동매매가 즉시 일시중지됩니다."
            example="권장: 자산의 1~2% / 무제한은 0"
          >
            <input
              type="number"
              min={0}
              step={10000}
              value={settings.dailyMaxLossKrw}
              onChange={(e) => setSettings((prev) => ({ ...prev, dailyMaxLossKrw: Number(e.target.value || 0) }))}
              style={inputStyle}
            />
          </FieldCell>
        </FieldRow>
      </SettingsSection>

      {/* ── 섹션 3: 거래 비용 (bps) ─────────────────────────── */}
      <SettingsSection
        title="거래 비용"
        desc={
          <>
            거래마다 빠지는 수수료/슬리피지/세금 비율입니다.{" "}
            <strong style={{ color: "var(--text-secondary)" }}>1bp = 0.01%</strong>이며, 100bp가 1% 입니다.
          </>
        }
      >
        <FieldRow>
          <FieldCell
            label="수수료 (bps)"
            hint="증권사에 내는 매매 수수료 비율. 1.5bps = 0.015%. 일반 키움/한투 모의투자 환경 기본값입니다."
            example="권장: 1~3 bps"
          >
            <input
              type="number"
              min={0}
              max={300}
              step={0.1}
              value={settings.feeBps}
              onChange={(e) => setSettings((prev) => ({ ...prev, feeBps: Number(e.target.value || 0) }))}
              style={inputStyle}
            />
          </FieldCell>
          <FieldCell
            label="슬리피지 (bps)"
            hint="원하는 가격과 실제 체결 가격의 차이. 호가 흔들림으로 손해 보는 부분을 미리 가정합니다."
            example="권장: 2~5 bps"
          >
            <input
              type="number"
              min={0}
              max={200}
              value={settings.slippageBps}
              onChange={(e) => setSettings((prev) => ({ ...prev, slippageBps: Number(e.target.value || 0) }))}
              style={inputStyle}
            />
          </FieldCell>
        </FieldRow>
        <FieldRow>
          <FieldCell
            label="매도세 (bps)"
            hint="매도 시 부과되는 거래세 (증권거래세 + 농어촌특별세). 한국 주식 기준 약 18bps(0.18%)입니다."
            example="국내 기본: 18 bps"
          >
            <input
              type="number"
              min={0}
              max={1000}
              value={settings.taxBps}
              onChange={(e) => setSettings((prev) => ({ ...prev, taxBps: Number(e.target.value || 0) }))}
              style={inputStyle}
            />
          </FieldCell>
          <FieldCell label="" hint="" example="" empty />
        </FieldRow>
      </SettingsSection>

      {/* ── 섹션 4: 실행 환경 ─────────────────────────────── */}
      <SettingsSection
        title="실행 환경"
        desc="실제 주문을 낼지 시뮬레이션만 돌릴지, 어떤 시간대에 동작할지 결정합니다."
      >
        <FieldRow>
          <FieldCell
            label="실행 방식"
            hint="모의: 실제 주문 없이 가상 체결만 기록 · 실전: KIS 연동으로 실제 주문 발송"
            example=""
          >
            <button
              onClick={() => setSettings((prev) => ({ ...prev, paperTrade: !prev.paperTrade }))}
              style={{
                borderRadius: "var(--radius-md)",
                border: settings.paperTrade ? "1px solid var(--warning-border)" : "1px solid var(--error-border)",
                background: settings.paperTrade ? "var(--warning-subtle)" : "var(--error-subtle)",
                color: settings.paperTrade ? "var(--warning)" : "var(--error)",
                padding: "9px 10px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {settings.paperTrade ? "모의 매매" : "실전 매매"}
            </button>
          </FieldCell>
          <FieldCell
            label="감독 강도"
            hint="엄격: 위험 신호가 조금만 보여도 차단 · 균형: 기본 권장 · 공격: 가능한 많이 거래"
            example=""
          >
            <select
              value={settings.supervisionLevel}
              onChange={(e) => setSettings((prev) => ({ ...prev, supervisionLevel: e.target.value as SupervisionLevel }))}
              style={inputStyle}
            >
              <option value="strict">엄격 (고위험 차단)</option>
              <option value="balanced">균형 (기본 권장)</option>
              <option value="aggressive">공격 (완화)</option>
            </select>
          </FieldCell>
        </FieldRow>
        <FieldRow>
          <FieldCell
            label="거래 시간대"
            hint="정규장 전용: 09:00~15:30만 거래 · 정규+시간외: 시간외 단일가도 시도(모의 우선)"
            example=""
          >
            <select
              value={settings.executionSessionMode}
              onChange={(e) => setSettings((prev) => ({ ...prev, executionSessionMode: e.target.value as ExecutionSessionMode }))}
              style={inputStyle}
            >
              <option value="regular_only">정규장 전용</option>
              <option value="regular_and_after_hours">정규 + 시간외</option>
            </select>
          </FieldCell>
          <FieldCell
            label="모의 초기 자본 (원)"
            hint="모의 매매로 돌릴 때의 시작 자본금. 실전 매매에는 영향이 없습니다."
            example="예: 10,000,000원"
          >
            <input
              type="number"
              min={10000}
              max={100000000000}
              value={settings.initialCash}
              onChange={(e) => setSettings((prev) => ({ ...prev, initialCash: Number(e.target.value || 10000000) }))}
              style={inputStyle}
            />
          </FieldCell>
        </FieldRow>
      </SettingsSection>

      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, marginBottom: 10, lineHeight: 1.6 }}>
        루프 동작: 서버에서 {settings.intervalMin}분마다 분석 → 감독 규칙/신뢰도 체크 → 주문 또는 보류 → 로그/계좌 업데이트를 반복합니다.
      </p>
      </>)}

      {innerTab === "activity" && (<>
      {paperAccount && (
        <div
          style={{
            marginBottom: 10,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>모의 계좌 상태</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>현금: {Math.round(paperAccount.cash).toLocaleString("ko-KR")}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>보유: {paperAccount.shares.toFixed(2)}주</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>평가: {Math.round(paperAccount.total_equity).toLocaleString("ko-KR")}</p>
            <p style={{ fontSize: 10, color: paperAccount.realized_pnl >= 0 ? "var(--success)" : "var(--error)" }}>
              실현손익: {Math.round(paperAccount.realized_pnl).toLocaleString("ko-KR")}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>비중: {paperAccount.position_pct.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {statusInfo && (
        <div
          style={{
            marginBottom: 10,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>루프 집계</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>사이클: {statusInfo.cycle_count}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>모의: {statusInfo.simulated_trades}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>실전: {statusInfo.executed_trades}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>실패: {statusInfo.failed_trades}</p>
            <p style={{ fontSize: 10, color: "var(--text-secondary)" }}>보류: {statusInfo.skipped_cycles}</p>
          </div>
        </div>
      )}

      {showVisuals && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              padding: "8px 8px 4px",
              minHeight: 148,
            }}
          >
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>자동 판단 추이</p>
            <div style={{ height: 118 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={decisionHistory} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 8, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="conf" domain={[0, 100]} tick={{ fontSize: 8, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={30} />
                  <YAxis yAxisId="act" orientation="right" domain={[-1.2, 1.2]} hide />
                  <Tooltip />
                  <Line yAxisId="conf" dataKey="confidence" stroke="var(--brand)" strokeWidth={2} dot={false} name="신뢰도(%)" />
                  <Line yAxisId="act" dataKey="actionScore" stroke="var(--warning)" strokeWidth={1.5} dot={false} name="행동점수" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "8px 10px",
        }}
      >
        <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>자동 루프 로그</p>
        <div style={{ maxHeight: 126, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {mergedLogs.length === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>아직 로그가 없습니다.</p>}
          {mergedLogs.slice(-24).reverse().map((log, idx) => (
            <div key={`${log.timestamp}-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <LevelDot level={log.level} />
              <p style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                [{log.timestamp}] {log.message}
              </p>
            </div>
          ))}
        </div>
      </div>
      </>)}

      {innerTab === "trades" && (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "10px 12px",
            minHeight: 200,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 700 }}>최근 자동 주문</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 360 }}>
            {tradeHistory.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                아직 자동 주문 이력이 없어요. 자동 실행을 켜면 여기에 누적됩니다.
              </p>
            )}
            {tradeHistory.map((t, i) => (
              <div key={`${t.timestamp}-${i}`} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "6px 8px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{t.timestamp.slice(11, 19)}</span>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  <strong style={{ color: t.side === "buy" ? "var(--bull)" : "var(--bear)" }}>{t.side === "buy" ? "매수" : "매도"}</strong>{" "}
                  {t.qty}주 · {t.status === "simulated" ? "모의" : t.status === "executed" ? "실주문" : "실패"}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {t.price.toLocaleString("ko-KR")}원
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
import { TabPills, Icon } from "@/components/ui";
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

function actionToScore(action: "BUY" | "SELL" | "HOLD"): number {
  if (action === "BUY") return 1;
  if (action === "SELL") return -1;
  return 0;
}

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>자동 분석·주문 루프</p>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
            상태: {statusText}{lastRunAt ? ` · 마지막 실행 ${lastRunAt}` : ""}{nextRunAt ? ` · 다음 실행 ${nextRunAt}` : ""}
          </p>
        </div>

        <button
          onClick={() => {
            void toggleAutoLoop();
          }}
          disabled={busy}
          style={{
            border: settings.enabled ? "1px solid var(--success-border)" : "1px solid var(--border-default)",
            background: settings.enabled ? "var(--success-subtle)" : "var(--bg-overlay)",
            color: settings.enabled ? "var(--success)" : "var(--text-secondary)",
            borderRadius: 99,
            padding: "5px 11px",
            fontSize: 10,
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {settings.enabled ? "자동 실행 ON" : "자동 실행 OFF"}
        </button>
      </div>

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>판단 주기(분)</span>
          <input
            type="number"
            min={1}
            max={240}
            value={settings.intervalMin}
            onChange={(e) => setSettings((prev) => ({ ...prev, intervalMin: Number(e.target.value || 1) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>최소 신뢰도(%)</span>
          <input
            type="number"
            min={40}
            max={100}
            value={Math.round(settings.minConfidence * 100)}
            onChange={(e) => setSettings((prev) => ({ ...prev, minConfidence: Math.min(1, Math.max(0.4, Number(e.target.value || 72) / 100)) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>주문 수량(주)</span>
          <input
            type="number"
            min={1}
            max={100000}
            value={settings.orderQty}
            onChange={(e) => setSettings((prev) => ({ ...prev, orderQty: Number(e.target.value || 1) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>수수료(bps)</span>
          <input
            type="number"
            min={0}
            max={300}
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
            max={200}
            value={settings.slippageBps}
            onChange={(e) => setSettings((prev) => ({ ...prev, slippageBps: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>매도세(bps)</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={settings.taxBps}
            onChange={(e) => setSettings((prev) => ({ ...prev, taxBps: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>최대 비중(%)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.maxPositionPct}
            onChange={(e) => setSettings((prev) => ({ ...prev, maxPositionPct: Number(e.target.value || 25) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>슈퍼바이즈</span>
          <select
            value={settings.supervisionLevel}
            onChange={(e) => setSettings((prev) => ({ ...prev, supervisionLevel: e.target.value as SupervisionLevel }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          >
            <option value="strict">엄격(고위험 차단)</option>
            <option value="balanced">균형(기본)</option>
            <option value="aggressive">공격(완화)</option>
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
            <option value="regular_and_after_hours">정규+시간외(모의 우선)</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>모의 초기자본</span>
          <input
            type="number"
            min={10000}
            max={100000000000}
            value={settings.initialCash}
            onChange={(e) => setSettings((prev) => ({ ...prev, initialCash: Number(e.target.value || 10000000) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>실행 방식</span>
          <button
            onClick={() => setSettings((prev) => ({ ...prev, paperTrade: !prev.paperTrade }))}
            style={{
              borderRadius: "var(--radius-md)",
              border: settings.paperTrade ? "1px solid var(--warning-border)" : "1px solid var(--error-border)",
              background: settings.paperTrade ? "var(--warning-subtle)" : "var(--error-subtle)",
              color: settings.paperTrade ? "var(--warning)" : "var(--error)",
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {settings.paperTrade ? "모의" : "실전"}
          </button>
        </label>
      </div>

      <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: 1.5 }}>
        루프: 서버에서 분석 → 감독 규칙/신뢰도 체크 → 부분 매수/매도 주문 → 로그/이력/계좌 상태 업데이트를 반복합니다.
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

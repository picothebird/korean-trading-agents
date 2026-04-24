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
import { getKisPrice, getKisStatus, placeKisOrder, startAnalysis, streamAnalysis } from "@/lib/api";
import type { TradeDecision } from "@/types";

interface AutoLoopPanelProps {
  ticker: string;
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

export function AutoLoopPanel({ ticker, onDecision, onTradeRecorded }: AutoLoopPanelProps) {
  const [settings, setSettings] = useState<AutoLoopSettings>({
    enabled: false,
    intervalMin: 15,
    minConfidence: 0.72,
    orderQty: 1,
    paperTrade: true,
    feeBps: 28,
  });
  const [runningCycle, setRunningCycle] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<LoopLog[]>([]);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryPoint[]>([]);
  const [tradeHistory, setTradeHistory] = useState<AutoTradeRecord[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleRunningRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AutoLoopSettings>;
      setSettings((prev) => ({
        ...prev,
        ...parsed,
        enabled: false, // 안전을 위해 새로고침 시 자동실행은 강제 해제
      }));
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

  const appendLog = useCallback((level: LoopLog["level"], message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { timestamp, level, message }].slice(-120));
  }, []);

  const addTrade = useCallback(
    (trade: AutoTradeRecord) => {
      setTradeHistory((prev) => [trade, ...prev].slice(0, 80));
      onTradeRecorded?.(trade);
    },
    [onTradeRecorded]
  );

  const runAnalysisSession = useCallback(async (): Promise<TradeDecision> => {
    const { session_id } = await startAnalysis(ticker);

    return await new Promise<TradeDecision>((resolve, reject) => {
      let settled = false;
      let finalDecision: TradeDecision | null = null;
      let stop = () => {};

      stop = streamAnalysis(
        session_id,
        () => {
          // 자동 루프는 내부 패널 로그를 기준으로 모니터링
        },
        (decision) => {
          finalDecision = decision;
          onDecision?.(decision);
        },
        () => {
          if (settled) return;
          settled = true;
          stop();
          if (finalDecision) resolve(finalDecision);
          else reject(new Error("분석 결과가 없습니다."));
        },
        (msg) => {
          if (settled) return;
          settled = true;
          stop();
          reject(new Error(msg));
        }
      );
    });
  }, [ticker, onDecision]);

  const executeCycle = useCallback(async () => {
    if (cycleRunningRef.current) {
      appendLog("warn", "이전 사이클이 아직 진행 중이라 이번 사이클은 건너뜁니다.");
      return;
    }

    cycleRunningRef.current = true;
    setRunningCycle(true);

    try {
      appendLog("info", `자동 사이클 시작 · 종목 ${ticker}`);
      const decision = await runAnalysisSession();

      setDecisionHistory((prev) => {
        const timeLabel = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        const next: DecisionHistoryPoint = {
          timestamp: timeLabel,
          confidence: Math.round(decision.confidence * 1000) / 10,
          actionScore: actionToScore(decision.action),
          action: decision.action,
        };
        return [...prev, next].slice(-60);
      });

      appendLog("success", `분석 완료 · ${decision.action} · 신뢰도 ${(decision.confidence * 100).toFixed(1)}%`);

      if (decision.action === "HOLD") {
        appendLog("info", "HOLD 판단으로 주문 없이 다음 사이클을 대기합니다.");
        return;
      }

      if (decision.confidence < settings.minConfidence) {
        appendLog(
          "warn",
          `신뢰도 미달로 주문 보류 · ${(decision.confidence * 100).toFixed(1)}% < ${(settings.minConfidence * 100).toFixed(1)}%`
        );
        return;
      }

      const side: "buy" | "sell" = decision.action === "BUY" ? "buy" : "sell";
      const qty = Math.max(1, Math.floor(settings.orderQty));
      let marketPrice = 0;

      try {
        const p = await getKisPrice(ticker);
        marketPrice = p.current_price;
      } catch {
        appendLog("warn", "현재가 조회 실패로 가격 0으로 기록됩니다.");
      }

      if (settings.paperTrade) {
        const feeFactor = side === "buy" ? 1 + settings.feeBps / 10000 : 1 - settings.feeBps / 10000;
        const simulatedPrice = marketPrice > 0 ? Math.round(marketPrice * feeFactor) : 0;
        const rec: AutoTradeRecord = {
          timestamp: new Date().toISOString(),
          ticker,
          side,
          qty,
          price: simulatedPrice,
          status: "simulated",
          confidence: decision.confidence,
          reason: `모의 주문 · 수수료 ${settings.feeBps}bps 반영`,
        };
        addTrade(rec);
        appendLog("success", `모의 ${side === "buy" ? "매수" : "매도"} ${qty}주 실행 (예상가 ${simulatedPrice.toLocaleString("ko-KR")})`);
        return;
      }

      const kis = await getKisStatus();
      if (!kis.connected) {
        const rec: AutoTradeRecord = {
          timestamp: new Date().toISOString(),
          ticker,
          side,
          qty,
          price: marketPrice,
          status: "failed",
          confidence: decision.confidence,
          reason: "KIS 연결 안 됨",
        };
        addTrade(rec);
        appendLog("error", "실주문 실패 · KIS 연결 상태를 확인하세요.");
        return;
      }

      await placeKisOrder({
        ticker,
        side,
        qty,
        order_type: "01",
        price: 0,
      });

      const rec: AutoTradeRecord = {
        timestamp: new Date().toISOString(),
        ticker,
        side,
        qty,
        price: marketPrice,
        status: "executed",
        confidence: decision.confidence,
        reason: "시장가 자동 주문",
      };
      addTrade(rec);
      appendLog("success", `실주문 ${side === "buy" ? "매수" : "매도"} 체결 요청 완료 · ${qty}주`);
    } catch (e: unknown) {
      appendLog("error", e instanceof Error ? e.message : "자동 루프 실행 중 오류가 발생했습니다.");
    } finally {
      cycleRunningRef.current = false;
      setRunningCycle(false);
      const runLabel = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastRunAt(runLabel);
    }
  }, [appendLog, addTrade, runAnalysisSession, settings, ticker]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!settings.enabled) return;

    void executeCycle();
    const ms = Math.max(1, Math.floor(settings.intervalMin)) * 60 * 1000;
    timerRef.current = setInterval(() => {
      void executeCycle();
    }, ms);

    appendLog("info", `자동 루프 시작 · ${Math.max(1, Math.floor(settings.intervalMin))}분 간격`);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [settings.enabled, settings.intervalMin, executeCycle, appendLog]);

  const statusText = useMemo(() => {
    if (runningCycle) return "사이클 실행 중";
    if (settings.enabled) return "대기 중";
    return "중지";
  }, [runningCycle, settings.enabled]);

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
            상태: {statusText}{lastRunAt ? ` · 마지막 실행 ${lastRunAt}` : ""}
          </p>
        </div>

        <button
          onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
          style={{
            border: "1px solid var(--border-default)",
            background: settings.enabled ? "rgba(47,202,115,0.15)" : "var(--bg-elevated)",
            color: settings.enabled ? "var(--success)" : "var(--text-secondary)",
            borderRadius: 99,
            padding: "5px 11px",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {settings.enabled ? "자동 실행 ON" : "자동 실행 OFF"}
        </button>
      </div>

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
            value={settings.feeBps}
            onChange={(e) => setSettings((prev) => ({ ...prev, feeBps: Number(e.target.value || 0) }))}
            style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-input)", color: "var(--text-primary)", padding: "6px 8px", fontSize: 11 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>실행 방식</span>
          <button
            onClick={() => setSettings((prev) => ({ ...prev, paperTrade: !prev.paperTrade }))}
            style={{
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              background: settings.paperTrade ? "rgba(245,166,35,0.12)" : "rgba(240,68,82,0.14)",
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
        루프: 분석 → 신뢰도 판단 → 주문(모의/실전) → 로그/이력 업데이트를 주기적으로 반복합니다.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
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
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 8, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="conf" domain={[0, 100]} tick={{ fontSize: 8, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={30} />
                <YAxis yAxisId="act" orientation="right" domain={[-1.2, 1.2]} hide />
                <Tooltip />
                <Line yAxisId="conf" dataKey="confidence" stroke="#3182F6" strokeWidth={2} dot={false} name="신뢰도(%)" />
                <Line yAxisId="act" dataKey="actionScore" stroke="#F5A623" strokeWidth={1.5} dot={false} name="행동점수" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 10px",
            minHeight: 148,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>최근 자동 주문</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, overflowY: "auto", maxHeight: 112 }}>
            {tradeHistory.length === 0 && (
              <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                아직 자동 주문 이력이 없습니다.
              </p>
            )}
            {tradeHistory.slice(0, 6).map((t, i) => (
              <div key={`${t.timestamp}-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
                <p style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {t.side === "buy" ? "매수" : "매도"} {t.qty}주 · {t.status === "simulated" ? "모의" : t.status === "executed" ? "실주문" : "실패"}
                </p>
                <p style={{ fontSize: 10, color: t.side === "buy" ? "var(--success)" : "var(--error)", fontWeight: 700 }}>
                  {t.price.toLocaleString("ko-KR")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

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
          {logs.length === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>아직 로그가 없습니다.</p>}
          {logs.slice(-24).reverse().map((log, idx) => (
            <div key={`${log.timestamp}-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <LevelDot level={log.level} />
              <p style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                [{log.timestamp}] {log.message}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

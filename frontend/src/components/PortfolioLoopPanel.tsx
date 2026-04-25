"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPortfolioLoopStatus,
  scanPortfolioLoop,
  startPortfolioLoop,
  stopPortfolioLoop,
} from "@/lib/api";
import { TabPills, Icon, SettingsSection, FieldRow, FieldCell, fieldInputStyle as inputStyle } from "@/components/ui";
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
  type InnerTab = "settings" | "activity" | "trades";
  const [innerTab, setInnerTab] = useState<InnerTab>("settings");

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
      {/* 역할 안내 배너 — 단일종목 자동매매와의 차이 명시 (PF1) */}
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
          🧭 포트폴리오 루프란?
        </p>
        후보 종목군(Universe)을 주기적으로 스캔해서 <b>여러 종목 사이에서 사고팔 후보를 발굴</b>하고, 비중·상관관계·세션을 함께 관리합니다.
        단일 종목을 정해놓고 매수/매도하는 “자동매매 루프”와 달리, <b>“무엇을 살 것인가”부터 자동화</b>한다는 점이 핵심입니다.
      </div>

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
              border: settings.enabled ? "1px solid var(--success-border)" : "1px solid var(--border-default)",
              background: settings.enabled ? "var(--success-subtle)" : "var(--bg-elevated)",
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

      {/* Internal tab pills — settings / activity / trades */}
      <div style={{ marginBottom: 12 }}>
        <TabPills<InnerTab>
          ariaLabel="포트폴리오 루프 내부 탭"
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
      <SettingsSection
        title="簍키 기본"
        desc="이 루프를 부른는 이름과, 처음부터 관심 있는 종목을 적어두면 됩니다."
      >
        <FieldRow>
          <FieldCell label="루프 이름" hint="대시보드에서 구별하기 위한 포트폴리오 이름입니다." example="예: 대형주 안정형">
            <input type="text" value={settings.name} onChange={(e) => setSettings((prev) => ({ ...prev, name: e.target.value }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="모니터링 스타일" hint="시장 분위기에 따라 다르게 봐야 할 일이 달라집니다. 균형형은 무난하고, 모멘텀은 상승세 추종, 방어형은 하락 대비에 무게를 둡니다." example="종목 선정/판단 기준에 영향">
            <select value={settings.monitoringProfile} onChange={(e) => setSettings((prev) => ({ ...prev, monitoringProfile: e.target.value as MonitoringProfile }))} style={inputStyle}>
              <option value="balanced">균형형</option>
              <option value="momentum">모멘텀형</option>
              <option value="defensive">방어형</option>
            </select>
          </FieldCell>
          <FieldCell label="시드 종목" full hint="처음부터 관심 종목으로 지정하고 싶은 보유/후보입니다. 콤마나 공백으로 구분하세요." example="예: 005930, 000660 (종목코드 6자리)">
            <input type="text" value={settings.seedTickersText} onChange={(e) => setSettings((prev) => ({ ...prev, seedTickersText: e.target.value }))} placeholder="005930,000660" style={inputStyle} />
            {/* 추천 시작 세트 (PF1) */}
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {[
                { name: "코스피 대형주 5종", tickers: "005930,000660,373220,207940,005380" },
                { name: "고배당 5종", tickers: "055550,105560,086790,316140,138930" },
                { name: "성장주 5종", tickers: "035420,035720,323410,377300,041510" },
              ].map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, seedTickersText: preset.tickers }))}
                  title={preset.tickers}
                  style={{
                    padding: "4px 10px", borderRadius: 99,
                    border: "1px solid var(--brand-border)",
                    background: "var(--brand-subtle)", color: "var(--brand-active)",
                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  ✨ {preset.name}
                </button>
              ))}
            </div>
          </FieldCell>
        </FieldRow>
      </SettingsSection>

      <SettingsSection
        title="종목 풀 (유니버스)"
        desc="AI가 매일 검색하는 후보 종목의 범위입니다. 선호/제외 종목을 넣으면 그 만큼 우선/제외됩니다."
      >
        <FieldRow>
          <FieldCell label="선호 종목" full hint="AI가 가점을 두고 고려하는 종목입니다." example="예: 005930,000660">
            <input type="text" value={settings.preferredTickersText} onChange={(e) => setSettings((prev) => ({ ...prev, preferredTickersText: e.target.value }))} placeholder="005930,000660" style={inputStyle} />
          </FieldCell>
          <FieldCell label="제외 종목" full hint="절대 매수하지 않을 종목입니다." example="예: 042660,005490">
            <input type="text" value={settings.excludedTickersText} onChange={(e) => setSettings((prev) => ({ ...prev, excludedTickersText: e.target.value }))} placeholder="042660,005490" style={inputStyle} />
          </FieldCell>
          <FieldCell label="관심 키워드" full hint="뉴스/테마를 통해 우선 노출할 키워드입니다." example="예: 반도체,AI,배당">
            <input type="text" value={settings.interestKeywordsText} onChange={(e) => setSettings((prev) => ({ ...prev, interestKeywordsText: e.target.value }))} placeholder="반도체,AI,배당" style={inputStyle} />
          </FieldCell>
          <FieldCell label="시장 구분" hint="코스피만 혹은 코스닥만 볼지, 아니면 전체에서 찾을지 선택합니다." example="관리 종목은 자동 제외됩니다">
            <select value={settings.universeMarket} onChange={(e) => setSettings((prev) => ({ ...prev, universeMarket: e.target.value as UniverseMarket }))} style={inputStyle}>
              <option value="ALL">전체</option>
              <option value="KOSPI">KOSPI</option>
              <option value="KOSDAQ">KOSDAQ</option>
            </select>
          </FieldCell>
          <FieldCell label="유니버스 크기" hint="하루에 검색할 종목 수입니다. 클수록 기회는 많아지지만 분석 리소스도 더 쓰입니다." example="권장: 30~80개">
            <input type="number" min={10} max={200} value={settings.universeLimit} onChange={(e) => setSettings((prev) => ({ ...prev, universeLimit: Number(e.target.value || 10) }))} style={inputStyle} />
          </FieldCell>
        </FieldRow>
      </SettingsSection>

      <SettingsSection
        title="판단 사이클"
        desc="얼마나 자주 돌며 분석/주문을 낼지, 한번에 몇 종목을 볼지를 정합니다."
      >
        <FieldRow>
          <FieldCell label="판단 주기 (분)" hint="몇 분마다 한 번씩 돌아갈지 정합니다. 트레이딩 시간이 아니면 자동으로 쉬어요." example="권장: 5·30분">
            <input type="number" min={1} max={1440} value={settings.cycleIntervalMin} onChange={(e) => setSettings((prev) => ({ ...prev, cycleIntervalMin: Number(e.target.value || 1) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="후보 수" hint="한 사이클에서 다음 스텍으로 넘길 상위 종목 개수입니다." example="권장: 5~10개">
            <input type="number" min={1} max={30} value={settings.candidateCount} onChange={(e) => setSettings((prev) => ({ ...prev, candidateCount: Number(e.target.value || 1) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="병렬 분석 수" hint="동시에 몇 종목을 LLM으로 분석할지입니다. 높이면 빠르지만 API 비용/한도가 높아집니다." example="권장: 2~4개">
            <input type="number" min={1} max={8} value={settings.maxParallelAnalyses} onChange={(e) => setSettings((prev) => ({ ...prev, maxParallelAnalyses: Number(e.target.value || 1) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="최소 신뢰도 (%)" hint="AI가 이 확신도 이상일 때만 주문을 냅니다. 70%면 꿨 확신한 신호만 거래해요." example="권장: 0.65~0.80 (65~80%)">
            <input type="number" min={0} max={1} step={0.01} value={settings.minConfidence} onChange={(e) => setSettings((prev) => ({ ...prev, minConfidence: Number(e.target.value || 0) }))} style={inputStyle} />
          </FieldCell>
        </FieldRow>
      </SettingsSection>

      <SettingsSection
        title="리스크 / 비중 관리"
        desc="한 포트폴리오에 보유할 종목 수와 종목당 최대 투입 비중을 제한해 한둘으로 쇏리는 것을 막아줍니다."
      >
        <FieldRow>
          <FieldCell label="최대 보유 종목 수" hint="동시에 보유할 수 있는 종목의 최대 개수입니다." example="권장: 5~10개">
            <input type="number" min={1} max={20} value={settings.maxPositions} onChange={(e) => setSettings((prev) => ({ ...prev, maxPositions: Number(e.target.value || 1) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="종목당 최대 비중 (%)" hint="하나의 종목에 전체 자산 중 최대 몇 %까지 넣을지입니다. 25%는 전체의 1/4입니다." example="권장: 15~30%">
            <input type="number" min={1} max={100} value={settings.maxSinglePositionPct} onChange={(e) => setSettings((prev) => ({ ...prev, maxSinglePositionPct: Number(e.target.value || 1) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="리밸런싱 임계치 (%)" hint="목표 비중과 현재 비중의 차이가 이 값을 넘으면 리밸런싱 주문을 냅니다." example="권장: 1~3%">
            <input type="number" min={0} max={20} step={0.1} value={settings.rebalanceThresholdPct} onChange={(e) => setSettings((prev) => ({ ...prev, rebalanceThresholdPct: Number(e.target.value || 0) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="" empty />
        </FieldRow>
      </SettingsSection>

      <SettingsSection
        title="거래 비용"
        desc={<>시뮬레이션과 실제 손익을 계산할 때 쓰이는 수수료/세금입니다. <strong>1bp = 0.01%</strong>이며 100bp가 1%입니다.</>}
      >
        <FieldRow>
          <FieldCell label="수수료 (bps)" hint="증권사 매수/매도 수수료입니다. 1bp = 0.01%, 10bp = 0.1%." example="권장: 1.5~3 bps">
            <input type="number" min={0} max={500} step={0.1} value={settings.feeBps} onChange={(e) => setSettings((prev) => ({ ...prev, feeBps: Number(e.target.value || 0) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="슬리피지 (bps)" hint="주문 가격과 실제 체결 가격의 차이입니다. 거래량이 적을수록 커지는 경향이 있어요." example="권장: 2~5 bps">
            <input type="number" min={0} max={500} value={settings.slippageBps} onChange={(e) => setSettings((prev) => ({ ...prev, slippageBps: Number(e.target.value || 0) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="거래세 (bps)" hint="매도할 때만 부과되는 세금입니다 (매수 시에는 0)." example="국내 기본: 18 bps (0.18%)">
            <input type="number" min={0} max={1000} value={settings.taxBps} onChange={(e) => setSettings((prev) => ({ ...prev, taxBps: Number(e.target.value || 0) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="" empty />
        </FieldRow>
      </SettingsSection>

      <SettingsSection
        title="실행 환경"
        desc="실제 주문을 낼지 모의로 돌릴지, 다룰 시간대와 시작 자본을 설정합니다."
      >
        <FieldRow>
          <FieldCell label="동작 모드" hint="실전은 실제 KIS계좌로 주문을 냅니다. 모의는 실제 돈 이동 없이 계산만 해요." example="이제 익힌 뒤 실전 전환 추천">
            <button type="button" onClick={() => setSettings((prev) => ({ ...prev, paperTrade: !prev.paperTrade }))} style={{ ...inputStyle, cursor: "pointer", textAlign: "left", fontWeight: 600, color: settings.paperTrade ? "var(--text-primary)" : "var(--bull)", borderColor: settings.paperTrade ? "var(--border-default)" : "var(--bull)" }}>
              {settings.paperTrade ? "모의 거래" : "실전 거래"}
            </button>
          </FieldCell>
          <FieldCell label="거래 시간대" hint="정규장(09:00~15:30)만 돌릴지, 시간외까지 포함할지 선택합니다." example="처음에는 정규장 전용 추천">
            <select value={settings.executionSessionMode} onChange={(e) => setSettings((prev) => ({ ...prev, executionSessionMode: e.target.value as ExecutionSessionMode }))} style={inputStyle}>
              <option value="regular_only">정규장 전용</option>
              <option value="regular_and_after_hours">정규+시간외</option>
            </select>
          </FieldCell>
          <FieldCell label="모의 초기 자본 (원)" hint="모의 거래 모드에서 시작할 현금 금액입니다." example="예: 10,000,000원 = 천만원">
            <input type="number" min={10000} value={settings.initialCash} onChange={(e) => setSettings((prev) => ({ ...prev, initialCash: Number(e.target.value || 10000) }))} style={inputStyle} />
          </FieldCell>
          <FieldCell label="시장 스캔" hint="켜면 종목 풀을 자동으로 쇄신/확장합니다. 끄면 시드 종목만 보게 돼요." example="처음에는 켜둘 것을 추천">
            <button type="button" onClick={() => setSettings((prev) => ({ ...prev, marketScanEnabled: !prev.marketScanEnabled }))} style={{ ...inputStyle, cursor: "pointer", textAlign: "left", fontWeight: 600 }}>
              {settings.marketScanEnabled ? "스캔 사용 ON" : "스캔 사용 OFF"}
            </button>
          </FieldCell>
        </FieldRow>
      </SettingsSection>
      </>)}

      {innerTab === "activity" && (<>
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
      </>)}

      {innerTab === "trades" && (
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
          {/* 분산/집중 경고 (P4.25) */}
          {(() => {
            const positions = statusData?.account.positions ?? [];
            if (positions.length === 0) return null;
            const top = [...positions].sort((a, b) => b.weight_pct - a.weight_pct)[0];
            const warnings: string[] = [];
            if (top && top.weight_pct >= 30) {
              warnings.push(`⚠️ ${top.ticker} 비중이 ${top.weight_pct.toFixed(1)}% — 한 종목 집중도가 높습니다`);
            }
            if (positions.length === 1) {
              warnings.push("⚠️ 단일 종목만 보유 — 분산이 부족합니다");
            } else if (positions.length === 2 && top && top.weight_pct >= 60) {
              warnings.push("⚠️ 2종목 중 한쪽으로 크게 쏠려 있습니다");
            }
            if (warnings.length === 0) return null;
            return (
              <div style={{
                background: "var(--warning-subtle, var(--bg-surface))",
                border: "1px solid var(--warning-border, var(--border-subtle))",
                borderRadius: "var(--radius-md)",
                padding: "6px 8px", marginBottom: 6,
              }}>
                {warnings.map((w, i) => (
                  <p key={i} style={{ fontSize: 9, color: "var(--warning, var(--text-secondary))", lineHeight: 1.4 }}>{w}</p>
                ))}
              </div>
            );
          })()}
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
      )}

      {innerTab === "activity" && (
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
      )}
    </div>
  );
}

// API 클라이언트

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}

export async function getStock(ticker: string) {
  const res = await fetch(`${BASE_URL}/api/stock/${ticker}`);
  if (!res.ok) throw new Error(`종목 조회 실패: ${ticker}`);
  return res.json();
}

export async function getStockChart(
  ticker: string,
  timeframe: "1m" | "3m" | "6m" | "1y" | "2y" = "6m"
): Promise<import("@/types").StockChartResponse> {
  const res = await fetch(`${BASE_URL}/api/stock/${ticker}/chart?timeframe=${timeframe}`);
  if (!res.ok) throw new Error(`차트 조회 실패: ${ticker}`);
  return res.json();
}

export async function startAnalysis(ticker: string, sessionId?: string) {
  const res = await fetch(`${BASE_URL}/api/analyze/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, session_id: sessionId }),
  });
  if (!res.ok) throw new Error("분석 시작 실패");
  return res.json() as Promise<{ session_id: string; status: string }>;
}

export function streamAnalysis(
  sessionId: string,
  onThought: (thought: import("@/types").AgentThought) => void,
  onDecision: (decision: import("@/types").TradeDecision) => void,
  onDone: () => void,
  onError?: (msg: string) => void
) {
  const es = new EventSource(`${BASE_URL}/api/analyze/stream/${sessionId}`);
  let decisionReceived = false;
  let finalized = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    onDone();
    es.close();
  };

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "done") {
        finalize();
      } else if (data.type === "final_decision") {
        decisionReceived = true;
        onDecision(data);
      } else if (data.type === "error") {
        onError?.(data.message ?? "분석 처리 중 오류가 발생했습니다.");
        finalize();
      } else if (data.type === "timeout") {
        if (!decisionReceived) onError?.("분석 시간 초과. 다시 시도하세요.");
        finalize();
      } else if (data.agent_id) {
        onThought(data);
      }
    } catch {
      // 파싱 오류 무시
    }
  };

  es.onerror = () => {
    if (finalized) return;
    onError?.("서버 연결 끊김. 백엔드가 실행 중인지 확인하세요.");
    finalize();
  };

  return () => {
    finalized = true;
    es.close();
  };
}

export async function runBacktest(params: {
  ticker: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  decision_interval_days?: number;
}) {
  const res = await fetch(`${BASE_URL}/api/backtest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("백테스트 실패");
  return res.json() as Promise<import("@/types").BacktestResult>;
}

export async function getMarketIndices() {
  const res = await fetch(`${BASE_URL}/api/market/indices`);
  if (!res.ok) throw new Error("시장 지수 조회 실패");
  return res.json() as Promise<Record<string, import("@/types").MarketIndex>>;
}

export async function searchStocks(q: string): Promise<Array<{ code: string; name: string; market: string }>> {
  if (!q.trim()) return [];
  try {
    const res = await fetch(`${BASE_URL}/api/stock/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getSettings(): Promise<import("@/types").UserSettings> {
  const res = await fetch(`${BASE_URL}/api/settings`);
  if (!res.ok) throw new Error("설정 조회 실패");
  return res.json();
}

export async function updateSettings(data: {
  openai_api_key?: string;
  default_llm_model: string;
  fast_llm_model: string;
  reasoning_effort: "high" | "medium" | "low";
  max_debate_rounds: number;
  guru_enabled: boolean;
  guru_debate_enabled: boolean;
  guru_require_user_confirmation: boolean;
  guru_risk_profile: "defensive" | "balanced" | "aggressive";
  guru_investment_principles: string;
  guru_min_confidence_to_act: number;
  guru_max_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  guru_max_position_pct: number;
  kis_mock: boolean;
  kis_app_key?: string;
  kis_app_secret?: string;
  kis_account_no?: string;
}): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("설정 저장 실패");
}

export async function startAgentBacktest(params: {
  ticker: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  decision_interval_days?: number;
}): Promise<{ session_id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/api/backtest/agent/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("AI 백테스트 시작 실패");
  return res.json();
}

export function streamAgentBacktest(
  sessionId: string,
  onProgress: (event: import("@/types").BacktestProgress) => void,
  onResult: (result: import("@/types").BacktestResult) => void,
  onDone: () => void,
  onError?: (msg: string) => void
): () => void {
  const es = new EventSource(`${BASE_URL}/api/backtest/agent/stream/${sessionId}`);
  let finalized = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    onDone();
    es.close();
  };

  es.onmessage = (event) => {
    try {
      const data: import("@/types").BacktestProgress = JSON.parse(event.data);
      if (data.type === "done") {
        finalize();
      } else if (data.type === "backtest_result" && data.metrics) {
        onResult({
          ticker: data.ticker ?? "",
          period: data.period ?? "",
          metrics: data.metrics,
          trades: data.trades ?? [],
          equity_curve: data.equity_curve ?? [],
          prediction_trace: data.prediction_trace ?? [],
          prediction_monitoring: data.prediction_monitoring,
          summary: data.summary ?? "",
        });
      } else if (data.type === "error") {
        onError?.(data.message ?? "AI 백테스트 처리 중 오류가 발생했습니다.");
        finalize();
      } else {
        onProgress(data);
      }
    } catch {
      // 파싱 오류 무시
    }
  };

  es.onerror = () => {
    if (finalized) return;
    onError?.("AI 백테스트 SSE 연결이 끊어졌습니다. 다시 시도하세요.");
    finalize();
  };

  return () => {
    finalized = true;
    es.close();
  };
}

// ── Server Auto Loop ────────────────────────────────────────────

export async function startAutoLoop(
  req: import("@/types").AutoLoopStartRequest
): Promise<{ loop_id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/api/auto-loop/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "자동 루프 시작 실패" }));
    throw new Error(err.detail ?? "자동 루프 시작 실패");
  }
  return res.json();
}

export async function stopAutoLoop(loopId: string): Promise<{ loop_id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/api/auto-loop/stop/${encodeURIComponent(loopId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "자동 루프 중지 실패" }));
    throw new Error(err.detail ?? "자동 루프 중지 실패");
  }
  return res.json();
}

export async function getAutoLoopStatus(loopId: string): Promise<import("@/types").AutoLoopStatus> {
  const res = await fetch(`${BASE_URL}/api/auto-loop/status/${encodeURIComponent(loopId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "자동 루프 상태 조회 실패" }));
    throw new Error(err.detail ?? "자동 루프 상태 조회 실패");
  }
  return res.json();
}

export async function listAutoLoops(): Promise<{ loops: import("@/types").AutoLoopStatus[] }> {
  const res = await fetch(`${BASE_URL}/api/auto-loop/list`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "자동 루프 목록 조회 실패" }));
    throw new Error(err.detail ?? "자동 루프 목록 조회 실패");
  }
  return res.json();
}

// ── Portfolio Orchestration Loop ───────────────────────────────

export async function startPortfolioLoop(
  req: import("@/types").PortfolioLoopStartRequest
): Promise<{ loop_id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/api/portfolio-loop/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "포트폴리오 루프 시작 실패" }));
    throw new Error(err.detail ?? "포트폴리오 루프 시작 실패");
  }
  return res.json();
}

export async function stopPortfolioLoop(loopId: string): Promise<{ loop_id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/api/portfolio-loop/stop/${encodeURIComponent(loopId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "포트폴리오 루프 중지 실패" }));
    throw new Error(err.detail ?? "포트폴리오 루프 중지 실패");
  }
  return res.json();
}

export async function getPortfolioLoopStatus(loopId: string): Promise<import("@/types").PortfolioLoopStatus> {
  const res = await fetch(`${BASE_URL}/api/portfolio-loop/status/${encodeURIComponent(loopId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "포트폴리오 루프 상태 조회 실패" }));
    throw new Error(err.detail ?? "포트폴리오 루프 상태 조회 실패");
  }
  return res.json();
}

export async function listPortfolioLoops(): Promise<{ loops: import("@/types").PortfolioLoopStatus[] }> {
  const res = await fetch(`${BASE_URL}/api/portfolio-loop/list`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "포트폴리오 루프 목록 조회 실패" }));
    throw new Error(err.detail ?? "포트폴리오 루프 목록 조회 실패");
  }
  return res.json();
}

export async function scanPortfolioLoop(loopId: string): Promise<import("@/types").PortfolioLoopStatus> {
  const res = await fetch(`${BASE_URL}/api/portfolio-loop/scan/${encodeURIComponent(loopId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "포트폴리오 수동 스캔 실패" }));
    throw new Error(err.detail ?? "포트폴리오 수동 스캔 실패");
  }
  return res.json();
}

// ── KIS OpenAPI ─────────────────────────────────────────────────

export async function getKisStatus(): Promise<import("@/types").KisStatus> {
  const res = await fetch(`${BASE_URL}/api/kis/status`);
  if (!res.ok) throw new Error("KIS 상태 조회 실패");
  return res.json();
}

export async function getKisBalance(): Promise<import("@/types").KisBalance> {
  const res = await fetch(`${BASE_URL}/api/kis/balance`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "잔고 조회 실패" }));
    throw new Error(err.detail ?? "잔고 조회 실패");
  }
  return res.json();
}

export async function getKisPrice(ticker: string): Promise<import("@/types").KisPrice> {
  const res = await fetch(`${BASE_URL}/api/kis/price/${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "현재가 조회 실패" }));
    throw new Error(err.detail ?? "현재가 조회 실패");
  }
  return res.json();
}

export async function placeKisOrder(
  req: import("@/types").KisOrderRequest
): Promise<import("@/types").KisOrderResult> {
  const res = await fetch(`${BASE_URL}/api/kis/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "주문 실패" }));
    throw new Error(err.detail ?? "주문 실패");
  }
  return res.json();
}

export async function requestKisOrderApproval(
  req: import("@/types").KisOrderApprovalCreateRequest
): Promise<import("@/types").KisOrderApproval> {
  const res = await fetch(`${BASE_URL}/api/kis/order/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "주문 승인 요청 생성 실패" }));
    throw new Error(err.detail ?? "주문 승인 요청 생성 실패");
  }
  return res.json();
}

export async function getKisOrderApproval(
  approvalId: string
): Promise<import("@/types").KisOrderApproval> {
  const res = await fetch(`${BASE_URL}/api/kis/order/approval/${encodeURIComponent(approvalId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "주문 승인 상태 조회 실패" }));
    throw new Error(err.detail ?? "주문 승인 상태 조회 실패");
  }
  return res.json();
}

export async function approveKisOrderApproval(
  approvalId: string
): Promise<import("@/types").KisOrderApprovalActionResult> {
  const res = await fetch(`${BASE_URL}/api/kis/order/approval/${encodeURIComponent(approvalId)}/approve`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "주문 승인 처리 실패" }));
    throw new Error(err.detail ?? "주문 승인 처리 실패");
  }
  return res.json();
}

export async function rejectKisOrderApproval(
  approvalId: string
): Promise<import("@/types").KisOrderApprovalActionResult> {
  const res = await fetch(`${BASE_URL}/api/kis/order/approval/${encodeURIComponent(approvalId)}/reject`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "주문 거절 처리 실패" }));
    throw new Error(err.detail ?? "주문 거절 처리 실패");
  }
  return res.json();
}

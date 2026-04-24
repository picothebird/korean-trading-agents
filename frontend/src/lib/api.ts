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

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "done") {
        onDone();
        es.close();
      } else if (data.type === "final_decision") {
        decisionReceived = true;
        onDecision(data);
      } else if (data.type === "error") {
        onError?.(data.message ?? "분석 처리 중 오류가 발생했습니다.");
        onDone();
        es.close();
      } else if (data.type === "timeout") {
        if (!decisionReceived) onError?.("분석 시간 초과. 다시 시도하세요.");
        onDone();
        es.close();
      } else if (data.agent_id) {
        onThought(data);
      }
    } catch {
      // 파싱 오류 무시
    }
  };

  es.onerror = () => {
    onError?.("서버 연결 끊김. 백엔드가 실행 중인지 확인하세요.");
    onDone();
    es.close();
  };

  return () => es.close();
}

export async function runBacktest(params: {
  ticker: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
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

  es.onmessage = (event) => {
    try {
      const data: import("@/types").BacktestProgress = JSON.parse(event.data);
      if (data.type === "done") {
        onDone();
        es.close();
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
        onDone();
        es.close();
      } else {
        onProgress(data);
      }
    } catch {
      // 파싱 오류 무시
    }
  };

  es.onerror = () => {
    onDone();
    es.close();
  };

  return () => es.close();
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

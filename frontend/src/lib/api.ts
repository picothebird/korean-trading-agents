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
  onDone: () => void
) {
  const es = new EventSource(`${BASE_URL}/api/analyze/stream/${sessionId}`);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "done") {
        onDone();
        es.close();
      } else if (data.type === "final_decision") {
        onDecision(data);
      } else if (data.type === "timeout") {
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

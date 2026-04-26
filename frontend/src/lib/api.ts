// API client

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const AUTH_TOKEN_KEY = "kta_auth_token_v1";

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function withAuthHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init ?? {});
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = withAuthHeaders(init?.headers);
  return fetch(input, {
    ...init,
    headers,
  });
}

function buildEventSourceUrl(path: string): string {
  const token = getAccessToken();
  if (!token) return `${BASE_URL}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE_URL}${path}${sep}access_token=${encodeURIComponent(token)}`;
}

export async function getHealth() {
  const res = await apiFetch(`${BASE_URL}/health`);
  return res.json();
}

export async function getStock(ticker: string) {
  const res = await apiFetch(`${BASE_URL}/api/stock/${ticker}`);
  if (!res.ok) throw new Error(`Failed to load stock: ${ticker}`);
  return res.json();
}

export async function getStockChart(
  ticker: string,
  timeframe: "1d" | "5d" | "1w" | "2w" | "1m" | "3m" | "6m" | "1y" | "2y" = "6m"
): Promise<import("@/types").StockChartResponse> {
  const res = await apiFetch(`${BASE_URL}/api/stock/${ticker}/chart?timeframe=${timeframe}`);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      const raw = body?.detail ?? body?.message ?? body;
      if (typeof raw === "string") {
        detail = raw;
      } else if (Array.isArray(raw)) {
        // FastAPI validation: [{loc:[...], msg, type}, ...]
        detail = raw
          .map((e: { loc?: unknown[]; msg?: string }) => {
            const loc = Array.isArray(e?.loc) ? e.loc.join(".") : "";
            return `${loc}: ${e?.msg ?? ""}`.replace(/^:\s*/, "");
          })
          .filter(Boolean)
          .join("; ");
      } else if (raw && typeof raw === "object") {
        detail = JSON.stringify(raw);
      }
    } catch {
      // ignore parse error
    }
    const suffix = detail ? ` — ${detail}` : "";
    throw new Error(`차트를 불러오지 못했어요 (${ticker} / ${timeframe}, HTTP ${res.status})${suffix}`);
  }
  return res.json();
}

export async function startAnalysis(ticker: string, sessionId?: string) {
  const res = await apiFetch(`${BASE_URL}/api/analyze/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, session_id: sessionId }),
  });
  if (!res.ok) throw new Error("Failed to start analysis");
  return res.json() as Promise<{ session_id: string; status: string }>;
}

export function streamAnalysis(
  sessionId: string,
  onThought: (thought: import("@/types").AgentThought) => void,
  onDecision: (decision: import("@/types").TradeDecision) => void,
  onDone: () => void,
  onError?: (msg: string) => void
) {
  const es = new EventSource(buildEventSourceUrl(`/api/analyze/stream/${sessionId}`));
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
        if (!decisionReceived) {
          // 방어 로직: SSE final_decision 이벤트를 놓친 경우 세션 결과를 1회 재조회한다.
          void getAnalysisSession(sessionId)
            .then((detail) => {
              const decision = detail?.result?.decision;
              if (decision) {
                decisionReceived = true;
                onDecision(decision);
                return;
              }
              if (detail?.error) {
                onError?.(detail.error);
                return;
              }
              onError?.("분석이 종료됐지만 최종 결정을 확인하지 못했습니다. 잠시 후 분석 이력에서 다시 확인해 주세요.");
            })
            .catch(() => {
              onError?.("분석 종료 후 결과 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            });
        }
        finalize();
      } else if (data.type === "final_decision") {
        decisionReceived = true;
        onDecision(data);
      } else if (data.type === "error") {
        onError?.(data.message ?? "Analysis failed during processing.");
        finalize();
      } else if (data.type === "timeout") {
        if (!decisionReceived) onError?.("Analysis timed out. Please retry.");
        finalize();
      } else if (data.agent_id) {
        onThought(data);
      }
    } catch {
      // Ignore JSON parse errors
    }
  };

  es.onerror = () => {
    if (finalized) return;
    onError?.("SSE connection lost. Check whether backend is running.");
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
  const res = await apiFetch(`${BASE_URL}/api/backtest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Backtest failed");
  return res.json() as Promise<import("@/types").BacktestResult>;
}

export async function getMarketIndices() {
  const res = await apiFetch(`${BASE_URL}/api/market/indices`);
  if (!res.ok) throw new Error("Failed to load market indices");
  return res.json() as Promise<Record<string, import("@/types").MarketIndex>>;
}

export async function searchStocks(q: string): Promise<Array<{ code: string; name: string; market: string }>> {
  if (!q.trim()) return [];
  try {
    const res = await apiFetch(`${BASE_URL}/api/stock/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getSettings(): Promise<import("@/types").UserSettings> {
  const res = await apiFetch(`${BASE_URL}/api/settings`);
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function updateSettings(data: {
  openai_api_key?: string;
  default_llm_model: string;
  fast_llm_model?: string;
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
  const res = await apiFetch(`${BASE_URL}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save settings");
}

export async function startAgentBacktest(params: {
  ticker: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  decision_interval_days?: number;
}): Promise<{ session_id: string; status: string }> {
  const res = await apiFetch(`${BASE_URL}/api/backtest/agent/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Failed to start AI backtest");
  return res.json();
}

export async function cancelAgentBacktest(sessionId: string): Promise<{ session_id: string; status: string }> {
  const res = await apiFetch(`${BASE_URL}/api/backtest/agent/cancel/${sessionId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to cancel AI backtest");
  return res.json();
}

export interface AgentBacktestHistoryItem {
  session_id: string;
  ticker: string;
  status: "running" | "done" | "error" | string;
  created_at: string | null;
  updated_at: string | null;
  error: string | null;
  summary: {
    total_return?: number | null;
    alpha?: number | null;
    sharpe_ratio?: number | null;
    max_drawdown?: number | null;
    win_rate?: number | null;
    total_trades?: number | null;
    start_date?: string | null;
    end_date?: string | null;
  };
}

export async function listAgentBacktestHistory(limit = 20): Promise<AgentBacktestHistoryItem[]> {
  const res = await apiFetch(`${BASE_URL}/api/backtest/agent/history?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.items) ? (data.items as AgentBacktestHistoryItem[]) : [];
}

export async function getAgentBacktestResult(sessionId: string): Promise<import("@/types").BacktestResult | null> {
  const res = await apiFetch(`${BASE_URL}/api/backtest/agent/result/${sessionId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.result as import("@/types").BacktestResult) ?? null;
}

// ── 분석 이력/복원 ────────────────────────────────────────
export interface AnalysisHistoryItem {
  session_id: string;
  ticker: string;
  /** 종목명 — 백엔드가 채워주면 그대로 사용, 없으면 프론트에서 lazy lookup. */
  ticker_name?: string | null;
  status: "running" | "done" | "error" | string;
  created_at: string | null;
  updated_at: string | null;
  error: string | null;
  summary: {
    action?: string | null;
    confidence?: number | null;
    risk_level?: string | null;
  };
}

export async function listAnalysisHistory(limit = 20): Promise<AnalysisHistoryItem[]> {
  const res = await apiFetch(`${BASE_URL}/api/analyze/history?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.items) ? (data.items as AnalysisHistoryItem[]) : [];
}

export interface AnalysisSessionDetail {
  session_id: string;
  ticker: string;
  status: string;
  /** 현행 백엔드는 decision을 top-level에 저장한다. (레거시 result.decision도 존재 가능) */
  decision?: import("@/types").TradeDecision | null;
  result?: { decision?: import("@/types").TradeDecision | null } | null;
  error?: string | null;
}

export async function getAnalysisSession(sessionId: string): Promise<AnalysisSessionDetail | null> {
  const res = await apiFetch(`${BASE_URL}/api/analyze/result/${sessionId}`);
  if (!res.ok) return null;
  return (await res.json()) as AnalysisSessionDetail;
}

/**
 * MS-C: 사용자가 분석 세션의 특정 에이전트(또는 발화)에게 후속 질문을 보낸다.
 * 백엔드는 비동기로 추가 thought를 SSE 스트림에 emit한다.
 *
 * docs/AGENT_OFFICE_GATHER_LEVEL_UP.md §0-sexies.1 (C-3, C-6)
 */
export async function askAgent(
  sessionId: string,
  payload: { role: string; question: string; thought_timestamp?: string | null },
): Promise<{ accepted: boolean; message?: string }> {
  const res = await apiFetch(`${BASE_URL}/api/analysis/${encodeURIComponent(sessionId)}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `질문 전송 실패 (${res.status})`);
  }
  return (await res.json()) as { accepted: boolean; message?: string };
}

export function streamAgentBacktest(
  sessionId: string,
  onProgress: (event: import("@/types").BacktestProgress) => void,
  onResult: (result: import("@/types").BacktestResult) => void,
  onDone: () => void,
  onError?: (msg: string) => void
): () => void {
  const es = new EventSource(buildEventSourceUrl(`/api/backtest/agent/stream/${sessionId}`));
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
        onError?.(data.message ?? "AI backtest failed during processing.");
        finalize();
      } else {
        onProgress(data);
      }
    } catch {
      // Ignore JSON parse errors
    }
  };

  es.onerror = () => {
    if (finalized) return;
    onError?.("AI backtest SSE connection lost. Please retry.");
    finalize();
  };

  return () => {
    finalized = true;
    es.close();
  };
}

// Server Auto Loop

export async function startAutoLoop(
  req: import("@/types").AutoLoopStartRequest
): Promise<{ loop_id: string; status: string }> {
  const res = await apiFetch(`${BASE_URL}/api/auto-loop/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to start auto loop" }));
    throw new Error(err.detail ?? "Failed to start auto loop");
  }
  return res.json();
}

export async function stopAutoLoop(loopId: string): Promise<{ loop_id: string; status: string }> {
  const res = await apiFetch(`${BASE_URL}/api/auto-loop/stop/${encodeURIComponent(loopId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to stop auto loop" }));
    throw new Error(err.detail ?? "Failed to stop auto loop");
  }
  return res.json();
}

export async function getAutoLoopStatus(loopId: string): Promise<import("@/types").AutoLoopStatus> {
  const res = await apiFetch(`${BASE_URL}/api/auto-loop/status/${encodeURIComponent(loopId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load auto loop status" }));
    throw new Error(err.detail ?? "Failed to load auto loop status");
  }
  return res.json();
}

export async function listAutoLoops(): Promise<{ loops: import("@/types").AutoLoopStatus[] }> {
  const res = await apiFetch(`${BASE_URL}/api/auto-loop/list`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load auto loop list" }));
    throw new Error(err.detail ?? "Failed to load auto loop list");
  }
  return res.json();
}

// Portfolio Orchestration Loop

export async function startPortfolioLoop(
  req: import("@/types").PortfolioLoopStartRequest
): Promise<{ loop_id: string; status: string }> {
  const res = await apiFetch(`${BASE_URL}/api/portfolio-loop/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to start portfolio loop" }));
    throw new Error(err.detail ?? "Failed to start portfolio loop");
  }
  return res.json();
}

export async function stopPortfolioLoop(loopId: string): Promise<{ loop_id: string; status: string }> {
  const res = await apiFetch(`${BASE_URL}/api/portfolio-loop/stop/${encodeURIComponent(loopId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to stop portfolio loop" }));
    throw new Error(err.detail ?? "Failed to stop portfolio loop");
  }
  return res.json();
}

export async function getPortfolioLoopStatus(loopId: string): Promise<import("@/types").PortfolioLoopStatus> {
  const res = await apiFetch(`${BASE_URL}/api/portfolio-loop/status/${encodeURIComponent(loopId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load portfolio loop status" }));
    throw new Error(err.detail ?? "Failed to load portfolio loop status");
  }
  return res.json();
}

export async function listPortfolioLoops(): Promise<{ loops: import("@/types").PortfolioLoopStatus[] }> {
  const res = await apiFetch(`${BASE_URL}/api/portfolio-loop/list`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load portfolio loop list" }));
    throw new Error(err.detail ?? "Failed to load portfolio loop list");
  }
  return res.json();
}

export async function scanPortfolioLoop(loopId: string): Promise<import("@/types").PortfolioLoopStatus> {
  const res = await apiFetch(`${BASE_URL}/api/portfolio-loop/scan/${encodeURIComponent(loopId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to scan portfolio loop" }));
    throw new Error(err.detail ?? "Failed to scan portfolio loop");
  }
  return res.json();
}

// KIS OpenAPI

export async function getKisStatus(): Promise<import("@/types").KisStatus> {
  const res = await apiFetch(`${BASE_URL}/api/kis/status`);
  if (!res.ok) throw new Error("Failed to load KIS status");
  return res.json();
}

export async function getKisBalance(): Promise<import("@/types").KisBalance> {
  const res = await apiFetch(`${BASE_URL}/api/kis/balance`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load KIS balance" }));
    throw new Error(err.detail ?? "Failed to load KIS balance");
  }
  return res.json();
}

export async function getKisPrice(ticker: string): Promise<import("@/types").KisPrice> {
  const res = await apiFetch(`${BASE_URL}/api/kis/price/${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load KIS price" }));
    throw new Error(err.detail ?? "Failed to load KIS price");
  }
  return res.json();
}

export async function placeKisOrder(
  req: import("@/types").KisOrderRequest
): Promise<import("@/types").KisOrderResult> {
  const res = await apiFetch(`${BASE_URL}/api/kis/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to place order" }));
    throw new Error(err.detail ?? "Failed to place order");
  }
  return res.json();
}

export async function requestKisOrderApproval(
  req: import("@/types").KisOrderApprovalCreateRequest
): Promise<import("@/types").KisOrderApproval> {
  const res = await apiFetch(`${BASE_URL}/api/kis/order/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to request order approval" }));
    throw new Error(err.detail ?? "Failed to request order approval");
  }
  return res.json();
}

export async function getKisOrderApproval(
  approvalId: string
): Promise<import("@/types").KisOrderApproval> {
  const res = await apiFetch(`${BASE_URL}/api/kis/order/approval/${encodeURIComponent(approvalId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load approval status" }));
    throw new Error(err.detail ?? "Failed to load approval status");
  }
  return res.json();
}

export async function approveKisOrderApproval(
  approvalId: string
): Promise<import("@/types").KisOrderApprovalActionResult> {
  const res = await apiFetch(`${BASE_URL}/api/kis/order/approval/${encodeURIComponent(approvalId)}/approve`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to approve order" }));
    throw new Error(err.detail ?? "Failed to approve order");
  }
  return res.json();
}

export async function rejectKisOrderApproval(
  approvalId: string
): Promise<import("@/types").KisOrderApprovalActionResult> {
  const res = await apiFetch(`${BASE_URL}/api/kis/order/approval/${encodeURIComponent(approvalId)}/reject`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to reject order" }));
    throw new Error(err.detail ?? "Failed to reject order");
  }
  return res.json();
}

// User system APIs
export async function getAuthBootstrapStatus(): Promise<import("@/types").AuthBootstrapStatus> {
  const res = await apiFetch(`${BASE_URL}/api/auth/bootstrap`);
  if (!res.ok) throw new Error("Failed to load bootstrap status");
  return res.json();
}

export async function registerUser(
  payload: import("@/types").AuthRegisterRequest
): Promise<import("@/types").AuthResponse> {
  const res = await apiFetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to register" }));
    throw new Error(err.detail ?? "Failed to register");
  }
  return res.json();
}

export async function loginUser(
  payload: import("@/types").AuthLoginRequest
): Promise<import("@/types").AuthResponse> {
  const res = await apiFetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to login" }));
    throw new Error(err.detail ?? "Failed to login");
  }
  return res.json();
}

export async function logoutUser(): Promise<{ ok: boolean }> {
  const res = await apiFetch(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to logout" }));
    throw new Error(err.detail ?? "Failed to logout");
  }
  return res.json();
}

export async function getMe(): Promise<import("@/types").AuthMeResponse> {
  const res = await apiFetch(`${BASE_URL}/api/auth/me`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unauthorized" }));
    throw new Error(err.detail ?? "Unauthorized");
  }
  return res.json();
}

export async function getMyActivity(limit = 100): Promise<{ items: import("@/types").ActivityLogItem[] }> {
  const res = await apiFetch(`${BASE_URL}/api/users/me/activity?limit=${encodeURIComponent(String(limit))}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load activity" }));
    throw new Error(err.detail ?? "Failed to load activity");
  }
  return res.json();
}

export async function masterListInviteCodes(limit = 200): Promise<import("@/types").InviteCodeListResponse> {
  const res = await apiFetch(`${BASE_URL}/api/master/invite-codes?limit=${encodeURIComponent(String(limit))}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load invite codes" }));
    throw new Error(err.detail ?? "Failed to load invite codes");
  }
  return res.json();
}

export async function masterCreateInviteCode(
  payload: import("@/types").CreateInviteCodeRequest
): Promise<{ invite: import("@/types").InviteCode }> {
  const res = await apiFetch(`${BASE_URL}/api/master/invite-codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create invite code" }));
    throw new Error(err.detail ?? "Failed to create invite code");
  }
  return res.json();
}

export async function masterRevokeInviteCode(inviteId: string): Promise<{ ok: boolean }> {
  const res = await apiFetch(`${BASE_URL}/api/master/invite-codes/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to revoke invite code" }));
    throw new Error(err.detail ?? "Failed to revoke invite code");
  }
  return res.json();
}

export async function getMyTrades(limit = 100): Promise<{ items: import("@/types").UserTradeItem[] }> {
  const res = await apiFetch(`${BASE_URL}/api/users/me/trades?limit=${encodeURIComponent(String(limit))}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load trades" }));
    throw new Error(err.detail ?? "Failed to load trades");
  }
  return res.json();
}

export async function getMasterOverview(): Promise<import("@/types").MasterOverview> {
  const res = await apiFetch(`${BASE_URL}/api/master/overview`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load overview" }));
    throw new Error(err.detail ?? "Failed to load overview");
  }
  return res.json();
}

export async function getMasterUsers(limit = 200): Promise<{ items: import("@/types").AppUser[] }> {
  const res = await apiFetch(`${BASE_URL}/api/master/users?limit=${encodeURIComponent(String(limit))}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load users" }));
    throw new Error(err.detail ?? "Failed to load users");
  }
  return res.json();
}

export async function updateMasterUserRole(
  userId: string,
  role: import("@/types").UserRole
): Promise<{ user: import("@/types").AppUser }> {
  const res = await apiFetch(`${BASE_URL}/api/master/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to update role" }));
    throw new Error(err.detail ?? "Failed to update role");
  }
  return res.json();
}

export async function updateMasterUserDisabled(
  userId: string,
  disabled: boolean
): Promise<{ user: import("@/types").AppUser }> {
  const res = await apiFetch(`${BASE_URL}/api/master/users/${encodeURIComponent(userId)}/disabled`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to update disabled state" }));
    throw new Error(err.detail ?? "Failed to update disabled state");
  }
  return res.json();
}

export async function getMasterActivity(
  params?: { limit?: number; userId?: string; category?: string; excludeNoise?: boolean }
): Promise<{
  items: import("@/types").ActivityLogItem[];
  total?: number;
  total_excluding_noise?: number;
  applied?: Record<string, unknown>;
}> {
  const q = new URLSearchParams();
  q.set("limit", String(params?.limit ?? 200));
  if (params?.userId) q.set("user_id", params.userId);
  if (params?.category) q.set("category", params.category);
  if (typeof params?.excludeNoise === "boolean") {
    q.set("exclude_noise", params.excludeNoise ? "true" : "false");
  }

  const res = await apiFetch(`${BASE_URL}/api/master/activity?${q.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load activity" }));
    throw new Error(err.detail ?? "Failed to load activity");
  }
  return res.json();
}

export async function getMasterTrades(
  params?: { limit?: number; userId?: string }
): Promise<{
  items: import("@/types").UserTradeItem[];
  total?: number;
  applied?: Record<string, unknown>;
}> {
  const q = new URLSearchParams();
  q.set("limit", String(params?.limit ?? 200));
  if (params?.userId) q.set("user_id", params.userId);

  const res = await apiFetch(`${BASE_URL}/api/master/trades?${q.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load trades" }));
    throw new Error(err.detail ?? "Failed to load trades");
  }
  return res.json();
}

// ─────────────────────────────────────────────
// MS8 — office_layouts CRUD client
// ─────────────────────────────────────────────

export type OfficeFurniture = {
  asset_id: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  layer: "floor" | "wall" | "decor";
};

export type OfficeCharacter = {
  role: string;
  base?: string;
  hair?: string;
  outfit?: string;
  accent_color?: string | null;
};

export type OfficeTheme = "neutral" | "warm" | "dark" | "hanok";

export type OfficeLayout = {
  _id: string;
  user_id?: string;
  name: string;
  map_id: string;
  theme: OfficeTheme;
  furniture: OfficeFurniture[];
  characters: OfficeCharacter[];
  notes: string;
  is_active?: boolean;
  shared_token?: string | null;
  created_at: string;
  updated_at: string;
};

export type OfficeLayoutCreate = {
  name: string;
  map_id?: string;
  theme?: OfficeTheme;
  furniture?: OfficeFurniture[];
  characters?: OfficeCharacter[];
  notes?: string;
  set_active?: boolean;
};

export type OfficeLayoutUpdate = Partial<Omit<OfficeLayoutCreate, "set_active">>;

async function _olJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: fallback }));
    throw new Error(err.detail ?? fallback);
  }
  return res.json() as Promise<T>;
}

export async function listOfficeLayouts(): Promise<OfficeLayout[]> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts`);
  const data = await _olJson<{ items: OfficeLayout[] }>(res, "레이아웃 목록 로드 실패");
  return data.items;
}

export async function getActiveOfficeLayout(): Promise<OfficeLayout | null> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/active`);
  const data = await _olJson<{ layout: OfficeLayout | null }>(res, "활성 레이아웃 로드 실패");
  return data.layout;
}

export async function getOfficeLayout(id: string): Promise<OfficeLayout> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/${id}`);
  const data = await _olJson<{ layout: OfficeLayout }>(res, "레이아웃 로드 실패");
  return data.layout;
}

export async function createOfficeLayout(payload: OfficeLayoutCreate): Promise<OfficeLayout> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await _olJson<{ layout: OfficeLayout }>(res, "레이아웃 생성 실패");
  return data.layout;
}

export async function updateOfficeLayout(id: string, patch: OfficeLayoutUpdate): Promise<OfficeLayout> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await _olJson<{ layout: OfficeLayout }>(res, "레이아웃 업데이트 실패");
  return data.layout;
}

export async function deleteOfficeLayout(id: string): Promise<void> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/${id}`, { method: "DELETE" });
  await _olJson(res, "레이아웃 삭제 실패");
}

export async function activateOfficeLayout(id: string): Promise<OfficeLayout | null> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/${id}/activate`, { method: "POST" });
  const data = await _olJson<{ layout: OfficeLayout | null }>(res, "활성화 실패");
  return data.layout;
}

export async function issueOfficeLayoutShareToken(id: string): Promise<{ shared_token: string; layout: OfficeLayout }> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/${id}/share`, { method: "POST" });
  return _olJson(res, "공유 토큰 발급 실패");
}

export async function revokeOfficeLayoutShareToken(id: string): Promise<OfficeLayout> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/${id}/share`, { method: "DELETE" });
  const data = await _olJson<{ layout: OfficeLayout }>(res, "공유 토큰 회수 실패");
  return data.layout;
}

export async function getSharedOfficeLayout(token: string): Promise<OfficeLayout> {
  const res = await apiFetch(`${BASE_URL}/api/office-layouts/shared/${encodeURIComponent(token)}`);
  const data = await _olJson<{ layout: OfficeLayout }>(res, "공유 레이아웃 로드 실패");
  return data.layout;
}




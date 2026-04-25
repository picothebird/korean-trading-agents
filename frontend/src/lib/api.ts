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
  timeframe: "1m" | "3m" | "6m" | "1y" | "2y" = "6m"
): Promise<import("@/types").StockChartResponse> {
  const res = await apiFetch(`${BASE_URL}/api/stock/${ticker}/chart?timeframe=${timeframe}`);
  if (!res.ok) throw new Error(`Failed to load chart: ${ticker}`);
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
  params?: { limit?: number; userId?: string }
): Promise<{ items: import("@/types").ActivityLogItem[] }> {
  const q = new URLSearchParams();
  q.set("limit", String(params?.limit ?? 200));
  if (params?.userId) q.set("user_id", params.userId);

  const res = await apiFetch(`${BASE_URL}/api/master/activity?${q.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load activity" }));
    throw new Error(err.detail ?? "Failed to load activity");
  }
  return res.json();
}

export async function getMasterTrades(
  params?: { limit?: number; userId?: string }
): Promise<{ items: import("@/types").UserTradeItem[] }> {
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



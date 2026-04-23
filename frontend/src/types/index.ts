// API 타입 정의

export type AgentRole =
  | "technical_analyst"
  | "fundamental_analyst"
  | "sentiment_analyst"
  | "macro_analyst"
  | "bull_researcher"
  | "bear_researcher"
  | "risk_manager"
  | "portfolio_manager";

export type AgentStatus =
  | "idle"
  | "thinking"
  | "analyzing"
  | "debating"
  | "deciding"
  | "done";

export interface AgentThought {
  agent_id: string;
  role: AgentRole;
  status: AgentStatus;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface TradeDecision {
  action: "BUY" | "SELL" | "HOLD";
  ticker: string;
  confidence: number;
  reasoning: string;
  entry_strategy?: string;
  exit_strategy?: string;
  agents_summary: {
    analyst_signals: { BUY: number; SELL: number; HOLD: number };
    risk_level: string;
    position_size_pct: number;
    kelly_position_pct?: number;
    requires_human_approval?: boolean;
    entry_strategy?: string;
    exit_strategy?: string;
  };
  timestamp: string;
}

export interface StockIndicators {
  ticker: string;
  current_price: number;
  change_pct: number;
  volume: number;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  ma5: number;
  ma20: number;
  ma60: number | null;
  high_52w: number;
  low_52w: number;
  last_updated: string;
}

export interface BacktestMetrics {
  total_return: number;
  annualized_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  profit_factor: number;
  calmar_ratio: number;
  benchmark_return: number;
  alpha: number;
}

export interface BacktestResult {
  ticker: string;
  period: string;
  metrics: BacktestMetrics;
  trades: Array<{
    entry_date: string;
    exit_date: string;
    entry_price: number;
    exit_price: number;
    return_pct: number;
    result: "WIN" | "LOSS";
  }>;
  equity_curve: Array<{ date: string; value: number }>;
  summary: string;
}

export interface MarketIndex {
  current: number;
  change: number;
  change_pct: number;
}

export interface UserSettings {
  openai_api_key_set: boolean;
  openai_api_key_preview: string;
  default_llm_model: string;
  fast_llm_model: string;
  reasoning_effort: "high" | "medium" | "low";
  max_debate_rounds: number;
  kis_mock: boolean;
  kis_app_key_set: boolean;
  kis_app_secret_set: boolean;
  kis_account_no: string;
}

// ── KIS OpenAPI 타입 ─────────────────────────────────────────────

export interface KisStatus {
  connected: boolean;
  is_mock: boolean;
  error?: string;
  token_preview?: string;
}

export interface KisHolding {
  ticker: string;
  name: string;
  qty: number;
  avg_price: number;
  current_price: number;
  eval_amount: number;
  profit_loss: number;
  profit_loss_pct: number;
  purchase_amount: number;
}

export interface KisBalance {
  holdings: KisHolding[];
  cash: number;
  total_eval: number;
  total_purchase: number;
  total_profit_loss: number;
  total_profit_loss_pct: number;
  is_mock: boolean;
}

export interface KisPrice {
  ticker: string;
  current_price: number;
  change: number;
  change_pct: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  market_cap: string;
  per: string;
  pbr: string;
  name: string;
}

export interface KisOrderRequest {
  ticker: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  order_type: "00" | "01";
}

export interface KisOrderResult {
  order_no: string;
  order_time: string;
  side: "buy" | "sell";
  ticker: string;
  qty: number;
  price: number;
  order_type_label: string;
  is_mock: boolean;
}

export interface BacktestProgress {
  type: "connected" | "backtest_result" | "error" | "done";
  agent_id?: string;
  content?: string;
  metadata?: {
    date?: string;
    signal?: string;
    confidence?: number;
    step?: number;
    total?: number;
  };
  // backtest_result fields
  ticker?: string;
  period?: string;
  metrics?: BacktestMetrics;
  trades?: BacktestResult["trades"];
  equity_curve?: BacktestResult["equity_curve"];
  summary?: string;
  message?: string;
}

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
  agents_summary: {
    analyst_signals: { BUY: number; SELL: number; HOLD: number };
    risk_level: string;
    position_size_pct: number;
    entry_strategy: string;
    exit_strategy: string;
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

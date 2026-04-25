// API 타입 정의

export type AgentRole =
  | "technical_analyst"
  | "fundamental_analyst"
  | "sentiment_analyst"
  | "macro_analyst"
  | "bull_researcher"
  | "bear_researcher"
  | "risk_manager"
  | "portfolio_manager"
  | "guru_agent";

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
    stop_loss_pct?: number;
    requires_human_approval?: boolean;
    entry_strategy?: string;
    exit_strategy?: string;
    guru?: {
      enabled: boolean;
      risk_profile: "defensive" | "balanced" | "aggressive" | string;
      debate_enabled: boolean;
      investment_principles: string;
      min_confidence_to_act: number;
      max_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
      max_position_pct: number;
      require_user_confirmation: boolean;
      llm_action: "BUY" | "SELL" | "HOLD" | string;
      llm_confidence: number;
      final_action: "BUY" | "SELL" | "HOLD" | string;
      action_changed: boolean;
      rules_applied: string[];
      notes: string[];
    };
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
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  high_52w: number;
  low_52w: number;
  last_updated: string;
}

export interface StockChartPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
}

export interface StockChartResponse {
  ticker: string;
  timeframe: "1m" | "3m" | "6m" | "1y" | "2y";
  points: StockChartPoint[];
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

export interface BacktestPredictionPoint {
  prediction_date: string;
  eval_date: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  price_at_prediction: number;
  predicted_price: number;
  actual_price: number;
  predicted_return_pct: number;
  actual_return_pct: number;
  hit: boolean;
}

export interface BacktestPredictionMonitoring {
  prediction_count: number;
  hit_rate: number;
  avg_predicted_return_pct: number;
  avg_actual_return_pct: number;
  avg_abs_error_pct: number;
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
  prediction_trace?: BacktestPredictionPoint[];
  prediction_monitoring?: BacktestPredictionMonitoring;
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
  guru_enabled: boolean;
  guru_debate_enabled: boolean;
  guru_require_user_confirmation: boolean;
  guru_risk_profile: "defensive" | "balanced" | "aggressive";
  guru_investment_principles: string;
  guru_min_confidence_to_act: number;
  guru_max_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  guru_max_position_pct: number;
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
  prediction_trace?: BacktestResult["prediction_trace"];
  prediction_monitoring?: BacktestResult["prediction_monitoring"];
  summary?: string;
  message?: string;
}

// ── Server Auto Loop ────────────────────────────────────────────

export type SupervisionLevel = "strict" | "balanced" | "aggressive";
export type ExecutionSessionMode = "regular_only" | "regular_and_after_hours";

export interface AutoLoopStartRequest {
  ticker: string;
  interval_min: number;
  min_confidence: number;
  order_qty: number;
  paper_trade: boolean;
  fee_bps: number;
  slippage_bps: number;
  tax_bps: number;
  max_position_pct: number;
  supervision_level: SupervisionLevel;
  execution_session_mode: ExecutionSessionMode;
  initial_cash: number;
}

export interface AutoLoopLog {
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

export interface AutoLoopDecisionHistoryPoint {
  timestamp: string;
  confidence: number;
  actionScore: number;
  action: "BUY" | "SELL" | "HOLD";
}

export interface AutoLoopTradeRecord {
  timestamp: string;
  ticker: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  status: "simulated" | "executed" | "failed";
  confidence: number;
  reason: string;
}

export interface AutoLoopPaperAccount {
  cash: number;
  shares: number;
  avg_buy_price: number;
  market_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  position_pct: number;
  total_fees: number;
  total_taxes: number;
}

export interface AutoLoopStatus {
  loop_id: string;
  ticker: string;
  running: boolean;
  cycle_running: boolean;
  created_at: string;
  started_at: string | null;
  stopped_at: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  settings: AutoLoopStartRequest;
  stats: {
    cycle_count: number;
    simulated_trades: number;
    executed_trades: number;
    failed_trades: number;
    skipped_cycles: number;
  };
  latest_price: number;
  latest_price_time: string | null;
  current_session: string;
  latest_decision: TradeDecision | null;
  paper_account: AutoLoopPaperAccount | null;
  decision_history: AutoLoopDecisionHistoryPoint[];
  trade_history: AutoLoopTradeRecord[];
  logs: AutoLoopLog[];
}

// ── Portfolio Orchestration Loop ───────────────────────────────

export type UniverseMarket = "ALL" | "KOSPI" | "KOSDAQ";
export type MonitoringProfile = "balanced" | "momentum" | "defensive";

export interface PortfolioLoopStartRequest {
  name: string;
  seed_tickers: string[];
  preferred_tickers: string[];
  excluded_tickers: string[];
  interest_keywords: string[];
  monitoring_profile: MonitoringProfile;
  market_scan_enabled: boolean;
  universe_market: UniverseMarket;
  universe_limit: number;
  candidate_count: number;
  max_positions: number;
  max_parallel_analyses: number;
  cycle_interval_min: number;
  min_confidence: number;
  max_single_position_pct: number;
  rebalance_threshold_pct: number;
  paper_trade: boolean;
  initial_cash: number;
  fee_bps: number;
  slippage_bps: number;
  tax_bps: number;
  execution_session_mode: ExecutionSessionMode;
}

export interface PortfolioLoopCandidate {
  ticker: string;
  name: string;
  market: string;
  score: number;
  current_price: number;
  change_pct: number;
  rsi_14: number;
  ma_gap_pct: number;
  reason: string;
}

export interface PortfolioLoopDecision {
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  risk_level: string;
  requires_human_approval: boolean;
  reasoning: string;
  timestamp: string;
}

export interface PortfolioLoopAllocation {
  ticker: string;
  target_weight_pct: number;
  current_weight_pct: number;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  score: number;
}

export interface PortfolioLoopPosition {
  ticker: string;
  shares: number;
  avg_buy_price: number;
  market_price: number;
  market_value: number;
  unrealized_pnl: number;
  weight_pct: number;
}

export interface PortfolioLoopAccount {
  cash: number;
  market_value: number;
  total_equity: number;
  realized_pnl: number;
  total_fees: number;
  total_taxes: number;
  positions: PortfolioLoopPosition[];
}

export interface PortfolioLoopStatus {
  loop_id: string;
  name: string;
  running: boolean;
  cycle_running: boolean;
  created_at: string;
  started_at: string | null;
  stopped_at: string | null;
  last_run_at: string | null;
  last_scan_at: string | null;
  next_run_at: string | null;
  current_session: string;
  settings: PortfolioLoopStartRequest;
  stats: {
    cycle_count: number;
    scan_count: number;
    manual_scan_count: number;
    analysis_count: number;
    simulated_trades: number;
    executed_trades: number;
    failed_trades: number;
    skipped_cycles: number;
  };
  account: PortfolioLoopAccount;
  latest_candidates: PortfolioLoopCandidate[];
  latest_decisions: PortfolioLoopDecision[];
  target_allocations: PortfolioLoopAllocation[];
  latest_quotes: Record<string, number>;
  trade_history: AutoLoopTradeRecord[];
  logs: AutoLoopLog[];
}

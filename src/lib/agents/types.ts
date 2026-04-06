// ============================================================
// Core Types for Polymarket AI Trading Bot
// ============================================================

// --- Market Types ---

export interface PolyMarket {
  conditionId: string;
  questionId: string;
  question: string;
  description: string;
  slug: string;
  endDate: string;
  volume: number;
  liquidity: number;
  outcomes: string[];
  outcomePrices: number[];
  tags: string[];
  active: boolean;
  closed: boolean;
  tokens: PolyToken[];
  recentTradeCount: number;
  spread: number;
  category: string;
}

export interface PolyToken {
  tokenId: string;
  outcome: string;
  price: number;
  winner: boolean;
}

export interface PolyOrderBook {
  market: string;
  assetId: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  midpoint: number;
  bidVolume: number;
  askVolume: number;
  imbalance: number; // (bidVol - askVol) / (bidVol + askVol)
}

export interface OrderBookEntry {
  price: number;
  size: number;
}

// --- Agent Types ---

export type AgentName = 'scout' | 'analyst' | 'strategist' | 'quant' | 'oracle';
export type AgentSignal = 'BUY_YES' | 'BUY_NO' | 'HOLD';
export type OracleConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface AgentDecision {
  agent: AgentName;
  signal: AgentSignal;
  confidence: number;
  edge: number;
  reasoning: string;
  targetPrice?: number;
  suggestedSize?: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface TradingAgent {
  name: AgentName;
  level: number;
  analyze(
    market: PolyMarket,
    orderbook: PolyOrderBook,
    news: NewsArticle[],
    otherDecisions?: AgentDecision[]
  ): Promise<AgentDecision>;
}

// --- News Types ---

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: string;
  sentimentScore: number;
}

// --- Consensus Types ---

export interface ConsensusResult {
  shouldTrade: boolean;
  signal: AgentSignal;
  averageConfidence: number;
  agreeCount: number;
  positionSize: number;
  edge: number;
  reasons: string[];
  ruleResults: Record<string, boolean>;
  decisions: AgentDecision[];
  marketId: string;
  timestamp: string;
}

// --- Position / Trade Types ---

export type PositionStatus = 'open' | 'closed' | 'resolved';
export type Side = 'BUY' | 'SELL';

export interface BotPosition {
  id: string;
  marketId: string;
  tokenId: string;
  question: string;
  outcome: string;
  category: string;
  side: Side;
  signal: AgentSignal;
  entryPrice: number;
  currentPrice: number;
  size: number;
  costBasis: number;
  unrealizedPnl: number;
  agentDecisions: AgentDecision[];
  oracleReasoning: string;
  consensusConfidence: number;
  openedAt: string;
  resolvesAt: string;
  status: PositionStatus;
}

export interface TradeRecord extends BotPosition {
  exitPrice: number;
  realizedPnl: number;
  closedAt: string;
  resolved: boolean;
  won: boolean;
  holdHours: number;
}

// --- Analytics Types ---

export interface AgentStats {
  name: AgentName;
  level: number;
  totalSignals: number;
  buyYesCount: number;
  buyNoCount: number;
  holdCount: number;
  avgConfidence: number;
  accuracy: number;
  brierScore: number;
  contributionScore: number;
}

export interface BotAnalytics {
  totalPnl: number;
  unrealizedPnl: number;
  realizedPnl: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  openPositions: number;
  avgEdgeCaptured: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgHoldHours: number;
  bestCategory: string;
  worstCategory: string;
  agentStats: AgentStats[];
  tradesSkipped: number;
  skipReasons: Record<string, number>;
}

export interface CalibrationPoint {
  predictedProbability: number;
  actualFrequency: number;
  count: number;
}

// --- Bot Event Types (SSE) ---

export type BotEventType =
  | 'tick'
  | 'signal'
  | 'consensus'
  | 'trade'
  | 'position_update'
  | 'error'
  | 'bot_status';

export interface BotEvent {
  type: BotEventType;
  timestamp: string;
  data: unknown;
}

// --- Bot Status ---

export interface BotStatus {
  running: boolean;
  dryRun: boolean;
  tickCount: number;
  tradesExecuted: number;
  tradesSkipped: number;
  errors: number;
  lastTickAt: string | null;
  nextTickAt: string | null;
  intervalMs: number;
  uptime: number;
  startedAt: string | null;
}

// --- Config Types ---

export interface BotConfig {
  polymarket: {
    host: string;
    chainId: number;
    privateKey: string;
    apiKey: string;
    apiSecret: string;
    apiPassphrase: string;
    funderAddress: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  newsApi: {
    apiKey: string;
    baseUrl: string;
  };
  bot: {
    intervalMs: number;
    dryRun: boolean;
    maxExposure: number;
    maxSinglePosition: number;
    minConsensusAgents: number;
    minEdge: number;
    minMarketVolume: number;
    bankroll: number;
    kellyCap: number;
  };
  dataDir: string;
  persistenceMode: 'file' | 'memory';
  cronSecret: string;
}

// --- Order Types ---

export interface OrderResult {
  orderId: string;
  success: boolean;
  message: string;
  dryRun: boolean;
  side: Side;
  price: number;
  size: number;
  tokenId: string;
}

// --- Market Filter Types ---

export interface FilterResult {
  passed: boolean;
  market: PolyMarket;
  score: number;
  failedRules: string[];
}

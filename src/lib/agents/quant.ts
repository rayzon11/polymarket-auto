import {
  TradingAgent,
  AgentDecision,
  AgentSignal,
  PolyMarket,
  PolyOrderBook,
  NewsArticle,
} from './types';
import { getConfig } from '@/lib/config';

// Agent 4 — Quant (Level 4)
// Strategy: multi-factor alpha + Bayesian updating + Brier score tracking
// Computes alpha from multiple independent signals, updates beliefs using Bayes

// In-memory category win rate tracking
interface CategoryStats {
  wins: number;
  total: number;
  predictions: Array<{ predicted: number; actual: number }>;
}

const categoryHistory: Map<string, CategoryStats> = new Map();

function getCategoryStats(category: string): CategoryStats {
  if (!categoryHistory.has(category)) {
    categoryHistory.set(category, { wins: 0, total: 0, predictions: [] });
  }
  return categoryHistory.get(category)!;
}

function computeBrierScore(predictions: Array<{ predicted: number; actual: number }>): number {
  if (predictions.length === 0) return 0.25; // Uninformative prior
  return predictions.reduce((sum, p) => sum + (p.predicted - p.actual) ** 2, 0) / predictions.length;
}

export class QuantAgent implements TradingAgent {
  name = 'quant' as const;
  level = 4;

  async analyze(
    market: PolyMarket,
    orderbook: PolyOrderBook,
    news: NewsArticle[],
  ): Promise<AgentDecision> {
    const config = getConfig();
    const yesPrice = market.outcomePrices[0] ?? 0.5;

    // Factor 1: News sentiment (weight 0.35)
    const sentimentArticles = news.filter((a) => a.sentimentScore !== 0);
    const newsSentiment = sentimentArticles.length > 0
      ? sentimentArticles.reduce((s, a) => s + a.sentimentScore, 0) / sentimentArticles.length
      : 0;

    // Factor 2: Price momentum (weight 0.25)
    // Use orderbook midpoint vs current price as momentum proxy
    const midpoint = orderbook.midpoint || yesPrice;
    const priceMomentum = (midpoint - yesPrice) * 10; // Scale to [-1, 1] range approx

    // Factor 3: Orderbook imbalance (weight 0.25)
    const obImbalance = orderbook.imbalance;

    // Factor 4: Volume trend (weight 0.15)
    // Use volume-to-liquidity ratio as proxy for trend strength
    const volumeTrend = market.liquidity > 0
      ? Math.min(1, Math.max(-1, (market.volume / market.liquidity - 1) * 0.5))
      : 0;

    // Multi-factor alpha score
    const alpha = 0.35 * newsSentiment + 0.25 * priceMomentum + 0.25 * obImbalance + 0.15 * volumeTrend;

    // Bayesian updating: start with market price as prior
    let posterior = yesPrice;

    // Update 1: News sentiment as likelihood ratio
    const sentimentLR = 1 + newsSentiment * 0.5; // Range [0.5, 1.5]
    const priorOdds = posterior / (1 - posterior);
    let posteriorOdds = priorOdds * sentimentLR;
    posterior = posteriorOdds / (1 + posteriorOdds);

    // Update 2: Orderbook pressure
    const obLR = 1 + obImbalance * 0.3;
    posteriorOdds = (posterior / (1 - posterior)) * obLR;
    posterior = posteriorOdds / (1 + posteriorOdds);

    // Update 3: Volume trend
    const volLR = 1 + volumeTrend * 0.2;
    posteriorOdds = (posterior / (1 - posterior)) * volLR;
    posterior = Math.max(0.01, Math.min(0.99, posteriorOdds / (1 + posteriorOdds)));

    // Category win rate adjustment
    const stats = getCategoryStats(market.category);
    const categoryWinRate = stats.total > 10 ? stats.wins / stats.total : 0.5;
    const brierScore = computeBrierScore(stats.predictions.slice(-50));

    // Bayesian boost if category performs well
    let confidenceBoost = 0;
    if (categoryWinRate > 0.6 && stats.total > 10) {
      confidenceBoost = 0.10;
    }

    // Brier degradation check: if our predictions are getting worse, reduce sizes
    let sizePenalty = 1.0;
    if (stats.predictions.length > 20) {
      const recentBrier = computeBrierScore(stats.predictions.slice(-10));
      const olderBrier = computeBrierScore(stats.predictions.slice(-20, -10));
      if (recentBrier > olderBrier + 0.05) {
        sizePenalty = 0.7; // Reduce position size by 30%
      }
    }

    // Compute edge
    const edge = Math.abs(posterior - yesPrice);

    // Decision
    let signal: AgentSignal = 'HOLD';
    let reasoning = '';

    if (edge > 0.05 && alpha > 0.15) {
      signal = posterior > yesPrice ? 'BUY_YES' : 'BUY_NO';
      reasoning = `Alpha: ${alpha.toFixed(3)}, Posterior: ${posterior.toFixed(3)} vs Market: ${yesPrice.toFixed(3)}. Edge: ${edge.toFixed(3)}.`;
      reasoning += ` Factors — Sentiment: ${newsSentiment.toFixed(2)}, Momentum: ${priceMomentum.toFixed(2)}, OB: ${obImbalance.toFixed(2)}, Volume: ${volumeTrend.toFixed(2)}.`;
      if (categoryWinRate > 0.6) reasoning += ` Category "${market.category}" win rate: ${(categoryWinRate * 100).toFixed(0)}% — boosting confidence.`;
    } else if (edge > 0.05 && alpha < -0.15) {
      signal = posterior < yesPrice ? 'BUY_NO' : 'BUY_YES';
      reasoning = `Negative alpha: ${alpha.toFixed(3)}, Posterior: ${posterior.toFixed(3)} vs Market: ${yesPrice.toFixed(3)}. Edge: ${edge.toFixed(3)}.`;
    } else {
      reasoning = `Insufficient edge (${edge.toFixed(3)}) or alpha (${alpha.toFixed(3)}). Holding.`;
    }

    // Confidence: 0.40-0.85 based on alpha magnitude + win rate
    const baseConf = Math.min(0.75, Math.max(0.40, 0.40 + Math.abs(alpha) * 0.5 + edge * 0.5));
    const confidence = signal !== 'HOLD'
      ? Math.min(0.85, baseConf + confidenceBoost)
      : 0.30;

    // Position sizing: Kelly-adjusted with penalties
    let suggestedSize = 0;
    if (signal !== 'HOLD') {
      const payoff = signal === 'BUY_YES'
        ? (1 / yesPrice) - 1
        : (1 / (1 - yesPrice)) - 1;
      const p = signal === 'BUY_YES' ? posterior : 1 - posterior;
      const q = 1 - p;
      const kelly = payoff > 0 ? (p * payoff - q) / payoff : 0;
      const cappedKelly = Math.max(0, Math.min(config.bot.kellyCap, kelly));
      suggestedSize = cappedKelly * config.bot.bankroll * sizePenalty;
    }

    return {
      agent: this.name,
      signal,
      confidence,
      edge,
      reasoning,
      targetPrice: posterior,
      suggestedSize,
      metadata: {
        alpha,
        posterior,
        newsSentiment,
        priceMomentum,
        obImbalance,
        volumeTrend,
        categoryWinRate,
        brierScore,
        sizePenalty,
        confidenceBoost,
        momentumAligned: (signal === 'BUY_YES' && priceMomentum > 0) || (signal === 'BUY_NO' && priceMomentum < 0),
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Called after a position resolves to update category stats
  static recordOutcome(category: string, predictedProb: number, actual: 0 | 1, won: boolean): void {
    const stats = getCategoryStats(category);
    stats.total++;
    if (won) stats.wins++;
    stats.predictions.push({ predicted: predictedProb, actual });
    // Keep last 50 predictions per category
    if (stats.predictions.length > 50) {
      stats.predictions.shift();
    }
  }
}

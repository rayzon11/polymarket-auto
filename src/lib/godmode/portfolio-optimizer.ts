import {
  BotPosition,
  ConsensusResult,
} from '@/lib/agents/types';
import { getConfig } from '@/lib/config';

// ============================================================
// Portfolio Optimizer — Position Sizing & Allocation Engine
// ============================================================
// Optimizes portfolio allocation using half-Kelly criterion,
// enforces diversification limits, and produces rebalance plans.
// ============================================================

// --- Constants ---

const MAX_WEIGHT_PER_POSITION = 0.05; // 5% of bankroll
const MAX_TOTAL_EXPOSURE = 0.25; // 25% of bankroll
const MAX_CATEGORY_WEIGHT = 0.40; // 40% in any single category
const KELLY_FRACTION = 0.5; // half-Kelly for safety
const RISK_FREE_RATE = 0.0; // no risk-free rate for prediction markets
const REBALANCE_DRIFT_THRESHOLD = 0.02; // 2% drift triggers rebalance
const MIN_POSITION_WEIGHT = 0.005; // below 0.5% -> consider exiting

// --- Interfaces ---

export interface PortfolioAllocation {
  tokenId: string;
  market: string;
  currentWeight: number;
  targetWeight: number;
  action: 'increase' | 'decrease' | 'hold' | 'exit';
  adjustmentSize: number;
  reason: string;
}

export interface OptimizationResult {
  allocations: PortfolioAllocation[];
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
  diversificationScore: number;
  rebalanceNeeded: boolean;
  timestamp: string;
}

// --- Helper utilities ---

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Standard deviation of a numeric array. */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// --- PortfolioOptimizer class ---

export class PortfolioOptimizer {
  /**
   * Full portfolio optimization pass.
   *
   * 1. Scores existing positions and candidate trades.
   * 2. Computes target weights via constrained half-Kelly.
   * 3. Returns allocations, risk metrics, and whether a rebalance is needed.
   */
  optimize(
    positions: BotPosition[],
    candidates: ConsensusResult[],
    bankroll: number,
  ): OptimizationResult {
    const timestamp = new Date().toISOString();
    const config = getConfig();
    const effectiveBankroll = bankroll > 0 ? bankroll : config.bot.bankroll;

    const allocations: PortfolioAllocation[] = [];

    // --- Existing position allocations ---
    const totalExposure = positions.reduce((sum, p) => sum + p.costBasis, 0);

    for (const pos of positions) {
      const currentWeight = pos.costBasis / effectiveBankroll;
      const edge = pos.currentPrice - pos.entryPrice; // simplified edge proxy
      const confidence = pos.consensusConfidence;

      // Compute target weight from Kelly
      const kellyWeight = this.calculateOptimalSize(
        Math.abs(edge),
        confidence,
        effectiveBankroll,
        totalExposure - pos.costBasis, // exposure excluding this position
      ) / effectiveBankroll;

      // If position is losing meaningfully and confidence has dropped, target exit
      const unrealizedReturn = pos.costBasis > 0 ? pos.unrealizedPnl / pos.costBasis : 0;
      let targetWeight: number;
      let action: PortfolioAllocation['action'];
      let reason: string;

      if (unrealizedReturn < -0.15 && confidence < 0.5) {
        // Losing position with fading confidence -> exit
        targetWeight = 0;
        action = 'exit';
        reason = `Unrealized loss ${(unrealizedReturn * 100).toFixed(1)}% with low confidence ${confidence.toFixed(2)}`;
      } else if (kellyWeight < MIN_POSITION_WEIGHT) {
        targetWeight = 0;
        action = 'exit';
        reason = `Kelly target ${(kellyWeight * 100).toFixed(2)}% below minimum threshold`;
      } else {
        targetWeight = clamp(kellyWeight, 0, MAX_WEIGHT_PER_POSITION);
        const drift = targetWeight - currentWeight;

        if (Math.abs(drift) < REBALANCE_DRIFT_THRESHOLD) {
          action = 'hold';
          reason = `Within drift tolerance (${(Math.abs(drift) * 100).toFixed(2)}%)`;
        } else if (drift > 0) {
          action = 'increase';
          reason = `Kelly suggests larger allocation (edge ${(Math.abs(edge) * 100).toFixed(1)}%, conf ${(confidence * 100).toFixed(0)}%)`;
        } else {
          action = 'decrease';
          reason = `Reducing to Kelly target (current ${(currentWeight * 100).toFixed(2)}% -> ${(targetWeight * 100).toFixed(2)}%)`;
        }
      }

      allocations.push({
        tokenId: pos.tokenId,
        market: pos.marketId,
        currentWeight,
        targetWeight,
        action,
        adjustmentSize: Math.abs(targetWeight - currentWeight) * effectiveBankroll,
        reason,
      });
    }

    // --- New candidate allocations ---
    const ranked = this.rankCandidates(candidates);
    const existingMarketIds = new Set(positions.map((p) => p.marketId));
    const categoryWeights = this.buildCategoryWeights(positions, effectiveBankroll);
    let projectedExposure = allocations.reduce(
      (sum, a) => sum + a.targetWeight * effectiveBankroll,
      0,
    );

    for (const candidate of ranked) {
      // Skip if we already hold this market
      if (existingMarketIds.has(candidate.marketId)) continue;
      if (!candidate.shouldTrade) continue;

      // Check total exposure cap
      if (projectedExposure / effectiveBankroll >= MAX_TOTAL_EXPOSURE) break;

      const optimalSize = this.calculateOptimalSize(
        candidate.edge,
        candidate.averageConfidence,
        effectiveBankroll,
        projectedExposure,
      );
      const targetWeight = clamp(optimalSize / effectiveBankroll, 0, MAX_WEIGHT_PER_POSITION);

      if (targetWeight < MIN_POSITION_WEIGHT) continue;

      // Check category cap (find the category from the candidate's decisions metadata)
      const candidateCategory = this.extractCategory(candidate);
      const currentCatWeight = categoryWeights.get(candidateCategory) ?? 0;
      if (currentCatWeight + targetWeight > MAX_CATEGORY_WEIGHT) continue;

      allocations.push({
        tokenId: candidate.marketId, // best available identifier
        market: candidate.marketId,
        currentWeight: 0,
        targetWeight,
        action: 'increase',
        adjustmentSize: targetWeight * effectiveBankroll,
        reason: `New opportunity: edge ${(candidate.edge * 100).toFixed(1)}%, confidence ${(candidate.averageConfidence * 100).toFixed(0)}%`,
      });

      projectedExposure += targetWeight * effectiveBankroll;
      categoryWeights.set(
        candidateCategory,
        currentCatWeight + targetWeight,
      );
    }

    // --- Portfolio-level metrics ---
    const expectedReturn = this.getExpectedPortfolioReturn(positions);
    const expectedRisk = this.estimatePortfolioRisk(positions, effectiveBankroll);
    const sharpeRatio = expectedRisk > 0
      ? (expectedReturn - RISK_FREE_RATE) / expectedRisk
      : 0;
    const diversificationScore = this.getDiversificationScore(positions);
    const rebalanceNeeded = this.shouldRebalance(positions, effectiveBankroll);

    return {
      allocations,
      expectedReturn,
      expectedRisk,
      sharpeRatio,
      diversificationScore,
      rebalanceNeeded,
      timestamp,
    };
  }

  /**
   * Half-Kelly position sizing with hard constraints.
   *
   * Kelly formula: f = (p * b - q) / b
   *   where p = win probability, q = 1-p, b = net odds (payout ratio).
   *
   * We use half-Kelly (f / 2) and then apply:
   *   - Max 5% of bankroll per position
   *   - Max 25% total portfolio exposure
   *
   * @returns Dollar size for the position.
   */
  calculateOptimalSize(
    edge: number,
    confidence: number,
    bankroll: number,
    existingExposure: number,
  ): number {
    if (edge <= 0 || confidence <= 0 || bankroll <= 0) return 0;

    const config = getConfig();
    const maxSingle = config.bot.maxSinglePosition * bankroll; // default 5%
    const maxTotal = config.bot.maxExposure * bankroll; // default 25%
    const remainingRoom = Math.max(0, maxTotal - existingExposure);

    // Estimate win probability from confidence and edge direction
    // confidence represents the agents' belief strength; edge represents price mispricing.
    const winProb = clamp(confidence, 0.01, 0.99);
    const lossProb = 1 - winProb;

    // Net odds: if we buy at price p, the payoff on $1 risked is (1-p)/p when it resolves to 1.
    // Use edge as a proxy for the expected price gap.
    // A simple model: odds = (1 + edge) / (1 - edge) - 1, floored at 0.1 for sanity.
    const impliedOdds = Math.max(0.1, edge / (1 - Math.min(edge, 0.99)));

    // Full Kelly fraction
    const kellyFull = (winProb * impliedOdds - lossProb) / impliedOdds;

    if (kellyFull <= 0) return 0; // negative Kelly -> no bet

    // Half-Kelly
    const kellyHalf = kellyFull * KELLY_FRACTION;

    // Convert to dollar amount, apply caps
    let size = kellyHalf * bankroll;
    size = Math.min(size, maxSingle);
    size = Math.min(size, remainingRoom);
    size = Math.max(size, 0);

    return size;
  }

  /**
   * Determine if the portfolio needs rebalancing.
   *
   * Triggers on:
   *   - Any position weight drifts > 2% from its Kelly target
   *   - Total exposure exceeds 25%
   *   - Any single category exceeds 40%
   */
  shouldRebalance(positions: BotPosition[], bankroll: number): boolean {
    if (positions.length === 0) return false;

    const config = getConfig();
    const effectiveBankroll = bankroll > 0 ? bankroll : config.bot.bankroll;

    // Check total exposure
    const totalExposure = positions.reduce((sum, p) => sum + p.costBasis, 0);
    if (totalExposure / effectiveBankroll > MAX_TOTAL_EXPOSURE) return true;

    // Check category concentration
    const categoryWeights = this.buildCategoryWeights(positions, effectiveBankroll);
    for (const weight of categoryWeights.values()) {
      if (weight > MAX_CATEGORY_WEIGHT) return true;
    }

    // Check individual position drift
    for (const pos of positions) {
      const currentWeight = pos.costBasis / effectiveBankroll;
      const otherExposure = totalExposure - pos.costBasis;
      const kellyTarget = this.calculateOptimalSize(
        Math.abs(pos.currentPrice - pos.entryPrice),
        pos.consensusConfidence,
        effectiveBankroll,
        otherExposure,
      ) / effectiveBankroll;

      const drift = Math.abs(currentWeight - kellyTarget);
      if (drift > REBALANCE_DRIFT_THRESHOLD) return true;
    }

    return false;
  }

  /**
   * Return concrete rebalance actions for every position that has drifted.
   */
  getRebalanceActions(
    positions: BotPosition[],
    bankroll: number,
  ): PortfolioAllocation[] {
    const config = getConfig();
    const effectiveBankroll = bankroll > 0 ? bankroll : config.bot.bankroll;
    const totalExposure = positions.reduce((sum, p) => sum + p.costBasis, 0);
    const actions: PortfolioAllocation[] = [];

    for (const pos of positions) {
      const currentWeight = pos.costBasis / effectiveBankroll;
      const otherExposure = totalExposure - pos.costBasis;
      const edge = Math.abs(pos.currentPrice - pos.entryPrice);

      const optimalDollars = this.calculateOptimalSize(
        edge,
        pos.consensusConfidence,
        effectiveBankroll,
        otherExposure,
      );
      const targetWeight = clamp(optimalDollars / effectiveBankroll, 0, MAX_WEIGHT_PER_POSITION);

      const drift = targetWeight - currentWeight;

      let action: PortfolioAllocation['action'];
      let reason: string;

      if (targetWeight < MIN_POSITION_WEIGHT) {
        action = 'exit';
        reason = `Target weight ${(targetWeight * 100).toFixed(2)}% below minimum; recommend full exit`;
      } else if (Math.abs(drift) < REBALANCE_DRIFT_THRESHOLD) {
        action = 'hold';
        reason = `Drift ${(Math.abs(drift) * 100).toFixed(2)}% within tolerance`;
      } else if (drift > 0) {
        action = 'increase';
        reason = `Under-allocated by ${(drift * 100).toFixed(2)}%`;
      } else {
        action = 'decrease';
        reason = `Over-allocated by ${(Math.abs(drift) * 100).toFixed(2)}%`;
      }

      actions.push({
        tokenId: pos.tokenId,
        market: pos.marketId,
        currentWeight,
        targetWeight,
        action,
        adjustmentSize: Math.abs(drift) * effectiveBankroll,
        reason,
      });
    }

    return actions;
  }

  /**
   * Diversification score from 0 to 100.
   *
   * Scoring components:
   *   - Category spread: higher when positions span more categories (0-50 pts)
   *   - Concentration (Herfindahl): lower HHI is better (0-30 pts)
   *   - Position count: more positions (up to a point) improves score (0-20 pts)
   */
  getDiversificationScore(positions: BotPosition[]): number {
    if (positions.length === 0) return 0;

    const totalCost = positions.reduce((s, p) => s + p.costBasis, 0);
    if (totalCost === 0) return 0;

    // --- Category spread (0-50) ---
    const categories = new Set(positions.map((p) => p.category));
    // Score linearly: 1 category = 10, 5+ categories = 50
    const categoryScore = clamp((categories.size / 5) * 50, 10, 50);

    // --- Herfindahl-Hirschman Index for concentration (0-30) ---
    // HHI ranges from 1/n (perfectly diversified) to 1 (single position).
    const weights = positions.map((p) => p.costBasis / totalCost);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    // Perfect diversification for n positions: hhi = 1/n
    // Map HHI to a 0-30 score (lower HHI -> higher score)
    const minHhi = 1 / positions.length;
    const hhiNormalized = positions.length > 1
      ? clamp((1 - (hhi - minHhi) / (1 - minHhi)), 0, 1)
      : 0;
    const concentrationScore = hhiNormalized * 30;

    // --- Position count (0-20) ---
    // 1 position = 4 pts, 5+ positions = 20 pts
    const countScore = clamp((positions.length / 5) * 20, 4, 20);

    return Math.round(categoryScore + concentrationScore + countScore);
  }

  /**
   * Weighted expected return of the current portfolio.
   *
   * For each position, the expected return is approximated as:
   *   confidence * edge - (1 - confidence) * entryPrice
   * weighted by cost basis share.
   */
  getExpectedPortfolioReturn(positions: BotPosition[]): number {
    if (positions.length === 0) return 0;

    const totalCost = positions.reduce((s, p) => s + p.costBasis, 0);
    if (totalCost === 0) return 0;

    let weightedReturn = 0;
    for (const pos of positions) {
      const weight = pos.costBasis / totalCost;
      const edge = Math.abs(pos.currentPrice - pos.entryPrice);
      const conf = pos.consensusConfidence;

      // Expected return: P(win) * gain - P(loss) * loss
      // gain per dollar: (1 - entryPrice) / entryPrice  (payout is $1 on win)
      // loss per dollar: 1  (lose full stake)
      const gainRate = pos.entryPrice > 0 ? (1 - pos.entryPrice) / pos.entryPrice : 0;
      const expectedReturn = conf * gainRate - (1 - conf);

      weightedReturn += weight * expectedReturn;
    }

    return weightedReturn;
  }

  /**
   * Rank candidate trades by risk-adjusted score.
   *
   * Score = edge * confidence * agreement_ratio
   * Higher is better. Filters out candidates where shouldTrade is false.
   */
  rankCandidates(candidates: ConsensusResult[]): ConsensusResult[] {
    const scored = candidates
      .filter((c) => c.shouldTrade && c.edge > 0)
      .map((c) => {
        const agreementRatio = c.agreeCount / Math.max(c.decisions.length, 1);
        const score = c.edge * c.averageConfidence * agreementRatio;
        return { candidate: c, score };
      });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.candidate);
  }

  // ---- Private helpers ----

  /**
   * Build a map of category -> weight (fraction of bankroll).
   */
  private buildCategoryWeights(
    positions: BotPosition[],
    bankroll: number,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const pos of positions) {
      const cat = pos.category || 'unknown';
      const current = map.get(cat) ?? 0;
      map.set(cat, current + pos.costBasis / bankroll);
    }
    return map;
  }

  /**
   * Estimate portfolio risk as the standard deviation of per-position
   * expected returns, weighted by cost basis.
   */
  private estimatePortfolioRisk(
    positions: BotPosition[],
    bankroll: number,
  ): number {
    if (positions.length < 2) return 0;

    const returns = positions.map((pos) => {
      const conf = pos.consensusConfidence;
      const gainRate = pos.entryPrice > 0 ? (1 - pos.entryPrice) / pos.entryPrice : 0;
      return conf * gainRate - (1 - conf);
    });

    return stddev(returns);
  }

  /**
   * Try to extract a category string from a ConsensusResult.
   * Falls back to 'unknown' if no category metadata is available.
   */
  private extractCategory(candidate: ConsensusResult): string {
    for (const decision of candidate.decisions) {
      const meta = decision.metadata as Record<string, unknown> | undefined;
      if (meta && typeof meta.category === 'string') {
        return meta.category;
      }
    }
    return 'unknown';
  }
}

// ============================================================
// Singleton via globalThis
// ============================================================

const GLOBAL_KEY = '__portfolioOptimizer' as const;

export function getPortfolioOptimizer(): PortfolioOptimizer {
  const g = globalThis as unknown as Record<string, PortfolioOptimizer>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new PortfolioOptimizer();
  }
  return g[GLOBAL_KEY];
}

export const portfolioOptimizer = getPortfolioOptimizer();

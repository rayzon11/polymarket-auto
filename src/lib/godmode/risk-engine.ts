import type { BotPosition, Side } from '@/lib/agents/types';
import { getPolymarketClient } from '@/lib/polymarket/client';
import { getConfig } from '@/lib/config';

// ============================================================
// Risk Management Engine — Real-Time Risk Monitoring
// ============================================================

// --- Interfaces ---

export interface RiskMetrics {
  totalExposure: number;
  maxDrawdown: number;
  currentDrawdown: number;
  var95: number;
  var99: number;
  sharpeRatio: number;
  sortinoRatio: number;
  correlationRisk: number;
  concentrationRisk: number;
  liquidityRisk: number;
  overallRiskScore: number;
}

export type RiskAlertLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface RiskAlert {
  level: RiskAlertLevel;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: string;
}

interface PreTradeResult {
  allowed: boolean;
  reason: string;
  adjustedSize: number;
}

interface RiskLimits {
  maxExposure: number;
  maxSinglePosition: number;
  maxDrawdown: number;
  maxCorrelation: number;
}

// --- Constants ---

const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxExposure: 0.25,
  maxSinglePosition: 0.05,
  maxDrawdown: 0.15,
  maxCorrelation: 0.7,
};

/** Annualized risk-free rate (US T-bill proxy) */
const RISK_FREE_RATE = 0.05;

/** Assumed daily return volatility for prediction markets */
const BASE_DAILY_VOL = 0.03;

/** Number of trading days for annualization */
const TRADING_DAYS = 365;

// ============================================================
// Risk Engine
// ============================================================

export class RiskEngine {
  private alerts: RiskAlert[] = [];
  private limits: RiskLimits;
  private peakBankroll: number;

  constructor(limits?: Partial<RiskLimits>) {
    const config = getConfig();
    this.limits = {
      maxExposure: limits?.maxExposure ?? config.bot.maxExposure ?? DEFAULT_RISK_LIMITS.maxExposure,
      maxSinglePosition: limits?.maxSinglePosition ?? config.bot.maxSinglePosition ?? DEFAULT_RISK_LIMITS.maxSinglePosition,
      maxDrawdown: limits?.maxDrawdown ?? DEFAULT_RISK_LIMITS.maxDrawdown,
      maxCorrelation: limits?.maxCorrelation ?? DEFAULT_RISK_LIMITS.maxCorrelation,
    };
    this.peakBankroll = config.bot.bankroll;
  }

  // ============================================================
  // Full Risk Snapshot
  // ============================================================

  async calculateRiskMetrics(
    positions: BotPosition[],
    bankroll: number,
  ): Promise<RiskMetrics> {
    this.alerts = [];

    if (bankroll > this.peakBankroll) {
      this.peakBankroll = bankroll;
    }

    const totalExposure = this.getTotalExposure(positions, bankroll);
    const currentDrawdown = this.getCurrentDrawdown(bankroll);
    const maxDrawdown = Math.max(currentDrawdown, this.limits.maxDrawdown);
    const var95 = this.calculateVaR(positions, 0.95);
    const var99 = this.calculateVaR(positions, 0.99);
    const sharpeRatio = this.calculateSharpe(positions, bankroll);
    const sortinoRatio = this.calculateSortino(positions, bankroll);
    const correlationRisk = this.getCorrelationRisk(positions);
    const concentrationRisk = this.getConcentrationRisk(positions);

    let liquidityRisk = 0;
    if (positions.length > 0) {
      const liquidityScores = await Promise.all(
        positions.map((p) => this.getLiquidityRisk(p.tokenId)),
      );
      liquidityRisk = liquidityScores.reduce((sum, s) => sum + s, 0) / liquidityScores.length;
    }

    // Composite risk score: weighted blend of normalized components [0..1]
    const overallRiskScore = this.computeOverallRisk({
      totalExposure,
      currentDrawdown,
      var99,
      correlationRisk,
      concentrationRisk,
      liquidityRisk,
      bankroll,
    });

    // Emit alerts for threshold breaches
    this.checkThresholds({
      totalExposure,
      currentDrawdown,
      concentrationRisk,
      correlationRisk,
      liquidityRisk,
      overallRiskScore,
    });

    return {
      totalExposure,
      maxDrawdown,
      currentDrawdown,
      var95,
      var99,
      sharpeRatio,
      sortinoRatio,
      correlationRisk,
      concentrationRisk,
      liquidityRisk,
      overallRiskScore,
    };
  }

  // ============================================================
  // Pre-Trade Risk Gate
  // ============================================================

  async checkPreTradeRisk(
    tokenId: string,
    side: Side,
    size: number,
    price: number,
    positions: BotPosition[],
    bankroll: number,
  ): Promise<PreTradeResult> {
    const notional = size * price;
    const currentExposure = this.getTotalExposure(positions, bankroll);
    const newExposure = currentExposure + notional / bankroll;

    // 1. Portfolio exposure limit
    if (newExposure > this.limits.maxExposure) {
      const headroom = Math.max(0, this.limits.maxExposure - currentExposure) * bankroll;
      const adjustedSize = headroom > 0 ? Math.floor(headroom / price) : 0;
      if (adjustedSize <= 0) {
        return {
          allowed: false,
          reason: `Portfolio exposure would reach ${(newExposure * 100).toFixed(1)}%, exceeding limit of ${(this.limits.maxExposure * 100).toFixed(0)}%`,
          adjustedSize: 0,
        };
      }
      return {
        allowed: true,
        reason: `Size reduced from ${size} to ${adjustedSize} to stay within exposure limit`,
        adjustedSize,
      };
    }

    // 2. Single position concentration limit
    const singleExposure = notional / bankroll;
    if (singleExposure > this.limits.maxSinglePosition) {
      const maxNotional = this.limits.maxSinglePosition * bankroll;
      const adjustedSize = Math.floor(maxNotional / price);
      if (adjustedSize <= 0) {
        return {
          allowed: false,
          reason: `Single position would be ${(singleExposure * 100).toFixed(1)}% of bankroll, exceeding ${(this.limits.maxSinglePosition * 100).toFixed(0)}% limit`,
          adjustedSize: 0,
        };
      }
      return {
        allowed: true,
        reason: `Size reduced from ${size} to ${adjustedSize} to meet single position limit`,
        adjustedSize,
      };
    }

    // 3. Drawdown circuit breaker
    const dd = this.getCurrentDrawdown(bankroll);
    if (dd >= this.limits.maxDrawdown) {
      return {
        allowed: false,
        reason: `Drawdown at ${(dd * 100).toFixed(1)}% has hit the ${(this.limits.maxDrawdown * 100).toFixed(0)}% circuit breaker — no new trades`,
        adjustedSize: 0,
      };
    }

    // 4. Liquidity sanity check
    const liqRisk = await this.getLiquidityRisk(tokenId);
    if (liqRisk > 0.8) {
      const adjustedSize = Math.floor(size * 0.5);
      if (adjustedSize <= 0) {
        return {
          allowed: false,
          reason: 'Insufficient orderbook liquidity for this token',
          adjustedSize: 0,
        };
      }
      return {
        allowed: true,
        reason: `High liquidity risk (${(liqRisk * 100).toFixed(0)}%) — size halved to ${adjustedSize}`,
        adjustedSize,
      };
    }

    return { allowed: true, reason: 'All pre-trade checks passed', adjustedSize: size };
  }

  // ============================================================
  // Kelly-Based Max Position Sizing
  // ============================================================

  getMaxPositionSize(
    tokenId: string,
    price: number,
    positions: BotPosition[],
    bankroll: number,
  ): number {
    const config = getConfig();
    const kellyCap = config.bot.kellyCap ?? 0.05;

    // Existing position notional for this token
    const existingNotional = positions
      .filter((p) => p.tokenId === tokenId && p.status === 'open')
      .reduce((sum, p) => sum + p.size * p.entryPrice, 0);

    // Current aggregate exposure
    const currentExposure = this.getTotalExposure(positions, bankroll);
    const exposureHeadroom = Math.max(0, this.limits.maxExposure - currentExposure) * bankroll;

    // Single position headroom (total allowed minus existing in this token)
    const singlePositionBudget = this.limits.maxSinglePosition * bankroll - existingNotional;

    // Half-Kelly sizing: f* = (p*b - q) / b, then halve for safety
    // For binary markets: b = (1/price - 1), p = implied prob adjusted by edge
    const impliedProb = price;
    const edge = config.bot.minEdge;
    const estimatedTrueProb = Math.min(0.95, impliedProb + edge);
    const b = price > 0 && price < 1 ? (1 / price - 1) : 1;
    const q = 1 - estimatedTrueProb;
    const kellyFraction = (estimatedTrueProb * b - q) / b;
    const halfKelly = Math.max(0, kellyFraction * 0.5);

    // Kelly-derived notional, capped at kellyCap fraction of bankroll
    const kellyNotional = Math.min(halfKelly, kellyCap) * bankroll;

    // The binding constraint wins
    const maxNotional = Math.max(0, Math.min(kellyNotional, singlePositionBudget, exposureHeadroom));

    // Convert notional to share count
    return price > 0 ? Math.floor(maxNotional / price) : 0;
  }

  // ============================================================
  // Value at Risk (Parametric)
  // ============================================================

  calculateVaR(positions: BotPosition[], confidence: 0.95 | 0.99): number {
    if (positions.length === 0) return 0;

    // z-scores for normal distribution
    const zScore = confidence === 0.99 ? 2.326 : 1.645;

    // Per-position VaR using price-based volatility estimate
    const positionVars = positions
      .filter((p) => p.status === 'open')
      .map((p) => {
        const notional = p.size * p.currentPrice;
        // Volatility scales with distance from 0.5 (binary option property)
        const priceDist = Math.abs(p.currentPrice - 0.5);
        const adjustedVol = BASE_DAILY_VOL * (1 + priceDist * 2);
        return notional * adjustedVol * zScore;
      });

    if (positionVars.length === 0) return 0;

    // Portfolio VaR with diversification: assume average pairwise correlation of 0.3
    const avgCorrelation = 0.3;
    const sumVarSquared = positionVars.reduce((sum, v) => sum + v * v, 0);

    let crossTerms = 0;
    for (let i = 0; i < positionVars.length; i++) {
      for (let j = i + 1; j < positionVars.length; j++) {
        crossTerms += 2 * avgCorrelation * positionVars[i] * positionVars[j];
      }
    }

    return Math.sqrt(sumVarSquared + crossTerms);
  }

  // ============================================================
  // Concentration Risk (Herfindahl-Hirschman Index)
  // ============================================================

  getConcentrationRisk(positions: BotPosition[]): number {
    const openPositions = positions.filter((p) => p.status === 'open');
    if (openPositions.length === 0) return 0;

    const totalNotional = openPositions.reduce(
      (sum, p) => sum + p.size * p.currentPrice,
      0,
    );

    if (totalNotional === 0) return 0;

    // HHI: sum of squared market shares, normalized to [0, 1]
    const hhi = openPositions.reduce((sum, p) => {
      const share = (p.size * p.currentPrice) / totalNotional;
      return sum + share * share;
    }, 0);

    // Normalize: HHI ranges from 1/n (perfectly diversified) to 1 (single position)
    // Map to [0, 1] where 0 = perfectly diversified, 1 = single holding
    const n = openPositions.length;
    const minHHI = 1 / n;
    if (n <= 1) return 1;

    return (hhi - minHHI) / (1 - minHHI);
  }

  // ============================================================
  // Liquidity Risk (Orderbook Depth)
  // ============================================================

  async getLiquidityRisk(tokenId: string): Promise<number> {
    try {
      const client = getPolymarketClient();
      const ob = await client.getOrderBook(tokenId);

      const bidDepth = ob.bidVolume;
      const askDepth = ob.askVolume;
      const totalDepth = bidDepth + askDepth;

      // Thresholds for depth scoring
      // < $500 total depth = very illiquid (risk ~1.0)
      // > $10,000 = liquid (risk ~0.0)
      const ILLIQUID_THRESHOLD = 500;
      const LIQUID_THRESHOLD = 10_000;

      if (totalDepth <= 0) return 1;
      if (totalDepth >= LIQUID_THRESHOLD) return 0;
      if (totalDepth <= ILLIQUID_THRESHOLD) return 1;

      // Linear interpolation between thresholds
      const depthScore = 1 - (totalDepth - ILLIQUID_THRESHOLD) / (LIQUID_THRESHOLD - ILLIQUID_THRESHOLD);

      // Spread penalty: wide spread = higher risk
      const spreadPenalty = Math.min(1, ob.spread / 0.10); // 10-cent spread = max penalty

      // Imbalance penalty: heavily one-sided book
      const imbalancePenalty = Math.abs(ob.imbalance) * 0.3;

      return Math.min(1, depthScore * 0.5 + spreadPenalty * 0.3 + imbalancePenalty * 0.2);
    } catch {
      // If we cannot reach the orderbook, assume moderate risk
      return 0.5;
    }
  }

  // ============================================================
  // Correlation Matrix (Simplified Category-Based)
  // ============================================================

  getCorrelationMatrix(
    positions: BotPosition[],
  ): { matrix: number[][]; labels: string[] } {
    const openPositions = positions.filter((p) => p.status === 'open');
    if (openPositions.length === 0) return { matrix: [], labels: [] };

    const labels = openPositions.map(
      (p) => `${p.outcome}@${p.marketId.slice(0, 8)}`,
    );
    const n = openPositions.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1;
          continue;
        }

        let corr = 0;

        // Same market = high correlation
        if (openPositions[i].marketId === openPositions[j].marketId) {
          // Complementary outcomes within same market are negatively correlated
          corr = openPositions[i].outcome === openPositions[j].outcome ? 0.95 : -0.90;
        }
        // Same category = moderate correlation
        else if (openPositions[i].category === openPositions[j].category) {
          corr = 0.4;
        }
        // Same directional signal = mild positive correlation
        else if (openPositions[i].signal === openPositions[j].signal) {
          corr = 0.15;
        }
        // Default: near-zero correlation
        else {
          corr = 0.05;
        }

        matrix[i][j] = corr;
      }
    }

    return { matrix, labels };
  }

  // ============================================================
  // Risk Alerts
  // ============================================================

  getRiskAlerts(): RiskAlert[] {
    return [...this.alerts];
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private getTotalExposure(positions: BotPosition[], bankroll: number): number {
    if (bankroll <= 0) return 0;
    const totalNotional = positions
      .filter((p) => p.status === 'open')
      .reduce((sum, p) => sum + p.size * p.currentPrice, 0);
    return totalNotional / bankroll;
  }

  private getCurrentDrawdown(bankroll: number): number {
    if (this.peakBankroll <= 0) return 0;
    return Math.max(0, (this.peakBankroll - bankroll) / this.peakBankroll);
  }

  private calculateSharpe(positions: BotPosition[], bankroll: number): number {
    const returns = this.getPositionReturns(positions);
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;

    // Annualize
    const annualizedReturn = avgReturn * TRADING_DAYS;
    const annualizedStdDev = stdDev * Math.sqrt(TRADING_DAYS);

    return (annualizedReturn - RISK_FREE_RATE) / annualizedStdDev;
  }

  private calculateSortino(positions: BotPosition[], bankroll: number): number {
    const returns = this.getPositionReturns(positions);
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;

    // Downside deviation: only negative returns
    const negativeReturns = returns.filter((r) => r < 0);
    if (negativeReturns.length === 0) return avgReturn > 0 ? Infinity : 0;

    const downsideVariance =
      negativeReturns.reduce((s, r) => s + r * r, 0) / negativeReturns.length;
    const downsideDev = Math.sqrt(downsideVariance);
    if (downsideDev === 0) return 0;

    const annualizedReturn = avgReturn * TRADING_DAYS;
    const annualizedDownside = downsideDev * Math.sqrt(TRADING_DAYS);

    return (annualizedReturn - RISK_FREE_RATE) / annualizedDownside;
  }

  private getPositionReturns(positions: BotPosition[]): number[] {
    return positions
      .filter((p) => p.status === 'open' && p.entryPrice > 0)
      .map((p) => (p.currentPrice - p.entryPrice) / p.entryPrice);
  }

  private getCorrelationRisk(positions: BotPosition[]): number {
    const { matrix } = this.getCorrelationMatrix(positions);
    if (matrix.length <= 1) return 0;

    // Average absolute off-diagonal correlation
    let totalCorr = 0;
    let count = 0;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = i + 1; j < matrix.length; j++) {
        totalCorr += Math.abs(matrix[i][j]);
        count++;
      }
    }

    return count > 0 ? totalCorr / count : 0;
  }

  private computeOverallRisk(params: {
    totalExposure: number;
    currentDrawdown: number;
    var99: number;
    correlationRisk: number;
    concentrationRisk: number;
    liquidityRisk: number;
    bankroll: number;
  }): number {
    const {
      totalExposure,
      currentDrawdown,
      var99,
      correlationRisk,
      concentrationRisk,
      liquidityRisk,
      bankroll,
    } = params;

    // Normalize each component to [0, 1]
    const exposureScore = Math.min(1, totalExposure / this.limits.maxExposure);
    const drawdownScore = Math.min(1, currentDrawdown / this.limits.maxDrawdown);
    const varScore = bankroll > 0 ? Math.min(1, var99 / (bankroll * 0.1)) : 0;
    const corrScore = Math.min(1, correlationRisk / this.limits.maxCorrelation);

    // Weighted composite
    return (
      exposureScore * 0.25 +
      drawdownScore * 0.25 +
      varScore * 0.15 +
      corrScore * 0.10 +
      concentrationRisk * 0.15 +
      liquidityRisk * 0.10
    );
  }

  private checkThresholds(metrics: {
    totalExposure: number;
    currentDrawdown: number;
    concentrationRisk: number;
    correlationRisk: number;
    liquidityRisk: number;
    overallRiskScore: number;
  }): void {
    const now = new Date().toISOString();

    // Exposure
    if (metrics.totalExposure >= this.limits.maxExposure) {
      this.pushAlert('CRITICAL', 'Portfolio exposure at maximum', 'totalExposure', metrics.totalExposure, this.limits.maxExposure, now);
    } else if (metrics.totalExposure >= this.limits.maxExposure * 0.8) {
      this.pushAlert('WARNING', 'Portfolio exposure approaching limit', 'totalExposure', metrics.totalExposure, this.limits.maxExposure, now);
    }

    // Drawdown
    if (metrics.currentDrawdown >= this.limits.maxDrawdown) {
      this.pushAlert('CRITICAL', 'Maximum drawdown breached — trading halted', 'currentDrawdown', metrics.currentDrawdown, this.limits.maxDrawdown, now);
    } else if (metrics.currentDrawdown >= this.limits.maxDrawdown * 0.7) {
      this.pushAlert('WARNING', 'Drawdown approaching circuit breaker', 'currentDrawdown', metrics.currentDrawdown, this.limits.maxDrawdown, now);
    }

    // Concentration
    if (metrics.concentrationRisk > 0.8) {
      this.pushAlert('WARNING', 'Portfolio highly concentrated — diversify', 'concentrationRisk', metrics.concentrationRisk, 0.8, now);
    }

    // Correlation
    if (metrics.correlationRisk > this.limits.maxCorrelation) {
      this.pushAlert('WARNING', 'High inter-position correlation detected', 'correlationRisk', metrics.correlationRisk, this.limits.maxCorrelation, now);
    }

    // Liquidity
    if (metrics.liquidityRisk > 0.7) {
      this.pushAlert('WARNING', 'Elevated liquidity risk across positions', 'liquidityRisk', metrics.liquidityRisk, 0.7, now);
    }

    // Overall
    if (metrics.overallRiskScore > 0.85) {
      this.pushAlert('CRITICAL', 'Overall risk score critically elevated', 'overallRiskScore', metrics.overallRiskScore, 0.85, now);
    } else if (metrics.overallRiskScore > 0.6) {
      this.pushAlert('INFO', 'Overall risk score elevated — monitor closely', 'overallRiskScore', metrics.overallRiskScore, 0.6, now);
    }
  }

  private pushAlert(
    level: RiskAlertLevel,
    message: string,
    metric: string,
    value: number,
    threshold: number,
    timestamp: string,
  ): void {
    this.alerts.push({ level, message, metric, value, threshold, timestamp });
  }
}

// ============================================================
// Singleton via globalThis (survives Next.js hot reloads)
// ============================================================

const GLOBAL_KEY = '__risk_engine__';

export function getRiskEngine(): RiskEngine {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new RiskEngine();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

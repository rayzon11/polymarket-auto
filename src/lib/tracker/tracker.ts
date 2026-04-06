import {
  BotPosition,
  TradeRecord,
  BotAnalytics,
  AgentStats,
  AgentDecision,
  AgentName,
  AgentSignal,
  CalibrationPoint,
  ConsensusResult,
  PolyMarket,
} from '@/lib/agents/types';
import { readJsonFile, writeJsonFile, appendLogLine } from './persistence';
import { v4 as uuidv4 } from 'uuid';

export class PositionTracker {
  private positions: BotPosition[] = [];
  private history: TradeRecord[] = [];
  private loaded = false;
  private skipReasons: Record<string, number> = {};

  async load(): Promise<void> {
    if (this.loaded) return;
    this.positions = await readJsonFile<BotPosition[]>('positions.json', []);
    this.history = await readJsonFile<TradeRecord[]>('history.json', []);
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await writeJsonFile('positions.json', this.positions);
    await writeJsonFile('history.json', this.history);
  }

  async openPosition(params: {
    marketId: string;
    tokenId: string;
    question: string;
    outcome: string;
    category: string;
    signal: AgentSignal;
    entryPrice: number;
    size: number;
    agentDecisions: AgentDecision[];
    oracleReasoning: string;
    consensusConfidence: number;
    resolvesAt: string;
  }): Promise<BotPosition> {
    await this.load();

    const position: BotPosition = {
      id: uuidv4(),
      marketId: params.marketId,
      tokenId: params.tokenId,
      question: params.question,
      outcome: params.outcome,
      category: params.category,
      side: 'BUY',
      signal: params.signal,
      entryPrice: params.entryPrice,
      currentPrice: params.entryPrice,
      size: params.size,
      costBasis: params.size * params.entryPrice,
      unrealizedPnl: 0,
      agentDecisions: params.agentDecisions,
      oracleReasoning: params.oracleReasoning,
      consensusConfidence: params.consensusConfidence,
      openedAt: new Date().toISOString(),
      resolvesAt: params.resolvesAt,
      status: 'open',
    };

    this.positions.push(position);
    await this.save();
    return position;
  }

  async closePosition(
    id: string,
    exitPrice: number,
    resolved = false,
    won = false,
  ): Promise<TradeRecord | null> {
    await this.load();

    const idx = this.positions.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    const pos = this.positions[idx];
    const holdMs = Date.now() - new Date(pos.openedAt).getTime();

    const pnl = pos.signal === 'BUY_YES'
      ? (exitPrice - pos.entryPrice) * pos.size
      : (pos.entryPrice - exitPrice) * pos.size;

    const record: TradeRecord = {
      ...pos,
      exitPrice,
      realizedPnl: pnl,
      closedAt: new Date().toISOString(),
      resolved,
      won: resolved ? won : pnl > 0,
      holdHours: holdMs / (1000 * 60 * 60),
      status: resolved ? 'resolved' : 'closed',
    };

    this.positions.splice(idx, 1);
    this.history.push(record);
    await this.save();
    return record;
  }

  async updatePrice(id: string, currentPrice: number): Promise<void> {
    await this.load();

    const pos = this.positions.find((p) => p.id === id);
    if (!pos) return;

    pos.currentPrice = currentPrice;
    pos.unrealizedPnl = pos.signal === 'BUY_YES'
      ? (currentPrice - pos.entryPrice) * pos.size
      : (pos.entryPrice - currentPrice) * pos.size;
  }

  async updateAllPrices(priceMap: Map<string, number>): Promise<void> {
    await this.load();
    for (const pos of this.positions) {
      const price = priceMap.get(pos.tokenId);
      if (price !== undefined) {
        pos.currentPrice = price;
        pos.unrealizedPnl = pos.signal === 'BUY_YES'
          ? (price - pos.entryPrice) * pos.size
          : (pos.entryPrice - price) * pos.size;
      }
    }
    await this.save();
  }

  async getPositions(): Promise<BotPosition[]> {
    await this.load();
    return [...this.positions];
  }

  async getPosition(id: string): Promise<BotPosition | null> {
    await this.load();
    return this.positions.find((p) => p.id === id) || null;
  }

  async getHistory(limit = 100, offset = 0): Promise<TradeRecord[]> {
    await this.load();
    return this.history.slice(-limit - offset, this.history.length - offset);
  }

  async getTotalExposure(): Promise<number> {
    await this.load();
    return this.positions.reduce((sum, p) => sum + p.costBasis, 0);
  }

  async getAnalytics(): Promise<BotAnalytics> {
    await this.load();

    const closedTrades = this.history;
    const wins = closedTrades.filter((t) => t.won);
    const losses = closedTrades.filter((t) => !t.won);

    const totalPnl = closedTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const unrealizedPnl = this.positions.reduce((s, p) => s + p.unrealizedPnl, 0);

    // Sharpe ratio (annualized, assuming daily returns)
    const returns = closedTrades.map((t) => t.realizedPnl / Math.max(t.costBasis, 1));
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
      : 1;
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(365) : 0;

    // Max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumPnl = 0;
    for (const t of closedTrades) {
      cumPnl += t.realizedPnl;
      peak = Math.max(peak, cumPnl);
      maxDrawdown = Math.max(maxDrawdown, peak - cumPnl);
    }

    // Best/worst category
    const catPnl: Record<string, number> = {};
    for (const t of closedTrades) {
      catPnl[t.category] = (catPnl[t.category] || 0) + t.realizedPnl;
    }
    const sortedCats = Object.entries(catPnl).sort((a, b) => b[1] - a[1]);

    // Agent stats
    const agentStats = this.computeAgentStats(closedTrades);

    return {
      totalPnl: totalPnl + unrealizedPnl,
      unrealizedPnl,
      realizedPnl: totalPnl,
      winRate: closedTrades.length > 0 ? wins.length / closedTrades.length : 0,
      totalTrades: closedTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      openPositions: this.positions.length,
      avgEdgeCaptured: closedTrades.length > 0
        ? closedTrades.reduce((s, t) => s + Math.abs(t.exitPrice - t.entryPrice), 0) / closedTrades.length
        : 0,
      sharpeRatio,
      maxDrawdown,
      avgHoldHours: closedTrades.length > 0
        ? closedTrades.reduce((s, t) => s + t.holdHours, 0) / closedTrades.length
        : 0,
      bestCategory: sortedCats[0]?.[0] || 'N/A',
      worstCategory: sortedCats[sortedCats.length - 1]?.[0] || 'N/A',
      agentStats,
      tradesSkipped: Object.values(this.skipReasons).reduce((a, b) => a + b, 0),
      skipReasons: { ...this.skipReasons },
    };
  }

  private computeAgentStats(closedTrades: TradeRecord[]): AgentStats[] {
    const agents: AgentName[] = ['scout', 'analyst', 'strategist', 'quant', 'oracle'];
    const levels: Record<AgentName, number> = { scout: 1, analyst: 2, strategist: 3, quant: 4, oracle: 5 };

    return agents.map((name) => {
      let totalSignals = 0;
      let buyYesCount = 0;
      let buyNoCount = 0;
      let holdCount = 0;
      let correctPredictions = 0;
      let totalConfidence = 0;
      let brierSum = 0;

      for (const trade of closedTrades) {
        const decision = trade.agentDecisions.find((d) => d.agent === name);
        if (!decision) continue;
        totalSignals++;
        totalConfidence += decision.confidence;

        if (decision.signal === 'BUY_YES') buyYesCount++;
        else if (decision.signal === 'BUY_NO') buyNoCount++;
        else holdCount++;

        // Check if agent's signal aligned with outcome
        if (
          (decision.signal === 'BUY_YES' && trade.won && trade.signal === 'BUY_YES') ||
          (decision.signal === 'BUY_NO' && trade.won && trade.signal === 'BUY_NO') ||
          (decision.signal === trade.signal && trade.won)
        ) {
          correctPredictions++;
        }

        // Brier score component
        const predicted = decision.targetPrice ?? (decision.signal === 'BUY_YES' ? 0.7 : 0.3);
        const actual = trade.won ? 1 : 0;
        brierSum += (predicted - actual) ** 2;
      }

      return {
        name,
        level: levels[name],
        totalSignals,
        buyYesCount,
        buyNoCount,
        holdCount,
        avgConfidence: totalSignals > 0 ? totalConfidence / totalSignals : 0,
        accuracy: totalSignals > 0 ? correctPredictions / totalSignals : 0,
        brierScore: totalSignals > 0 ? brierSum / totalSignals : 0.25,
        contributionScore: totalSignals > 0
          ? (correctPredictions / totalSignals) * levels[name]
          : 0,
      };
    });
  }

  async getCalibration(): Promise<CalibrationPoint[]> {
    await this.load();

    const buckets: Record<number, { predicted: number; actual: number; count: number }> = {};
    for (let i = 0; i <= 10; i++) {
      buckets[i] = { predicted: i / 10, actual: 0, count: 0 };
    }

    for (const trade of this.history) {
      const oracleDecision = trade.agentDecisions.find((d) => d.agent === 'oracle');
      const predicted = oracleDecision?.targetPrice ?? trade.entryPrice;
      const bucket = Math.round(predicted * 10);
      const clamped = Math.max(0, Math.min(10, bucket));
      buckets[clamped].count++;
      buckets[clamped].actual += trade.won ? 1 : 0;
    }

    return Object.values(buckets)
      .filter((b) => b.count > 0)
      .map((b) => ({
        predictedProbability: b.predicted,
        actualFrequency: b.actual / b.count,
        count: b.count,
      }));
  }

  async getLeaderboard(): Promise<AgentStats[]> {
    const analytics = await this.getAnalytics();
    return [...analytics.agentStats].sort((a, b) => b.contributionScore - a.contributionScore);
  }

  recordSkip(reason: string): void {
    this.skipReasons[reason] = (this.skipReasons[reason] || 0) + 1;
  }

  async logDecision(consensus: ConsensusResult, market: PolyMarket): Promise<void> {
    const logEntry = {
      timestamp: consensus.timestamp,
      market: market.question.slice(0, 100),
      marketId: market.conditionId,
      shouldTrade: consensus.shouldTrade,
      signal: consensus.signal,
      confidence: consensus.averageConfidence,
      edge: consensus.edge,
      agreeCount: consensus.agreeCount,
      positionSize: consensus.positionSize,
      rules: consensus.ruleResults,
      reasons: consensus.reasons,
    };
    await appendLogLine('decisions.log', JSON.stringify(logEntry));
  }

  exportCsv(): string {
    const headers = [
      'id', 'market', 'signal', 'entry_price', 'exit_price', 'size',
      'pnl', 'won', 'hold_hours', 'category', 'confidence', 'opened_at', 'closed_at',
    ].join(',');

    const rows = this.history.map((t) =>
      [
        t.id,
        `"${t.question.replace(/"/g, '""')}"`,
        t.signal,
        t.entryPrice.toFixed(4),
        t.exitPrice.toFixed(4),
        t.size.toFixed(2),
        t.realizedPnl.toFixed(2),
        t.won,
        t.holdHours.toFixed(1),
        t.category,
        t.consensusConfidence.toFixed(3),
        t.openedAt,
        t.closedAt,
      ].join(',')
    );

    return [headers, ...rows].join('\n');
  }
}

// Singleton
const GLOBAL_KEY = '__position_tracker__';

export function getTracker(): PositionTracker {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new PositionTracker();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

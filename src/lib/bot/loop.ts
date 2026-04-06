import { getConfig } from '@/lib/config';
import { BotStatus, PolyMarket, PolyOrderBook, TradingAgent } from '@/lib/agents/types';
import { getPolymarketClient } from '@/lib/polymarket/client';
import { getNewsFetcher } from '@/lib/news/fetcher';
import { filterAndRankMarkets } from '@/lib/market-filter';
import { evaluateConsensus } from '@/lib/bot/consensus';
import { getTracker } from '@/lib/tracker/tracker';
import { getBotEventEmitter } from '@/lib/bot/events';
import { ScoutAgent } from '@/lib/agents/scout';
import { AnalystAgent } from '@/lib/agents/analyst';
import { StrategistAgent } from '@/lib/agents/strategist';
import { QuantAgent } from '@/lib/agents/quant';
import { OracleAgent } from '@/lib/agents/oracle';

export class TradingLoop {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private abortController: AbortController | null = null;
  private tickCount = 0;
  private tradesExecuted = 0;
  private tradesSkipped = 0;
  private errors = 0;
  private startedAt: string | null = null;
  private lastTickAt: string | null = null;

  private agents: TradingAgent[] = [
    new ScoutAgent(),
    new AnalystAgent(),
    new StrategistAgent(),
    new QuantAgent(),
    new OracleAgent(),
  ];

  start(): void {
    if (this.running) return;

    const config = getConfig();
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.abortController = new AbortController();

    console.log(`[TradingLoop] Started (interval: ${config.bot.intervalMs}ms, dryRun: ${config.bot.dryRun})`);
    getBotEventEmitter().emitStatus({ action: 'started', dryRun: config.bot.dryRun });

    // Run first tick immediately
    this.tick().catch((err) => console.error('[TradingLoop] Initial tick error:', err));

    // Then on interval
    this.interval = setInterval(() => {
      if (!this.running) return;
      this.tick().catch((err) => console.error('[TradingLoop] Tick error:', err));
    }, config.bot.intervalMs);
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    console.log('[TradingLoop] Stopped');
    getBotEventEmitter().emitStatus({ action: 'stopped' });
  }

  async tick(): Promise<void> {
    const config = getConfig();
    const events = getBotEventEmitter();
    const tracker = getTracker();
    const polyClient = getPolymarketClient();
    const newsFetcher = getNewsFetcher();

    this.tickCount++;
    this.lastTickAt = new Date().toISOString();

    events.emitTick({ tickNumber: this.tickCount, timestamp: this.lastTickAt });
    console.log(`[TradingLoop] === Tick #${this.tickCount} ===`);

    try {
      // Step 1: Fetch markets
      const allMarkets = await polyClient.getMarkets(100);
      console.log(`[TradingLoop] Fetched ${allMarkets.length} markets`);

      // Step 2: Fetch orderbooks for markets (parallel, limited)
      const orderbookMap = new Map<string, PolyOrderBook>();
      const marketsWithTokens = allMarkets.filter((m) => m.tokens[0]?.tokenId);

      // Fetch orderbooks in batches of 10
      for (let i = 0; i < marketsWithTokens.length; i += 10) {
        const batch = marketsWithTokens.slice(i, i + 10);
        const results = await Promise.allSettled(
          batch.map((m) => polyClient.getOrderBook(m.tokens[0].tokenId))
        );
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            orderbookMap.set(batch[idx].tokens[0].tokenId, r.value);
          }
        });
      }

      // Step 3: Filter and rank
      const filterResults = filterAndRankMarkets(allMarkets, orderbookMap, config.bot.minMarketVolume);
      const candidates = filterResults.filter((r) => r.passed).slice(0, 5);
      console.log(`[TradingLoop] ${candidates.length} candidate markets after filter`);

      if (candidates.length === 0) {
        events.emitTick({ tickNumber: this.tickCount, candidates: 0, message: 'No qualifying markets' });
        return;
      }

      // Step 4: Analyze each candidate
      const openPositions = await tracker.getPositions();

      for (const candidate of candidates) {
        const market = candidate.market;
        const tokenId = market.tokens[0]?.tokenId;
        if (!tokenId) continue;

        const orderbook = orderbookMap.get(tokenId) || {
          market: market.conditionId,
          assetId: tokenId,
          bids: [],
          asks: [],
          spread: market.spread,
          midpoint: market.outcomePrices[0] ?? 0.5,
          bidVolume: 0,
          askVolume: 0,
          imbalance: 0,
        };

        try {
          // Fetch news for this market
          const news = await newsFetcher.fetchForMarket(market);

          // Run agents 1-4 in parallel
          const [scoutD, analystD, strategistD, quantD] = await Promise.all([
            this.agents[0].analyze(market, orderbook, news),
            this.agents[1].analyze(market, orderbook, news),
            this.agents[2].analyze(market, orderbook, news),
            this.agents[3].analyze(market, orderbook, news),
          ]);

          const baseDecisions = [scoutD, analystD, strategistD, quantD];

          // Emit signals
          for (const d of baseDecisions) {
            events.emitSignal({ market: market.question.slice(0, 80), ...d });
          }

          // Run Oracle (Agent 5) with other agents' results
          const oracleD = await this.agents[4].analyze(market, orderbook, news, baseDecisions);
          events.emitSignal({ market: market.question.slice(0, 80), ...oracleD });

          const allDecisions = [...baseDecisions, oracleD];

          // Evaluate consensus
          const consensus = evaluateConsensus(allDecisions, market, orderbook, openPositions, config);
          events.emitConsensus({
            market: market.question.slice(0, 80),
            shouldTrade: consensus.shouldTrade,
            signal: consensus.signal,
            confidence: consensus.averageConfidence,
            edge: consensus.edge,
            agreeCount: consensus.agreeCount,
          });

          // Log decision
          await tracker.logDecision(consensus, market);

          if (consensus.shouldTrade) {
            // Execute trade
            const yesPrice = market.outcomePrices[0] ?? 0.5;
            const tradePrice = consensus.signal === 'BUY_YES' ? yesPrice : 1 - yesPrice;
            const outcome = consensus.signal === 'BUY_YES' ? 'Yes' : 'No';
            const tradeTokenId = consensus.signal === 'BUY_YES'
              ? market.tokens[0]?.tokenId
              : market.tokens[1]?.tokenId || market.tokens[0]?.tokenId;

            const orderResult = await polyClient.placeOrder(
              tradeTokenId,
              'BUY',
              tradePrice,
              consensus.positionSize / tradePrice,
              market.conditionId,
            );

            if (orderResult.success) {
              const position = await tracker.openPosition({
                marketId: market.conditionId,
                tokenId: tradeTokenId,
                question: market.question,
                outcome,
                category: market.category,
                signal: consensus.signal,
                entryPrice: tradePrice,
                size: consensus.positionSize / tradePrice,
                agentDecisions: allDecisions,
                oracleReasoning: oracleD.reasoning,
                consensusConfidence: consensus.averageConfidence,
                resolvesAt: market.endDate,
              });

              events.emitTrade({
                positionId: position.id,
                market: market.question.slice(0, 80),
                signal: consensus.signal,
                price: tradePrice,
                size: consensus.positionSize,
                dryRun: orderResult.dryRun,
              });

              this.tradesExecuted++;
              console.log(`[TradingLoop] TRADE: ${consensus.signal} on "${market.question.slice(0, 60)}" @ ${tradePrice.toFixed(4)}`);
            }
          } else {
            this.tradesSkipped++;
            const primaryReason = consensus.reasons[0] || 'consensus_failed';
            tracker.recordSkip(primaryReason);
          }
        } catch (err) {
          this.errors++;
          console.error(`[TradingLoop] Error analyzing "${market.question.slice(0, 50)}":`, err);
          events.emitError({ market: market.question.slice(0, 80), error: String(err) });
        }
      }

      // Step 5: Update open position prices
      const priceMap = new Map<string, number>();
      for (const market of allMarkets) {
        for (const token of market.tokens) {
          if (token.tokenId) priceMap.set(token.tokenId, token.price);
        }
      }
      await tracker.updateAllPrices(priceMap);
      events.emitPositionUpdate({ updated: priceMap.size });

      // Step 6: Auto-close positions near resolution
      for (const pos of openPositions) {
        const hoursLeft = (new Date(pos.resolvesAt).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursLeft <= 0.5 && hoursLeft > 0) {
          // Auto-close within 30 min of resolution
          await tracker.closePosition(pos.id, pos.currentPrice);
          console.log(`[TradingLoop] Auto-closed position ${pos.id} (resolution imminent)`);
        }
      }

      events.emitStatus(this.getStatus());
    } catch (err) {
      this.errors++;
      console.error('[TradingLoop] Tick failed:', err);
      events.emitError({ error: String(err), tickNumber: this.tickCount });
    }
  }

  getStatus(): BotStatus {
    const config = getConfig();
    const started = this.startedAt ? new Date(this.startedAt).getTime() : Date.now();

    return {
      running: this.running,
      dryRun: config.bot.dryRun,
      tickCount: this.tickCount,
      tradesExecuted: this.tradesExecuted,
      tradesSkipped: this.tradesSkipped,
      errors: this.errors,
      lastTickAt: this.lastTickAt,
      nextTickAt: this.running && this.lastTickAt
        ? new Date(new Date(this.lastTickAt).getTime() + config.bot.intervalMs).toISOString()
        : null,
      intervalMs: config.bot.intervalMs,
      uptime: (Date.now() - started) / 1000,
      startedAt: this.startedAt,
    };
  }
}

// Singleton
const GLOBAL_KEY = '__trading_loop__';

export function getTradingLoop(): TradingLoop {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new TradingLoop();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

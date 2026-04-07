// ============================================================
// Arbitrage Scanner — Polymarket God-Mode Trading
// Detects mispriced markets, cross-market arb, and stale books
// ============================================================

import type { PolyMarket, PolyOrderBook } from '@/lib/agents/types';
import { getPolymarketClient } from '@/lib/polymarket/client';

// --- Types ---

export type ArbType = 'vig' | 'cross_market' | 'stale_book';

export interface ArbOpportunity {
  type: ArbType;
  marketA: PolyMarket;
  marketB?: PolyMarket;
  tokenId: string;
  currentPrice: number;
  fairPrice: number;
  edge: number;
  expectedProfit: number;
  confidence: number;
  timestamp: string;
}

// --- Constants ---

/** Minimum edge (in probability) to consider an opportunity actionable */
const MIN_EDGE_THRESHOLD = 0.01;

/** Maximum age (ms) before an opportunity is considered expired */
const OPPORTUNITY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** How far the Yes+No sum can deviate from 1.00 before we flag it */
const VIG_DEVIATION_THRESHOLD = 0.005;

/** Minimum tag overlap to consider two markets correlated */
const MIN_TAG_OVERLAP = 2;

/** Price discrepancy threshold for cross-market opportunities */
const CROSS_MARKET_PRICE_THRESHOLD = 0.03;

/** Staleness threshold: book hasn't moved but trade count is low */
const STALE_TRADE_COUNT_THRESHOLD = 10;

/** Default position size ($) for profit estimation */
const DEFAULT_POSITION_SIZE = 50;

// ============================================================
// ArbScanner
// ============================================================

export class ArbScanner {
  private opportunities: ArbOpportunity[] = [];
  private client = getPolymarketClient();

  // ----------------------------------------------------------
  // 1. Vig Arbitrage — Yes + No != 1.00
  // ----------------------------------------------------------
  // On Polymarket, a binary market's Yes and No prices should sum
  // to ~1.00. When the sum deviates, there is a vig arb:
  //   sum > 1.00 => sell both sides (overpriced market)
  //   sum < 1.00 => buy both sides (underpriced market, free edge)
  // ----------------------------------------------------------

  async scanMispricings(markets: PolyMarket[]): Promise<ArbOpportunity[]> {
    const found: ArbOpportunity[] = [];

    for (const market of markets) {
      if (!market.active || market.closed) continue;
      if (market.outcomePrices.length < 2) continue;

      const yesPrice = market.outcomePrices[0];
      const noPrice = market.outcomePrices[1];
      const sum = yesPrice + noPrice;
      const deviation = Math.abs(sum - 1.0);

      if (deviation <= VIG_DEVIATION_THRESHOLD) continue;

      // Determine direction and fair prices
      const fairYes = yesPrice / sum; // normalize to sum=1
      const fairNo = noPrice / sum;

      // The edge is the deviation itself: buying both sides when sum < 1
      // gives guaranteed profit of (1 - sum) per unit
      const edge = deviation;
      const expectedProfit = edge * DEFAULT_POSITION_SIZE;

      // Confidence is higher for larger deviations and more liquid markets
      const liquidityFactor = Math.min(market.liquidity / 50000, 1);
      const deviationFactor = Math.min(deviation / 0.05, 1);
      const confidence = 0.5 * deviationFactor + 0.5 * liquidityFactor;

      // Pick the mispriced token — if sum < 1, both are cheap (buy Yes);
      // if sum > 1, both are expensive (favor the more overpriced side)
      const yesToken = market.tokens.find((t) => t.outcome === 'Yes');
      const noToken = market.tokens.find((t) => t.outcome === 'No');

      if (sum < 1.0 && yesToken) {
        found.push({
          type: 'vig',
          marketA: market,
          tokenId: yesToken.tokenId,
          currentPrice: yesPrice,
          fairPrice: fairYes,
          edge,
          expectedProfit,
          confidence,
          timestamp: new Date().toISOString(),
        });
      }

      if (sum > 1.0 && noToken) {
        // When sum > 1, the No side is relatively cheaper to sell against
        found.push({
          type: 'vig',
          marketA: market,
          tokenId: noToken.tokenId,
          currentPrice: noPrice,
          fairPrice: fairNo,
          edge,
          expectedProfit,
          confidence,
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.mergeOpportunities(found);
    return found;
  }

  // ----------------------------------------------------------
  // 2. Cross-Market Arbitrage — Correlated events, inconsistent prices
  // ----------------------------------------------------------
  // Two markets covering related events should have consistent pricing.
  // Example: "Will X win the election?" at 0.70 while
  //          "Will X's party win?" is at 0.55 is inconsistent —
  //          the candidate winning implies the party wins.
  // We detect correlation via tag overlap and flag price gaps.
  // ----------------------------------------------------------

  async scanCrossMarket(markets: PolyMarket[]): Promise<ArbOpportunity[]> {
    const found: ArbOpportunity[] = [];
    const activeMarkets = markets.filter((m) => m.active && !m.closed);

    // Build tag index for efficient lookups
    const tagIndex = new Map<string, PolyMarket[]>();
    for (const market of activeMarkets) {
      for (const tag of market.tags) {
        if (!tagIndex.has(tag)) tagIndex.set(tag, []);
        tagIndex.get(tag)!.push(market);
      }
    }

    // Compare each pair of markets sharing enough tags
    const checked = new Set<string>();

    for (const market of activeMarkets) {
      // Gather all candidate correlated markets via shared tags
      const candidates = new Map<string, number>();
      for (const tag of market.tags) {
        const peers = tagIndex.get(tag) || [];
        for (const peer of peers) {
          if (peer.conditionId === market.conditionId) continue;
          candidates.set(
            peer.conditionId,
            (candidates.get(peer.conditionId) || 0) + 1,
          );
        }
      }

      for (const [peerId, overlap] of candidates) {
        if (overlap < MIN_TAG_OVERLAP) continue;

        // Avoid checking the same pair twice
        const pairKey = [market.conditionId, peerId].sort().join('|');
        if (checked.has(pairKey)) continue;
        checked.add(pairKey);

        const peer = activeMarkets.find((m) => m.conditionId === peerId);
        if (!peer) continue;

        // Compare Yes prices — correlated markets should move together
        const priceA = market.outcomePrices[0] || 0.5;
        const priceB = peer.outcomePrices[0] || 0.5;
        const gap = Math.abs(priceA - priceB);

        if (gap < CROSS_MARKET_PRICE_THRESHOLD) continue;

        // The cheaper market is potentially underpriced relative to the other
        const [underpriced, overpriced] =
          priceA < priceB ? [market, peer] : [peer, market];
        const underpricedYes = underpriced.outcomePrices[0] || 0.5;
        const overpricedYes = overpriced.outcomePrices[0] || 0.5;

        // Fair price for the underpriced market is the midpoint
        const fairPrice = (underpricedYes + overpricedYes) / 2;
        const edge = fairPrice - underpricedYes;

        if (edge < MIN_EDGE_THRESHOLD) continue;

        // Confidence based on tag overlap strength and combined liquidity
        const overlapScore = Math.min(overlap / 4, 1);
        const combinedLiquidity = underpriced.liquidity + overpriced.liquidity;
        const liquidityScore = Math.min(combinedLiquidity / 100000, 1);
        const confidence = 0.4 * overlapScore + 0.3 * liquidityScore + 0.3 * (1 - gap);

        const token = underpriced.tokens.find((t) => t.outcome === 'Yes');

        found.push({
          type: 'cross_market',
          marketA: underpriced,
          marketB: overpriced,
          tokenId: token?.tokenId || '',
          currentPrice: underpricedYes,
          fairPrice,
          edge,
          expectedProfit: edge * DEFAULT_POSITION_SIZE,
          confidence: Math.max(0, Math.min(1, confidence)),
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.mergeOpportunities(found);
    return found;
  }

  // ----------------------------------------------------------
  // 3. Stale Book Detection — Orderbook hasn't caught up
  // ----------------------------------------------------------
  // A market with very low recent trade count relative to its volume
  // and a wide spread likely has a stale orderbook. Price discovery
  // is lagging, and the midpoint may not reflect true value.
  // We estimate fair price from the market's outcomePrices (which
  // update from the Gamma API independently of the CLOB book).
  // ----------------------------------------------------------

  async scanStaleBooks(markets: PolyMarket[]): Promise<ArbOpportunity[]> {
    const found: ArbOpportunity[] = [];

    for (const market of markets) {
      if (!market.active || market.closed) continue;
      if (market.tokens.length < 2) continue;

      // Staleness signals:
      // 1. Low recent trade count for the market's volume
      // 2. Wide spread (market makers have stepped away)
      const tradeCountLow = market.recentTradeCount < STALE_TRADE_COUNT_THRESHOLD;
      const spreadWide = market.spread > 0.04;

      if (!tradeCountLow && !spreadWide) continue;

      // For each token, compare the token's price to the Gamma API price
      for (const token of market.tokens) {
        if (!token.tokenId) continue;

        const outcomeIndex = market.outcomes.indexOf(token.outcome);
        if (outcomeIndex < 0) continue;

        const gammaPrice = market.outcomePrices[outcomeIndex] || 0.5;
        const bookPrice = token.price;
        const priceDelta = Math.abs(gammaPrice - bookPrice);

        // Only flag if the book price meaningfully diverges from Gamma
        if (priceDelta < MIN_EDGE_THRESHOLD) continue;

        // Fair price is the Gamma API price (more recently updated)
        const edge = priceDelta;

        // Confidence: higher for wider divergence, lower for illiquid markets
        const divergenceFactor = Math.min(priceDelta / 0.05, 1);
        const liquidityPenalty = market.liquidity < 5000 ? 0.5 : 1;
        const stalenessFactor = tradeCountLow && spreadWide ? 1.0 : 0.7;
        const confidence = divergenceFactor * liquidityPenalty * stalenessFactor * 0.8;

        found.push({
          type: 'stale_book',
          marketA: market,
          tokenId: token.tokenId,
          currentPrice: bookPrice,
          fairPrice: gammaPrice,
          edge,
          expectedProfit: edge * DEFAULT_POSITION_SIZE,
          confidence: Math.max(0, Math.min(1, confidence)),
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.mergeOpportunities(found);
    return found;
  }

  // ----------------------------------------------------------
  // Retrieve ranked opportunities
  // ----------------------------------------------------------

  getOpportunities(limit: number): ArbOpportunity[] {
    this.pruneExpired();

    // Rank by expected profit * confidence (risk-adjusted return)
    return [...this.opportunities]
      .sort((a, b) => {
        const scoreA = a.expectedProfit * a.confidence;
        const scoreB = b.expectedProfit * b.confidence;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  // ----------------------------------------------------------
  // Slippage estimation — price impact for a given order size
  // ----------------------------------------------------------
  // Walks the order book to estimate how much price moves when
  // filling `size` dollars. Returns the average fill price minus
  // the current midpoint (the slippage).
  // ----------------------------------------------------------

  async estimateSlippage(tokenId: string, size: number): Promise<number> {
    let orderbook: PolyOrderBook;
    try {
      orderbook = await this.client.getOrderBook(tokenId);
    } catch {
      // If we can't fetch the book, return a conservative estimate
      return size * 0.002; // 0.2% per dollar as fallback
    }

    if (orderbook.asks.length === 0) {
      return size * 0.005; // no asks = illiquid, higher estimate
    }

    const midpoint = orderbook.midpoint;
    let remaining = size;
    let totalCost = 0;
    let totalShares = 0;

    // Walk the ask side (buying) to fill the order
    for (const level of orderbook.asks) {
      if (remaining <= 0) break;

      const levelValue = level.price * level.size;
      const fillValue = Math.min(remaining, levelValue);
      const fillShares = fillValue / level.price;

      totalCost += fillValue;
      totalShares += fillShares;
      remaining -= fillValue;
    }

    if (totalShares === 0) {
      return size * 0.01; // book is empty, 1% estimate
    }

    const avgFillPrice = totalCost / totalShares;
    const slippage = avgFillPrice - midpoint;

    return Math.max(0, slippage);
  }

  // ----------------------------------------------------------
  // Full scan — runs all three scanners
  // ----------------------------------------------------------

  async runFullScan(markets: PolyMarket[]): Promise<ArbOpportunity[]> {
    const [vig, cross, stale] = await Promise.all([
      this.scanMispricings(markets),
      this.scanCrossMarket(markets),
      this.scanStaleBooks(markets),
    ]);

    console.log(
      `[ArbScanner] Full scan complete: ${vig.length} vig, ${cross.length} cross-market, ${stale.length} stale book`,
    );

    return this.getOpportunities(50);
  }

  // ----------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------

  /** Merge new opportunities into storage, deduplicating by tokenId+type */
  private mergeOpportunities(incoming: ArbOpportunity[]): void {
    for (const opp of incoming) {
      const existingIdx = this.opportunities.findIndex(
        (o) => o.tokenId === opp.tokenId && o.type === opp.type,
      );

      if (existingIdx >= 0) {
        // Update existing opportunity with fresher data
        this.opportunities[existingIdx] = opp;
      } else {
        this.opportunities.push(opp);
      }
    }
  }

  /** Remove opportunities older than the TTL */
  private pruneExpired(): void {
    const cutoff = Date.now() - OPPORTUNITY_TTL_MS;
    this.opportunities = this.opportunities.filter(
      (o) => new Date(o.timestamp).getTime() > cutoff,
    );
  }

  /** Clear all stored opportunities */
  clear(): void {
    this.opportunities = [];
  }

  /** Current count of stored opportunities */
  get count(): number {
    this.pruneExpired();
    return this.opportunities.length;
  }
}

// ============================================================
// Singleton via globalThis (survives Next.js hot reloads)
// ============================================================

const GLOBAL_KEY = '__arb_scanner__';

export function getArbScanner(): ArbScanner {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new ArbScanner();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

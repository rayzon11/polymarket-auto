import { PolyMarket, PolyOrderBook, FilterResult } from '@/lib/agents/types';

// High Win-Rate Market Filter
// Only markets passing ALL 6 rules are eligible for trading.
// This alone eliminates ~80% of bad bets.

const EXCLUDED_TAGS = new Set([
  'celebrity', 'entertainment', 'sports', 'pop-culture',
  'music', 'movies', 'tv', 'gaming', 'memes',
]);

const PREFERRED_TAGS: Record<string, number> = {
  politics: 3, government: 3,
  economics: 3, finance: 3,
  crypto: 2, blockchain: 2, bitcoin: 2, ethereum: 2,
  science: 2, technology: 2,
  weather: 1, climate: 1,
};

function daysUntilResolution(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return (end - now) / (1000 * 60 * 60 * 24);
}

function hasExcludedTag(tags: string[]): boolean {
  return tags.some((t) => EXCLUDED_TAGS.has(t.toLowerCase()));
}

export function passesFilter(
  market: PolyMarket,
  orderbook?: PolyOrderBook,
  minVolume = 50000
): { passed: boolean; failedRules: string[] } {
  const failedRules: string[] = [];
  const yesPrice = market.outcomePrices[0] ?? 0.5;
  const days = daysUntilResolution(market.endDate);
  const spread = orderbook?.spread ?? market.spread;

  // Rule 1: Volume > $50k
  if (market.volume < minVolume) {
    failedRules.push(`volume_${market.volume.toFixed(0)}_below_${minVolume}`);
  }

  // Rule 2: Resolution within 7 days
  if (days <= 0 || days > 7) {
    failedRules.push(`resolution_${days.toFixed(1)}_days_out_of_range`);
  }

  // Rule 3: YES price between 0.10 and 0.90
  if (yesPrice < 0.10 || yesPrice > 0.90) {
    failedRules.push(`yes_price_${yesPrice.toFixed(2)}_out_of_range`);
  }

  // Rule 4: Spread < 3 cents
  if (spread >= 0.03) {
    failedRules.push(`spread_${spread.toFixed(3)}_too_wide`);
  }

  // Rule 5: At least 50 recent trades
  if (market.recentTradeCount < 50) {
    failedRules.push(`trades_${market.recentTradeCount}_below_50`);
  }

  // Rule 6: No excluded category tags
  if (hasExcludedTag(market.tags)) {
    failedRules.push(`excluded_tag_${market.tags.join(',')}`);
  }

  return { passed: failedRules.length === 0, failedRules };
}

export function scoreMarket(market: PolyMarket): number {
  let score = 0;

  // Tag preference bonus
  for (const tag of market.tags) {
    score += PREFERRED_TAGS[tag.toLowerCase()] || 0;
  }

  // Volume bonus (log scale, max +3)
  score += Math.min(3, Math.log10(market.volume / 50000));

  // Price closer to 0.50 = more uncertain = more edge potential (+2 max)
  const yesPrice = market.outcomePrices[0] ?? 0.5;
  score += 2 * (1 - Math.abs(yesPrice - 0.5) * 2);

  // Closer resolution = higher urgency = faster resolution (+1 max)
  const days = daysUntilResolution(market.endDate);
  if (days > 0 && days <= 7) {
    score += (7 - days) / 7;
  }

  // Higher liquidity bonus (+1 max)
  score += Math.min(1, market.liquidity / 200000);

  return score;
}

export function filterAndRankMarkets(
  markets: PolyMarket[],
  orderbooks: Map<string, PolyOrderBook>,
  minVolume?: number
): FilterResult[] {
  const results: FilterResult[] = [];

  for (const market of markets) {
    const ob = orderbooks.get(market.tokens[0]?.tokenId || '');
    const { passed, failedRules } = passesFilter(market, ob, minVolume);
    const score = passed ? scoreMarket(market) : 0;
    results.push({ passed, market, score, failedRules });
  }

  return results
    .sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? -1 : 1;
      return b.score - a.score;
    });
}

import {
  TradingAgent,
  AgentDecision,
  AgentSignal,
  PolyMarket,
  PolyOrderBook,
  NewsArticle,
} from './types';
import { getConfig } from '@/lib/config';

// Agent 3 — Strategist (Level 3)
// Strategy: contrarian + orderbook imbalance + Kelly criterion sizing
// Fades the crowd when sentiment and orderbook are heavily skewed

export class StrategistAgent implements TradingAgent {
  name = 'strategist' as const;
  level = 3;

  async analyze(
    market: PolyMarket,
    orderbook: PolyOrderBook,
    news: NewsArticle[],
  ): Promise<AgentDecision> {
    const config = getConfig();
    const yesPrice = market.outcomePrices[0] ?? 0.5;
    const imbalance = orderbook.imbalance; // positive = more bid volume (bullish)

    // Aggregate sentiment
    const sentimentArticles = news.filter((a) => a.sentimentScore !== 0);
    const avgSentiment = sentimentArticles.length > 0
      ? sentimentArticles.reduce((s, a) => s + a.sentimentScore, 0) / sentimentArticles.length
      : 0;

    // Detect crowd behavior
    const crowdBullish = avgSentiment > 0.2 && imbalance > 0.3;
    const crowdBearish = avgSentiment < -0.2 && imbalance < -0.3;
    const obSkewedYes = imbalance > 0.25;
    const obSkewedNo = imbalance < -0.25;

    let signal: AgentSignal = 'HOLD';
    let reasoning = '';
    let estimatedProb = yesPrice; // Start with market price as estimate

    // Contrarian logic: fade the crowd when heavily skewed
    if (crowdBullish && yesPrice > 0.65) {
      signal = 'BUY_NO';
      estimatedProb = yesPrice - 0.10; // We think it's overpriced
      reasoning = `CONTRARIAN: Crowd heavily bullish (sentiment ${avgSentiment.toFixed(2)}, OB imbalance ${imbalance.toFixed(2)}) but YES at ${yesPrice.toFixed(2)} looks overpriced. Fading.`;
    } else if (crowdBearish && yesPrice < 0.35) {
      signal = 'BUY_YES';
      estimatedProb = yesPrice + 0.10; // We think it's underpriced
      reasoning = `CONTRARIAN: Crowd heavily bearish (sentiment ${avgSentiment.toFixed(2)}, OB imbalance ${imbalance.toFixed(2)}) but YES at ${yesPrice.toFixed(2)} looks underpriced. Buying dip.`;
    }
    // Follow orderbook when sentiment is neutral
    else if (Math.abs(avgSentiment) < 0.15 && obSkewedYes && yesPrice < 0.60) {
      signal = 'BUY_YES';
      estimatedProb = yesPrice + 0.08;
      reasoning = `Neutral sentiment but OB skewed bullish (imbalance ${imbalance.toFixed(2)}). Following smart money.`;
    } else if (Math.abs(avgSentiment) < 0.15 && obSkewedNo && yesPrice > 0.40) {
      signal = 'BUY_NO';
      estimatedProb = yesPrice - 0.08;
      reasoning = `Neutral sentiment but OB skewed bearish (imbalance ${imbalance.toFixed(2)}). Following smart money.`;
    } else {
      reasoning = `No clear contrarian or orderbook signal. Sentiment: ${avgSentiment.toFixed(2)}, OB imbalance: ${imbalance.toFixed(2)}.`;
    }

    // Kelly criterion position sizing
    let suggestedSize = 0;
    if (signal !== 'HOLD') {
      const edge = Math.abs(estimatedProb - yesPrice);
      const payoff = signal === 'BUY_YES'
        ? (1 / yesPrice) - 1
        : (1 / (1 - yesPrice)) - 1;
      const p = signal === 'BUY_YES' ? estimatedProb : 1 - estimatedProb;
      const q = 1 - p;
      const kelly = payoff > 0 ? (p * payoff - q) / payoff : 0;
      const cappedKelly = Math.max(0, Math.min(config.bot.kellyCap, kelly));
      suggestedSize = cappedKelly * config.bot.bankroll;
    }

    // Confidence: higher when contrarian signal is strong
    const signalStrength = Math.abs(avgSentiment) + Math.abs(imbalance);
    const confidence = signal !== 'HOLD'
      ? Math.min(0.80, Math.max(0.35, 0.35 + signalStrength * 0.3))
      : 0.25;

    const edge = Math.abs(estimatedProb - yesPrice);

    return {
      agent: this.name,
      signal,
      confidence,
      edge,
      reasoning,
      targetPrice: estimatedProb,
      suggestedSize,
      metadata: {
        imbalance,
        avgSentiment,
        crowdBullish,
        crowdBearish,
        estimatedProb,
        momentumAligned: (signal === 'BUY_YES' && imbalance > 0) || (signal === 'BUY_NO' && imbalance < 0),
      },
      timestamp: new Date().toISOString(),
    };
  }
}

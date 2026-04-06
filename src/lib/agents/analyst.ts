import {
  TradingAgent,
  AgentDecision,
  AgentSignal,
  PolyMarket,
  PolyOrderBook,
  NewsArticle,
} from './types';

// Agent 2 — Analyst (Level 2)
// Strategy: sentiment + momentum combination
// Identifies divergences between news sentiment and price movement

export class AnalystAgent implements TradingAgent {
  name = 'analyst' as const;
  level = 2;

  async analyze(
    market: PolyMarket,
    orderbook: PolyOrderBook,
    news: NewsArticle[],
  ): Promise<AgentDecision> {
    // Compute aggregate news sentiment
    const relevantNews = news.filter((a) => a.sentimentScore !== 0);
    const avgSentiment = relevantNews.length > 0
      ? relevantNews.reduce((s, a) => s + a.sentimentScore, 0) / relevantNews.length
      : 0;

    // Compute price momentum from orderbook pressure
    const yesPrice = market.outcomePrices[0] ?? 0.5;
    const midpoint = orderbook.midpoint || yesPrice;

    // Momentum: positive if orderbook midpoint suggests price should be higher
    const momentum = midpoint - yesPrice;

    // Combined signal: 60% sentiment, 40% momentum
    const combinedSignal = 0.6 * avgSentiment + 0.4 * (momentum * 10); // Scale momentum

    let signal: AgentSignal = 'HOLD';
    let reasoning = '';

    // Skip weak signals
    if (Math.abs(combinedSignal) < 0.3) {
      reasoning = `Combined signal too weak (${combinedSignal.toFixed(3)}). Sentiment: ${avgSentiment.toFixed(2)}, Momentum: ${momentum.toFixed(3)}.`;
      return {
        agent: this.name,
        signal: 'HOLD',
        confidence: 0.3,
        edge: 0,
        reasoning,
        metadata: { avgSentiment, momentum, combinedSignal, newsCount: relevantNews.length },
        timestamp: new Date().toISOString(),
      };
    }

    // Check for sentiment-price divergence (high-value signal)
    const divergence = avgSentiment > 0.2 && yesPrice < 0.4
      ? 'bullish_divergence'
      : avgSentiment < -0.2 && yesPrice > 0.6
        ? 'bearish_divergence'
        : 'none';

    if (combinedSignal > 0.3) {
      signal = 'BUY_YES';
      reasoning = `Bullish combined signal (${combinedSignal.toFixed(2)}). Sentiment: ${avgSentiment.toFixed(2)}, Momentum: ${momentum.toFixed(3)}.`;
      if (divergence === 'bullish_divergence') {
        reasoning += ` DIVERGENCE: positive news but YES priced low at ${yesPrice.toFixed(2)}.`;
      }
    } else if (combinedSignal < -0.3) {
      signal = 'BUY_NO';
      reasoning = `Bearish combined signal (${combinedSignal.toFixed(2)}). Sentiment: ${avgSentiment.toFixed(2)}, Momentum: ${momentum.toFixed(3)}.`;
      if (divergence === 'bearish_divergence') {
        reasoning += ` DIVERGENCE: negative news but YES priced high at ${yesPrice.toFixed(2)}.`;
      }
    }

    // Map signal strength to confidence (0.40 - 0.70)
    const rawConf = Math.abs(combinedSignal);
    const confidence = Math.min(0.70, Math.max(0.40, 0.40 + rawConf * 0.3));

    const edge = signal !== 'HOLD'
      ? Math.abs(combinedSignal) * 0.12
      : 0;

    return {
      agent: this.name,
      signal,
      confidence,
      edge,
      reasoning,
      metadata: {
        avgSentiment,
        momentum,
        combinedSignal,
        divergence,
        newsCount: relevantNews.length,
        momentumAligned: (combinedSignal > 0 && momentum > 0) || (combinedSignal < 0 && momentum < 0),
      },
      timestamp: new Date().toISOString(),
    };
  }
}

import {
  TradingAgent,
  AgentDecision,
  AgentSignal,
  PolyMarket,
  PolyOrderBook,
  NewsArticle,
} from './types';

// Agent 1 — Scout (Level 1)
// Strategy: keyword matching between market title and news headlines
// Simplest agent, serves as baseline signal

export class ScoutAgent implements TradingAgent {
  name = 'scout' as const;
  level = 1;

  async analyze(
    market: PolyMarket,
    _orderbook: PolyOrderBook,
    news: NewsArticle[],
  ): Promise<AgentDecision> {
    const marketWords = market.question
      .toLowerCase()
      .replace(/[?!.,;:'"()[\]{}]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    let matchCount = 0;
    let sentimentSum = 0;

    for (const article of news) {
      const headlineLower = article.title.toLowerCase();
      const matches = marketWords.filter((w) => headlineLower.includes(w));
      if (matches.length > 0) {
        matchCount++;
        sentimentSum += article.sentimentScore;
      }
    }

    const avgSentiment = matchCount > 0 ? sentimentSum / matchCount : 0;
    const yesPrice = market.outcomePrices[0] ?? 0.5;

    let signal: AgentSignal = 'HOLD';
    let reasoning = '';

    if (matchCount >= 3) {
      if (avgSentiment > 0.05 && yesPrice < 0.75) {
        signal = 'BUY_YES';
        reasoning = `${matchCount} news matches with positive sentiment (${avgSentiment.toFixed(2)}). YES price ${yesPrice.toFixed(2)} has room to rise.`;
      } else if (avgSentiment < -0.05 && yesPrice > 0.25) {
        signal = 'BUY_NO';
        reasoning = `${matchCount} news matches with negative sentiment (${avgSentiment.toFixed(2)}). Market overpricing YES at ${yesPrice.toFixed(2)}.`;
      } else {
        reasoning = `${matchCount} news matches but sentiment is neutral (${avgSentiment.toFixed(2)}). No clear edge.`;
      }
    } else {
      reasoning = `Only ${matchCount} news matches — insufficient signal for "${market.question.slice(0, 60)}..."`;
    }

    const confidence = Math.min(0.45, 0.15 + matchCount * 0.05 + Math.abs(avgSentiment) * 0.2);
    const edge = signal !== 'HOLD'
      ? Math.abs(avgSentiment) * 0.15
      : 0;

    return {
      agent: this.name,
      signal,
      confidence,
      edge,
      reasoning,
      metadata: { matchCount, avgSentiment, newsCount: news.length },
      timestamp: new Date().toISOString(),
    };
  }
}

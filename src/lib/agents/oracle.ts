import {
  TradingAgent,
  AgentDecision,
  AgentSignal,
  PolyMarket,
  PolyOrderBook,
  NewsArticle,
  OracleConfidence,
} from './types';
import { getConfig } from '@/lib/config';

// Agent 5 — Oracle (Level 5)
// Strategy: Claude API reasoning + ensemble with quant signals
// The most powerful agent — uses LLM reasoning to find edges humans and models miss

const ORACLE_SYSTEM_PROMPT = `You are Oracle, an elite prediction market analyst. You find edges that humans and simple models miss.

Given a market + news + orderbook data + other trading agents' signals, you must:
1. Estimate TRUE probability of YES outcome (not the market price)
2. Compute edge = your_probability - current_yes_price
3. Decide: STRONG_BUY_YES | BUY_YES | HOLD | BUY_NO | STRONG_BUY_NO
4. Assess confidence: LOW | MEDIUM | HIGH | VERY_HIGH
5. Write 3-sentence reasoning focusing on: what the market is mispricing and why

Rules:
- Only recommend BUY when |edge| > 0.08 (8 cents minimum edge)
- Be contrarian when news is obviously bullish (markets overprice obvious outcomes)
- HIGH confidence only when 3+ independent signals agree
- VERY_HIGH only when you would bet your own money
- Consider time to resolution — shorter = more certainty required

Respond ONLY in JSON, no markdown or code blocks:
{"true_probability":0.0,"edge":0.0,"recommendation":"HOLD","confidence":"LOW","reasoning":"..."}`;

interface OracleResponse {
  true_probability: number;
  edge: number;
  recommendation: string;
  confidence: OracleConfidence;
  reasoning: string;
}

function mapRecommendation(rec: string): AgentSignal {
  const r = rec.toUpperCase();
  if (r.includes('BUY_YES') || r.includes('STRONG_BUY_YES')) return 'BUY_YES';
  if (r.includes('BUY_NO') || r.includes('STRONG_BUY_NO')) return 'BUY_NO';
  return 'HOLD';
}

function mapConfidence(conf: OracleConfidence): number {
  switch (conf) {
    case 'VERY_HIGH': return 0.90;
    case 'HIGH': return 0.75;
    case 'MEDIUM': return 0.55;
    case 'LOW': return 0.35;
    default: return 0.40;
  }
}

export class OracleAgent implements TradingAgent {
  name = 'oracle' as const;
  level = 5;

  async analyze(
    market: PolyMarket,
    orderbook: PolyOrderBook,
    news: NewsArticle[],
    otherDecisions?: AgentDecision[],
  ): Promise<AgentDecision> {
    const config = getConfig();
    const yesPrice = market.outcomePrices[0] ?? 0.5;

    // Build context for Claude
    const topNews = news
      .sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore))
      .slice(0, 5);

    const agentSummary = (otherDecisions || [])
      .map((d) => `${d.agent}: ${d.signal} (confidence: ${d.confidence.toFixed(2)}, edge: ${d.edge.toFixed(3)}, reasoning: ${d.reasoning.slice(0, 100)})`)
      .join('\n');

    const userPrompt = `MARKET: "${market.question}"
Category: ${market.category}
Resolution: ${market.endDate}
YES Price: ${yesPrice.toFixed(4)}
Volume: $${market.volume.toLocaleString()}
Liquidity: $${market.liquidity.toLocaleString()}

ORDERBOOK:
Best Bid: ${orderbook.bids[0]?.price.toFixed(4) || 'N/A'} (${orderbook.bids[0]?.size.toFixed(0) || '0'} shares)
Best Ask: ${orderbook.asks[0]?.price.toFixed(4) || 'N/A'} (${orderbook.asks[0]?.size.toFixed(0) || '0'} shares)
Spread: ${orderbook.spread.toFixed(4)}
Imbalance: ${orderbook.imbalance.toFixed(3)} (positive = more bids)
Bid Volume: $${orderbook.bidVolume.toFixed(0)}
Ask Volume: $${orderbook.askVolume.toFixed(0)}

TOP NEWS:
${topNews.map((a, i) => `${i + 1}. [${a.source}] "${a.title}" (sentiment: ${a.sentimentScore.toFixed(2)})`).join('\n') || 'No relevant news found.'}

OTHER AGENTS' SIGNALS:
${agentSummary || 'No other agent signals available.'}

Analyze this market and respond with JSON only.`;

    try {
      if (!config.anthropic.apiKey) {
        throw new Error('No ANTHROPIC_API_KEY configured');
      }

      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: config.anthropic.apiKey });

      const response = await client.messages.create({
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system: ORACLE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as any).text as string)
        .join('');

      // Parse JSON response (handle potential markdown wrapping)
      const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed: OracleResponse = JSON.parse(jsonStr);

      const signal = mapRecommendation(parsed.recommendation);
      const confidence = mapConfidence(parsed.confidence);

      // Ensemble: blend oracle probability with quant's posterior if available
      const quantDecision = otherDecisions?.find((d) => d.agent === 'quant');
      const quantProb = quantDecision?.targetPrice ?? yesPrice;
      const ensembleProb = 0.5 * parsed.true_probability + 0.5 * quantProb;
      const ensembleEdge = Math.abs(ensembleProb - yesPrice);

      // Position size based on confidence level
      let maxSize = config.bot.kellyCap;
      if (parsed.confidence === 'VERY_HIGH') maxSize = 0.08;
      if (parsed.confidence === 'LOW') maxSize = 0;

      return {
        agent: this.name,
        signal,
        confidence,
        edge: ensembleEdge,
        reasoning: parsed.reasoning,
        targetPrice: ensembleProb,
        suggestedSize: maxSize * config.bot.bankroll,
        metadata: {
          oracleProbability: parsed.true_probability,
          oracleEdge: parsed.edge,
          oracleConfidence: parsed.confidence,
          oracleRecommendation: parsed.recommendation,
          ensembleProbability: ensembleProb,
          quantProbability: quantProb,
          rawResponse: text.slice(0, 500),
          momentumAligned: true, // Oracle considers all factors
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[Oracle] Claude API call failed:', err);
      return this.fallback(market, orderbook, otherDecisions || [], yesPrice);
    }
  }

  private fallback(
    market: PolyMarket,
    _orderbook: PolyOrderBook,
    otherDecisions: AgentDecision[],
    yesPrice: number,
  ): AgentDecision {
    // Weighted average of other agents as fallback
    const weights: Record<string, number> = {
      scout: 0.10,
      analyst: 0.25,
      strategist: 0.30,
      quant: 0.35,
    };

    let weightedScore = 0;
    let totalWeight = 0;
    const buyYesCount = otherDecisions.filter((d) => d.signal === 'BUY_YES').length;
    const buyNoCount = otherDecisions.filter((d) => d.signal === 'BUY_NO').length;

    for (const d of otherDecisions) {
      const w = weights[d.agent] || 0.2;
      const signalVal = d.signal === 'BUY_YES' ? 1 : d.signal === 'BUY_NO' ? -1 : 0;
      weightedScore += signalVal * d.confidence * w;
      totalWeight += w;
    }

    const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    let signal: AgentSignal = 'HOLD';
    if (normalizedScore > 0.3) signal = 'BUY_YES';
    else if (normalizedScore < -0.3) signal = 'BUY_NO';

    const confidence = Math.min(0.60, Math.max(0.30, Math.abs(normalizedScore)));
    const avgTargetPrice = otherDecisions
      .filter((d) => d.targetPrice !== undefined)
      .reduce((sum, d, _, arr) => sum + (d.targetPrice! / arr.length), 0) || yesPrice;

    return {
      agent: this.name,
      signal,
      confidence,
      edge: Math.abs(avgTargetPrice - yesPrice),
      reasoning: `[FALLBACK] Claude API unavailable. Weighted ensemble of ${otherDecisions.length} agents: score=${normalizedScore.toFixed(3)}, YES votes=${buyYesCount}, NO votes=${buyNoCount}.`,
      targetPrice: avgTargetPrice,
      metadata: {
        fallback: true,
        normalizedScore,
        buyYesCount,
        buyNoCount,
        momentumAligned: false,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

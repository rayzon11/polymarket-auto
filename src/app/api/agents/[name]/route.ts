import { NextRequest, NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

const AGENT_INFO: Record<string, { level: number; description: string; strategy: string }> = {
  scout: {
    level: 1,
    description: 'Keyword matching agent',
    strategy: 'Matches market title words against news headlines. 3+ matches with consistent sentiment triggers signal. Flat 1% sizing, confidence cap 0.45.',
  },
  analyst: {
    level: 2,
    description: 'Sentiment + momentum agent',
    strategy: 'Combines news sentiment (60%) with price momentum (40%). Identifies sentiment-price divergences. Position size 2%, confidence 0.40-0.70.',
  },
  strategist: {
    level: 3,
    description: 'Contrarian + orderbook agent',
    strategy: 'Analyzes orderbook imbalance and fades crowd when heavily skewed. Uses Kelly criterion for position sizing. Confidence 0.35-0.80.',
  },
  quant: {
    level: 4,
    description: 'Multi-factor Bayesian agent',
    strategy: 'Alpha = 0.35*sentiment + 0.25*momentum + 0.25*OB_imbalance + 0.15*volume. Bayesian probability updating. Tracks Brier score per category. Confidence 0.40-0.85.',
  },
  oracle: {
    level: 5,
    description: 'Claude AI reasoning agent',
    strategy: 'Calls Claude API with full market context + other agents signals. Estimates true probability, computes edge. Ensemble: 50% oracle + 50% quant. Confidence 0.30-0.95.',
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const info = AGENT_INFO[name];

    if (!info) {
      return NextResponse.json(
        { error: `Agent "${name}" not found. Available: ${Object.keys(AGENT_INFO).join(', ')}` },
        { status: 404 }
      );
    }

    const tracker = getTracker();
    const analytics = await tracker.getAnalytics();
    const stats = analytics.agentStats.find((s) => s.name === name);

    return NextResponse.json({ name, ...info, stats: stats || null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

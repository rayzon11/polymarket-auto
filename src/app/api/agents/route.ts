import { NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET() {
  try {
    const tracker = getTracker();
    const analytics = await tracker.getAnalytics();

    const agents = [
      { name: 'scout', level: 1, description: 'Keyword matching between market titles and news headlines' },
      { name: 'analyst', level: 2, description: 'Sentiment + price momentum combination analysis' },
      { name: 'strategist', level: 3, description: 'Contrarian orderbook analysis + Kelly criterion sizing' },
      { name: 'quant', level: 4, description: 'Multi-factor Bayesian model with Brier score tracking' },
      { name: 'oracle', level: 5, description: 'Claude AI reasoning + ensemble with quant signals' },
    ].map((agent) => {
      const stats = analytics.agentStats.find((s) => s.name === agent.name);
      return { ...agent, stats: stats || null };
    });

    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

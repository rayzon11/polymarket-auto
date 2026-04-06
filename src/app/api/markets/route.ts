import { NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket/client';
import { filterAndRankMarkets } from '@/lib/market-filter';

export async function GET() {
  try {
    const client = getPolymarketClient();
    const markets = await client.getMarkets(100);

    const orderbookMap = new Map();
    const filtered = filterAndRankMarkets(markets, orderbookMap);
    const passing = filtered.filter((r) => r.passed);

    return NextResponse.json({
      count: passing.length,
      markets: passing.map((r) => ({
        ...r.market,
        filterScore: r.score,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

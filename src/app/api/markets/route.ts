import { NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket/client';
import { filterAndRankMarkets } from '@/lib/market-filter';

export async function GET() {
  try {
    const client = getPolymarketClient();
    const markets = await client.getMarkets(100);

    const orderbookMap = new Map();
    const filtered = filterAndRankMarkets(markets, orderbookMap);
    const tradeable = filtered.filter((r) => r.passed);

    // Return ALL markets (for display) + which ones pass filter (for trading)
    return NextResponse.json({
      count: markets.length,
      tradeableCount: tradeable.length,
      markets: markets.map((m) => {
        const f = filtered.find((r) => r.market.conditionId === m.conditionId);
        return {
          ...m,
          filterScore: f?.score || 0,
          passesFilter: f?.passed || false,
          failedRules: f?.failedRules || [],
        };
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket/client';
import { getTracker } from '@/lib/tracker/tracker';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketId, tokenId, side, price, size } = body;

    if (!tokenId || !side || !price || !size) {
      return NextResponse.json(
        { error: 'Missing required fields: tokenId, side, price, size' },
        { status: 400 }
      );
    }

    const client = getPolymarketClient();
    const result = await client.placeOrder(tokenId, side, price, size, marketId);

    if (result.success && marketId) {
      const market = await client.getMarket(marketId);
      if (market) {
        const tracker = getTracker();
        await tracker.openPosition({
          marketId,
          tokenId,
          question: market.question,
          outcome: side === 'BUY' ? 'Yes' : 'No',
          category: market.category,
          signal: 'BUY_YES',
          entryPrice: price,
          size,
          agentDecisions: [],
          oracleReasoning: 'Manual trade',
          consensusConfidence: 0,
          resolvesAt: market.endDate,
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

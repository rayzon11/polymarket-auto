import { NextRequest, NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getPolymarketClient();
    const market = await client.getMarket(id);

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }

    let orderbook = null;
    if (market.tokens[0]?.tokenId) {
      orderbook = await client.getOrderBook(market.tokens[0].tokenId);
    }

    return NextResponse.json({ market, orderbook });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

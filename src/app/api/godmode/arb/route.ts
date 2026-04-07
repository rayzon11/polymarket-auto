import { NextResponse } from 'next/server';
import { getArbScanner } from '@/lib/godmode/arb-scanner';
import { getPolymarketClient } from '@/lib/polymarket/client';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'scan';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const tokenId = searchParams.get('tokenId') || '';

  const scanner = getArbScanner();

  try {
    switch (action) {
      case 'scan': {
        const client = getPolymarketClient();
        const markets = await client.getMarkets(100);
        const opps = await scanner.runFullScan(markets);
        return NextResponse.json({ opportunities: opps.slice(0, limit), total: opps.length });
      }
      case 'opportunities':
        return NextResponse.json({ opportunities: scanner.getOpportunities(limit) });
      case 'slippage': {
        if (!tokenId) return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
        const size = parseFloat(searchParams.get('size') || '100');
        const slippage = await scanner.estimateSlippage(tokenId, size);
        return NextResponse.json({ tokenId, size, slippage });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

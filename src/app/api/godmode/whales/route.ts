import { NextResponse } from 'next/server';
import { getWhaleTracker } from '@/lib/godmode/whale-tracker';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'alerts';
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const tokenId = searchParams.get('tokenId') || '';

  const tracker = getWhaleTracker();

  try {
    switch (action) {
      case 'alerts':
        return NextResponse.json({ alerts: tracker.getWhaleAlerts(limit) });
      case 'wallets':
        return NextResponse.json({ wallets: tracker.getWhaleWallets() });
      case 'activity':
        if (!tokenId) return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
        return NextResponse.json({ activity: tracker.analyzeWhaleActivity(tokenId) });
      case 'score':
        if (!tokenId) return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
        return NextResponse.json({ score: tracker.getWhaleScore(tokenId) });
      case 'scan':
        const minSize = parseInt(searchParams.get('minSize') || '1000', 10);
        await tracker.trackLargeOrders(minSize);
        return NextResponse.json({ status: 'scanned', alerts: tracker.getWhaleAlerts(limit) });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

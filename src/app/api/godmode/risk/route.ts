import { NextResponse } from 'next/server';
import { getRiskEngine } from '@/lib/godmode/risk-engine';
import { getTracker } from '@/lib/tracker/tracker';
import { getConfig } from '@/lib/config';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'metrics';
  const tokenId = searchParams.get('tokenId') || '';

  const engine = getRiskEngine();
  const tracker = getTracker();
  const config = getConfig();
  const positions = await tracker.getPositions();
  const bankroll = config.bot.bankroll;

  try {
    switch (action) {
      case 'metrics': {
        const metrics = await engine.calculateRiskMetrics(positions, bankroll);
        return NextResponse.json({ metrics });
      }
      case 'alerts':
        return NextResponse.json({ alerts: engine.getRiskAlerts() });
      case 'var': {
        const confidence = parseFloat(searchParams.get('confidence') || '0.95');
        const var_ = engine.calculateVaR(positions, confidence as 0.95 | 0.99);
        return NextResponse.json({ var: var_, confidence });
      }
      case 'liquidity': {
        if (!tokenId) return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
        const risk = await engine.getLiquidityRisk(tokenId);
        return NextResponse.json({ tokenId, liquidityRisk: risk });
      }
      case 'concentration':
        return NextResponse.json({ concentration: engine.getConcentrationRisk(positions) });
      case 'pretrade': {
        if (!tokenId) return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
        const side = (searchParams.get('side') || 'BUY') as 'BUY' | 'SELL';
        const size = parseFloat(searchParams.get('size') || '100');
        const price = parseFloat(searchParams.get('price') || '0.5');
        const check = engine.checkPreTradeRisk(tokenId, side, size, price, positions, bankroll);
        return NextResponse.json({ preTradeCheck: check });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

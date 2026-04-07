import { NextResponse } from 'next/server';
import { getPortfolioOptimizer } from '@/lib/godmode/portfolio-optimizer';
import { getTracker } from '@/lib/tracker/tracker';
import { getConfig } from '@/lib/config';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'status';

  const optimizer = getPortfolioOptimizer();
  const tracker = getTracker();
  const config = getConfig();
  const positions = await tracker.getPositions();
  const bankroll = config.bot.bankroll;

  try {
    switch (action) {
      case 'status': {
        const rebalanceNeeded = optimizer.shouldRebalance(positions, bankroll);
        const diversification = optimizer.getDiversificationScore(positions);
        const expectedReturn = optimizer.getExpectedPortfolioReturn(positions);
        return NextResponse.json({ rebalanceNeeded, diversification, expectedReturn, positionCount: positions.length });
      }
      case 'optimize': {
        const result = optimizer.optimize(positions, [], bankroll);
        return NextResponse.json({ result });
      }
      case 'rebalance': {
        const actions = optimizer.getRebalanceActions(positions, bankroll);
        return NextResponse.json({ actions, rebalanceNeeded: optimizer.shouldRebalance(positions, bankroll) });
      }
      case 'diversification':
        return NextResponse.json({ score: optimizer.getDiversificationScore(positions) });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket/client';

export async function GET() {
  const client = getPolymarketClient();

  try {
    const health = await client.checkHealth();
    let balance = { balance: '0', allowance: '0' };

    if (client.isConnected()) {
      try {
        balance = await client.getBalanceAllowance();
      } catch {
        // Balance fetch may fail if no positions
      }
    }

    return NextResponse.json({
      ...health,
      balance: balance.balance,
      allowance: balance.allowance,
      network: 'Polygon Mainnet',
      chainId: 137,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket/client';
import { getConfig } from '@/lib/config';

export async function GET() {
  const config = getConfig();
  const client = getPolymarketClient();

  let positions: unknown[] = [];
  let connected = false;
  let error = null;

  try {
    await client.init();
    positions = await client.getPositions();
    connected = true;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    connected,
    walletAddress: client.getWalletAddress() || config.polymarket.funderAddress || 'not set',
    hasPrivateKey: !!config.polymarket.privateKey,
    hasApiKey: !!config.polymarket.apiKey,
    chainId: config.polymarket.chainId,
    network: 'Polygon Mainnet',
    dryRun: config.bot.dryRun,
    bankroll: config.bot.bankroll,
    openPositions: positions.length,
    error,
  });
}

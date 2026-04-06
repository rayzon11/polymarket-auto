import { NextResponse } from 'next/server';
import { getConfigSafe } from '@/lib/config';
import { getTradingLoop } from '@/lib/bot/loop';

export async function GET() {
  const config = getConfigSafe();
  const loop = getTradingLoop();
  const status = loop.getStatus();

  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    dryRun: config.bot.dryRun,
    running: status.running,
    uptime: status.uptime,
    tickCount: status.tickCount,
    polymarketConnected: config.polymarket.hasKey,
    timestamp: new Date().toISOString(),
  });
}

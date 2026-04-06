import { NextRequest, NextResponse } from 'next/server';
import { getTradingLoop } from '@/lib/bot/loop';
import { getConfig } from '@/lib/config';

// Vercel Cron target — runs one tick per invocation
// Protected by CRON_SECRET header

let lastTickTime = 0;
const MIN_TICK_INTERVAL = 60000; // 60 seconds debounce

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const config = getConfig();
    if (config.cronSecret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${config.cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Debounce
    const now = Date.now();
    if (now - lastTickTime < MIN_TICK_INTERVAL) {
      return NextResponse.json({
        message: 'Tick debounced — too soon since last tick',
        lastTickAge: now - lastTickTime,
      });
    }
    lastTickTime = now;

    const loop = getTradingLoop();
    await loop.tick();

    return NextResponse.json({
      message: 'Tick completed',
      status: loop.getStatus(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

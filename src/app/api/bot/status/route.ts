import { NextResponse } from 'next/server';
import { getTradingLoop } from '@/lib/bot/loop';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET() {
  try {
    const loop = getTradingLoop();
    const tracker = getTracker();
    const positions = await tracker.getPositions();
    const exposure = await tracker.getTotalExposure();

    return NextResponse.json({
      ...loop.getStatus(),
      openPositions: positions.length,
      totalExposure: exposure,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

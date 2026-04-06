import { NextResponse } from 'next/server';
import { getTradingLoop } from '@/lib/bot/loop';

export async function POST() {
  try {
    const loop = getTradingLoop();
    const status = loop.getStatus();

    if (status.running) {
      return NextResponse.json({ message: 'Bot is already running', status });
    }

    loop.start();
    return NextResponse.json({ message: 'Bot started', status: loop.getStatus() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

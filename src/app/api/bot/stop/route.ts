import { NextResponse } from 'next/server';
import { getTradingLoop } from '@/lib/bot/loop';

export async function POST() {
  try {
    const loop = getTradingLoop();
    loop.stop();
    return NextResponse.json({ message: 'Bot stopped', status: loop.getStatus() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

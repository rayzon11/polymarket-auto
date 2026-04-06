import { NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET() {
  try {
    const tracker = getTracker();
    const leaderboard = await tracker.getLeaderboard();
    return NextResponse.json({ agents: leaderboard });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

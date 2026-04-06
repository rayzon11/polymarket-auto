import { NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET() {
  try {
    const tracker = getTracker();
    const positions = await tracker.getPositions();
    return NextResponse.json({ count: positions.length, positions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

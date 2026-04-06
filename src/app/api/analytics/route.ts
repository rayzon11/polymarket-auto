import { NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET() {
  try {
    const tracker = getTracker();
    const analytics = await tracker.getAnalytics();
    return NextResponse.json(analytics);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET(request: NextRequest) {
  try {
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);
    const tracker = getTracker();
    const history = await tracker.getHistory(limit, offset);
    return NextResponse.json({ count: history.length, history });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

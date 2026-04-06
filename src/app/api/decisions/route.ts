import { NextRequest, NextResponse } from 'next/server';
import { readLogLines } from '@/lib/tracker/persistence';

export async function GET(request: NextRequest) {
  try {
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);
    const lines = await readLogLines('decisions.log', limit);

    const decisions = lines
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .reverse(); // Most recent first

    return NextResponse.json({ count: decisions.length, decisions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

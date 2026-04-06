import { NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET() {
  try {
    const tracker = getTracker();
    const csv = tracker.exportCsv();
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=polymarket-bot-history.csv',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

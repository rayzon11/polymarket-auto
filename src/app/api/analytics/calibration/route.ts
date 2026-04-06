import { NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET() {
  try {
    const tracker = getTracker();
    const calibration = await tracker.getCalibration();
    return NextResponse.json({ calibration });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

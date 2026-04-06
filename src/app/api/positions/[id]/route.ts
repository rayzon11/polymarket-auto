import { NextRequest, NextResponse } from 'next/server';
import { getTracker } from '@/lib/tracker/tracker';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tracker = getTracker();
    const position = await tracker.getPosition(id);

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }

    return NextResponse.json(position);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tracker = getTracker();
    const position = await tracker.getPosition(id);

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }

    const record = await tracker.closePosition(id, position.currentPrice);
    return NextResponse.json({ closed: true, record });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

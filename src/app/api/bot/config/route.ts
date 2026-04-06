import { NextRequest, NextResponse } from 'next/server';
import { getConfigSafe } from '@/lib/config';

export async function GET() {
  try {
    const config = getConfigSafe();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Config updates are applied via environment variables
    // This endpoint documents what can be changed
    return NextResponse.json({
      message: 'Config updates should be applied via environment variables and server restart',
      current: getConfigSafe(),
      received: body,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

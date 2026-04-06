import { NextRequest, NextResponse } from 'next/server';
import { getNewsFetcher } from '@/lib/news/fetcher';

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get('category');
    const fetcher = getNewsFetcher();

    if (category) {
      const articles = await fetcher.fetchTop(category);
      return NextResponse.json({ count: articles.length, articles });
    }

    const articles = fetcher.getAllCached();
    return NextResponse.json({ count: articles.length, articles });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

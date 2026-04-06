import { NextRequest, NextResponse } from 'next/server';
import { getNewsFetcher } from '@/lib/news/fetcher';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q');
    if (!q) {
      return NextResponse.json({ error: 'Missing query parameter ?q=' }, { status: 400 });
    }

    const fetcher = getNewsFetcher();

    // Search cache first, then fetch if empty
    let articles = fetcher.searchCache(q);
    if (articles.length === 0) {
      articles = await fetcher.fetchHeadlines(q);
    }

    return NextResponse.json({ query: q, count: articles.length, articles });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

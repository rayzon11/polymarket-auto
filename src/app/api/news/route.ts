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

    // If cache is empty, fetch fresh news across categories
    let articles = fetcher.getAllCached();
    if (articles.length === 0) {
      articles = await fetcher.fetchAll();
    }

    return NextResponse.json({ count: articles.length, articles });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { getConfig } from '@/lib/config';
import { NewsArticle } from '@/lib/agents/types';

// NewsAPI.org Integration with Sentiment Scoring and In-Memory Cache

const POSITIVE_WORDS = new Set([
  'wins', 'confirmed', 'approved', 'signed', 'passed', 'agreed', 'rising',
  'surge', 'elected', 'rally', 'gain', 'success', 'grow', 'increase',
  'breakthrough', 'bullish', 'strong', 'record', 'boom', 'triumph',
  'victory', 'milestone', 'launch', 'upgrade', 'soar',
]);

const NEGATIVE_WORDS = new Set([
  'fails', 'rejected', 'cancelled', 'denied', 'resigned', 'crashed',
  'blocked', 'fall', 'plunge', 'drop', 'bearish', 'lose', 'crisis',
  'scandal', 'collapse', 'decline', 'downturn', 'recession', 'default',
  'bankrupt', 'fraud', 'hack', 'breach', 'shutdown', 'delay',
]);

const AMPLIFIERS = new Set([
  'very', 'extremely', 'significantly', 'major', 'massive', 'historic',
  'unprecedented', 'critical', 'huge', 'dramatic',
]);

const DIMINISHERS = new Set([
  'slightly', 'somewhat', 'marginally', 'minor', 'possibly', 'might',
  'could', 'potential', 'rumored',
]);

interface CacheEntry {
  data: NewsArticle[];
  expiresAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class NewsFetcher {
  private cache: Map<string, CacheEntry> = new Map();
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private config = getConfig();

  scoreSentiment(text: string): number {
    const words = text.toLowerCase().split(/\W+/);
    let score = 0;
    let multiplier = 1;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      if (AMPLIFIERS.has(word)) {
        multiplier = 1.5;
        continue;
      }
      if (DIMINISHERS.has(word)) {
        multiplier = 0.5;
        continue;
      }

      if (POSITIVE_WORDS.has(word)) {
        score += 0.15 * multiplier;
      } else if (NEGATIVE_WORDS.has(word)) {
        score -= 0.15 * multiplier;
      }

      multiplier = 1;
    }

    return Math.max(-1, Math.min(1, score));
  }

  async fetchHeadlines(query: string): Promise<NewsArticle[]> {
    const cacheKey = `headlines:${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const axios = (await import('axios')).default;
      const resp = await axios.get(`${this.config.newsApi.baseUrl}/everything`, {
        params: {
          q: query,
          sortBy: 'publishedAt',
          pageSize: 20,
          language: 'en',
          apiKey: this.config.newsApi.apiKey,
        },
        timeout: 10000,
      });

      const articles: NewsArticle[] = (resp.data.articles || []).map((a: any) => {
        const text = `${a.title || ''} ${a.description || ''}`;
        return {
          title: a.title || '',
          description: a.description || '',
          url: a.url || '',
          publishedAt: a.publishedAt || '',
          source: a.source?.name || '',
          sentimentScore: this.scoreSentiment(text),
        };
      });

      this.cache.set(cacheKey, { data: articles, expiresAt: Date.now() + CACHE_TTL });
      return articles;
    } catch (err) {
      console.error(`[NewsFetcher] Failed to fetch headlines for "${query}":`, err);
      return cached?.data || [];
    }
  }

  async fetchTop(category: string): Promise<NewsArticle[]> {
    const cacheKey = `top:${category}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const axios = (await import('axios')).default;
      const resp = await axios.get(`${this.config.newsApi.baseUrl}/top-headlines`, {
        params: {
          category,
          pageSize: 20,
          language: 'en',
          country: 'us',
          apiKey: this.config.newsApi.apiKey,
        },
        timeout: 10000,
      });

      const articles: NewsArticle[] = (resp.data.articles || []).map((a: any) => {
        const text = `${a.title || ''} ${a.description || ''}`;
        return {
          title: a.title || '',
          description: a.description || '',
          url: a.url || '',
          publishedAt: a.publishedAt || '',
          source: a.source?.name || '',
          sentimentScore: this.scoreSentiment(text),
        };
      });

      this.cache.set(cacheKey, { data: articles, expiresAt: Date.now() + CACHE_TTL });
      return articles;
    } catch (err) {
      console.error(`[NewsFetcher] Failed to fetch top for "${category}":`, err);
      return cached?.data || [];
    }
  }

  async fetchForMarket(market: { question: string; tags: string[] }): Promise<NewsArticle[]> {
    // Extract keywords from market question
    const stopWords = new Set([
      'will', 'the', 'be', 'to', 'of', 'and', 'a', 'in', 'is', 'it', 'for',
      'on', 'that', 'this', 'with', 'by', 'from', 'or', 'an', 'at', 'as',
      'before', 'after', 'during', 'between', 'than', 'more', 'less',
      'yes', 'no', 'do', 'does', 'did', 'has', 'have', 'had', 'not',
    ]);

    const keywords = market.question
      .replace(/[?!.,;:'"()[\]{}]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
      .slice(0, 5);

    const query = keywords.join(' ');
    if (!query) return [];

    return this.fetchHeadlines(query);
  }

  searchCache(query: string): NewsArticle[] {
    const q = query.toLowerCase();
    const allArticles: NewsArticle[] = [];

    for (const entry of this.cache.values()) {
      if (entry.expiresAt > Date.now()) {
        allArticles.push(...entry.data);
      }
    }

    return allArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }

  getAllCached(): NewsArticle[] {
    const all: NewsArticle[] = [];
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > Date.now()) {
        all.push(...entry.data);
      }
    }
    // Deduplicate by URL
    const seen = new Set<string>();
    return all.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
  }

  startBackgroundRefresh(queries: string[]): void {
    if (this.refreshInterval) return;

    this.refreshInterval = setInterval(async () => {
      for (const q of queries) {
        await this.fetchHeadlines(q).catch(() => {});
      }
    }, 3 * 60 * 1000); // Every 3 minutes
  }

  stopBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

// Singleton
const GLOBAL_KEY = '__news_fetcher__';

export function getNewsFetcher(): NewsFetcher {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new NewsFetcher();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

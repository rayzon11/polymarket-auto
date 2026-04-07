import axios from 'axios';
import { getConfig } from '@/lib/config';
import { NewsArticle } from '@/lib/agents/types';

// News Integration with multiple sources:
// 1. NewsAPI.org (if valid key provided)
// 2. Google News RSS fallback (free, no key needed)

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
  private hasValidApiKey: boolean;

  constructor() {
    const key = this.config.newsApi.apiKey;
    this.hasValidApiKey = !!key && !key.includes('YOUR_') && !key.includes('_HERE') && key.length > 10;
    if (!this.hasValidApiKey) {
      console.log('[NewsFetcher] No valid NEWS_API_KEY — using Google News RSS fallback (free)');
    }
  }

  scoreSentiment(text: string): number {
    const words = text.toLowerCase().split(/\W+/);
    let score = 0;
    let multiplier = 1;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (AMPLIFIERS.has(word)) { multiplier = 1.5; continue; }
      if (DIMINISHERS.has(word)) { multiplier = 0.5; continue; }
      if (POSITIVE_WORDS.has(word)) score += 0.15 * multiplier;
      else if (NEGATIVE_WORDS.has(word)) score -= 0.15 * multiplier;
      multiplier = 1;
    }

    return Math.max(-1, Math.min(1, score));
  }

  // --- Google News RSS fallback (no API key needed) ---
  private async fetchGoogleNewsRSS(query: string): Promise<NewsArticle[]> {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const resp = await axios.get(url, { timeout: 10000, responseType: 'text' });
      const xml = resp.data as string;

      // Simple XML parsing for RSS items
      const articles: NewsArticle[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xml)) !== null && articles.length < 20) {
        const item = match[1];
        const title = this.extractXmlTag(item, 'title');
        const link = this.extractXmlTag(item, 'link');
        const pubDate = this.extractXmlTag(item, 'pubDate');
        const source = this.extractXmlTag(item, 'source');
        const description = this.extractXmlTag(item, 'description')
          .replace(/<[^>]*>/g, '').slice(0, 300); // Strip HTML

        if (title) {
          articles.push({
            title,
            description,
            url: link,
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            source: source || 'Google News',
            sentimentScore: this.scoreSentiment(`${title} ${description}`),
          });
        }
      }

      return articles;
    } catch (err) {
      console.error(`[NewsFetcher] Google News RSS failed for "${query}":`, err);
      return [];
    }
  }

  private extractXmlTag(xml: string, tag: string): string {
    // Handle both <tag>text</tag> and <tag><![CDATA[text]]></tag>
    const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
    if (cdataMatch) return cdataMatch[1].trim();
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1].trim() : '';
  }

  // --- NewsAPI.org (requires valid key) ---
  private async fetchNewsAPI(query: string, endpoint: string, params: Record<string, any>): Promise<NewsArticle[]> {
    try {
      const resp = await axios.get(`${this.config.newsApi.baseUrl}/${endpoint}`, {
        params: { ...params, apiKey: this.config.newsApi.apiKey },
        timeout: 10000,
      });

      return (resp.data.articles || []).map((a: any) => {
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
    } catch (err) {
      console.error(`[NewsFetcher] NewsAPI failed for "${query}":`, err);
      return [];
    }
  }

  async fetchHeadlines(query: string): Promise<NewsArticle[]> {
    const cacheKey = `headlines:${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    let articles: NewsArticle[];

    if (this.hasValidApiKey) {
      articles = await this.fetchNewsAPI(query, 'everything', {
        q: query, sortBy: 'publishedAt', pageSize: 20, language: 'en',
      });
      // Fallback to RSS if NewsAPI returns nothing
      if (articles.length === 0) {
        articles = await this.fetchGoogleNewsRSS(query);
      }
    } else {
      articles = await this.fetchGoogleNewsRSS(query);
    }

    this.cache.set(cacheKey, { data: articles, expiresAt: Date.now() + CACHE_TTL });
    return articles;
  }

  async fetchTop(category: string): Promise<NewsArticle[]> {
    const cacheKey = `top:${category}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    let articles: NewsArticle[];

    if (this.hasValidApiKey) {
      articles = await this.fetchNewsAPI(category, 'top-headlines', {
        category, pageSize: 20, language: 'en', country: 'us',
      });
      if (articles.length === 0) {
        articles = await this.fetchGoogleNewsRSS(category);
      }
    } else {
      articles = await this.fetchGoogleNewsRSS(category);
    }

    this.cache.set(cacheKey, { data: articles, expiresAt: Date.now() + CACHE_TTL });
    return articles;
  }

  async fetchForMarket(market: { question: string; tags: string[] }): Promise<NewsArticle[]> {
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

    // Add tags for better results
    const tagWords = (market.tags || []).slice(0, 2);
    const query = [...keywords, ...tagWords].join(' ');
    if (!query) return [];

    return this.fetchHeadlines(query);
  }

  // --- Fetch multiple categories at once (for dashboard) ---
  async fetchAll(): Promise<NewsArticle[]> {
    const categories = ['politics', 'business', 'technology', 'sports', 'crypto bitcoin', 'world economy'];
    const results = await Promise.allSettled(
      categories.map((c) => this.fetchHeadlines(c)),
    );

    const all: NewsArticle[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }

    // Deduplicate and sort by date
    const seen = new Set<string>();
    return all
      .filter((a) => { if (seen.has(a.url)) return false; seen.add(a.url); return true; })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 50);
  }

  searchCache(query: string): NewsArticle[] {
    const q = query.toLowerCase();
    const allArticles: NewsArticle[] = [];
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > Date.now()) allArticles.push(...entry.data);
    }
    return allArticles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q),
    );
  }

  getAllCached(): NewsArticle[] {
    const all: NewsArticle[] = [];
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > Date.now()) all.push(...entry.data);
    }
    const seen = new Set<string>();
    return all.filter((a) => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
  }

  startBackgroundRefresh(queries: string[]): void {
    if (this.refreshInterval) return;
    this.refreshInterval = setInterval(async () => {
      for (const q of queries) await this.fetchHeadlines(q).catch(() => {});
    }, 3 * 60 * 1000);
  }

  stopBackgroundRefresh(): void {
    if (this.refreshInterval) { clearInterval(this.refreshInterval); this.refreshInterval = null; }
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

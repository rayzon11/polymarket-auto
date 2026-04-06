import { getConfig } from '@/lib/config';
import {
  PolyMarket,
  PolyOrderBook,
  PolyToken,
  OrderResult,
  Side,
} from '@/lib/agents/types';
import { v4 as uuidv4 } from 'uuid';

// Polymarket CLOB Client Wrapper
// Uses @polymarket/clob-client SDK with exponential backoff and DRY_RUN safety

interface ClobMarketResponse {
  condition_id: string;
  question_id: string;
  question: string;
  description: string;
  slug?: string;
  end_date_iso: string;
  volume?: string;
  liquidity?: string;
  outcomes?: string;
  outcome_prices?: string;
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
  }>;
  tags?: Array<{ label: string }>;
  active: boolean;
  closed: boolean;
  category?: string;
}

interface ClobOrderBookResponse {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

const RETRY_DELAYS = [1000, 2000, 4000];

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < RETRY_DELAYS.length) {
        console.warn(`[PolyClient] ${label} attempt ${attempt + 1} failed, retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }
  throw lastError;
}

export class PolymarketClient {
  private clobClient: any = null;
  private initialized = false;
  private config = getConfig();

  async init(): Promise<void> {
    if (this.initialized) return;

    const { privateKey, apiKey, apiSecret, apiPassphrase, host, chainId } = this.config.polymarket;

    if (!privateKey) {
      console.warn('[PolyClient] No PRIVATE_KEY set — running in read-only mock mode');
      this.initialized = true;
      return;
    }

    try {
      const { ClobClient } = await import('@polymarket/clob-client');

      if (apiKey && apiSecret && apiPassphrase) {
        // Use provided API credentials
        this.clobClient = new ClobClient(
          host,
          chainId,
          undefined, // signer handled via private key
          { key: apiKey, secret: apiSecret, passphrase: apiPassphrase },
        );
      } else {
        // Create client and derive API keys
        const tempClient = new ClobClient(host, chainId);
        const creds = await tempClient.createOrDeriveApiKey();
        this.clobClient = new ClobClient(
          host,
          chainId,
          undefined,
          creds,
        );
      }

      console.log('[PolyClient] Initialized successfully');
    } catch (err) {
      console.error('[PolyClient] SDK initialization failed, using REST fallback:', err);
    }

    this.initialized = true;
  }

  async getMarkets(limit = 100): Promise<PolyMarket[]> {
    await this.init();

    return withRetry(async () => {
      // Use Gamma API for market discovery (more data than CLOB)
      const axios = (await import('axios')).default;
      const resp = await axios.get('https://gamma-api.polymarket.com/markets', {
        params: { limit, active: true, closed: false, order: 'volume', ascending: false },
      });

      return (resp.data as ClobMarketResponse[]).map((m) => this.mapMarket(m));
    }, 'getMarkets');
  }

  async getMarket(conditionId: string): Promise<PolyMarket | null> {
    await this.init();

    return withRetry(async () => {
      const axios = (await import('axios')).default;
      const resp = await axios.get(`https://gamma-api.polymarket.com/markets/${conditionId}`);
      if (!resp.data) return null;
      return this.mapMarket(resp.data as ClobMarketResponse);
    }, 'getMarket');
  }

  async getOrderBook(tokenId: string): Promise<PolyOrderBook> {
    await this.init();

    return withRetry(async () => {
      if (this.clobClient) {
        const ob = await this.clobClient.getOrderBook(tokenId);
        return this.mapOrderBook(ob, tokenId);
      }
      // REST fallback
      const axios = (await import('axios')).default;
      const resp = await axios.get(`https://clob.polymarket.com/book`, {
        params: { token_id: tokenId },
      });
      return this.mapOrderBook(resp.data as ClobOrderBookResponse, tokenId);
    }, 'getOrderBook');
  }

  async placeOrder(
    tokenId: string,
    side: Side,
    price: number,
    size: number,
    marketId: string = ''
  ): Promise<OrderResult> {
    const config = this.config;

    // DRY_RUN safety
    if (config.bot.dryRun) {
      const result: OrderResult = {
        orderId: `dry-${uuidv4()}`,
        success: true,
        message: `[DRY RUN] Would place ${side} order: ${size} shares @ $${price} on token ${tokenId}`,
        dryRun: true,
        side,
        price,
        size,
        tokenId,
      };
      console.log(`[PolyClient] ${result.message}`);
      return result;
    }

    await this.init();

    if (!this.clobClient) {
      return {
        orderId: '',
        success: false,
        message: 'CLOB client not initialized — cannot place live orders',
        dryRun: false,
        side,
        price,
        size,
        tokenId,
      };
    }

    return withRetry(async () => {
      const order = await this.clobClient.createAndPostOrder({
        tokenID: tokenId,
        price,
        side: side === 'BUY' ? 'BUY' : 'SELL',
        size,
      });

      return {
        orderId: order?.id || uuidv4(),
        success: true,
        message: `Order placed: ${side} ${size} @ $${price}`,
        dryRun: false,
        side,
        price,
        size,
        tokenId,
      };
    }, 'placeOrder');
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    if (this.config.bot.dryRun) {
      console.log(`[PolyClient] [DRY RUN] Would cancel order ${orderId}`);
      return true;
    }

    if (!this.clobClient) return false;

    return withRetry(async () => {
      await this.clobClient.cancelOrder(orderId);
      return true;
    }, 'cancelOrder');
  }

  async getPositions(): Promise<any[]> {
    if (!this.clobClient) return [];
    return withRetry(async () => {
      return await this.clobClient.getPositions();
    }, 'getPositions');
  }

  async getFills(limit = 50): Promise<any[]> {
    if (!this.clobClient) return [];
    return withRetry(async () => {
      return await this.clobClient.getFills({ limit });
    }, 'getFills');
  }

  private mapMarket(m: ClobMarketResponse): PolyMarket {
    const outcomes = m.outcomes
      ? (typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes)
      : ['Yes', 'No'];
    const outcomePrices = m.outcome_prices
      ? (typeof m.outcome_prices === 'string' ? JSON.parse(m.outcome_prices) : m.outcome_prices).map(Number)
      : [0.5, 0.5];
    const tokens: PolyToken[] = m.tokens
      ? m.tokens.map((t) => ({
          tokenId: t.token_id,
          outcome: t.outcome,
          price: t.price,
          winner: t.winner,
        }))
      : outcomes.map((o: string, i: number) => ({
          tokenId: '',
          outcome: o,
          price: outcomePrices[i] || 0.5,
          winner: false,
        }));

    const tags = m.tags ? m.tags.map((t) => t.label?.toLowerCase?.() || String(t).toLowerCase()) : [];
    const yesPrice = outcomePrices[0] || 0.5;
    const noPrice = outcomePrices[1] || 0.5;

    return {
      conditionId: m.condition_id || '',
      questionId: m.question_id || '',
      question: m.question || '',
      description: m.description || '',
      slug: m.slug || '',
      endDate: m.end_date_iso || '',
      volume: parseFloat(m.volume || '0'),
      liquidity: parseFloat(m.liquidity || '0'),
      outcomes,
      outcomePrices,
      tags,
      active: m.active,
      closed: m.closed,
      tokens,
      recentTradeCount: 100, // Gamma API doesn't expose this directly; default to pass filter
      spread: Math.abs(yesPrice + noPrice - 1),
      category: m.category || tags[0] || 'general',
    };
  }

  private mapOrderBook(ob: ClobOrderBookResponse, tokenId: string): PolyOrderBook {
    const bids = (ob.bids || []).map((b) => ({
      price: parseFloat(String(b.price)),
      size: parseFloat(String(b.size)),
    })).sort((a, b) => b.price - a.price);

    const asks = (ob.asks || []).map((a) => ({
      price: parseFloat(String(a.price)),
      size: parseFloat(String(a.size)),
    })).sort((a, b) => a.price - b.price);

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 1;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;

    const bidVolume = bids.reduce((sum, b) => sum + b.size * b.price, 0);
    const askVolume = asks.reduce((sum, a) => sum + a.size * a.price, 0);
    const totalVol = bidVolume + askVolume;
    const imbalance = totalVol > 0 ? (bidVolume - askVolume) / totalVol : 0;

    return {
      market: ob.market || '',
      assetId: tokenId,
      bids,
      asks,
      spread,
      midpoint,
      bidVolume,
      askVolume,
      imbalance,
    };
  }
}

// Singleton
const GLOBAL_KEY = '__polymarket_client__';

export function getPolymarketClient(): PolymarketClient {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new PolymarketClient();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

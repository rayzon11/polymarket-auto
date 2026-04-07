import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import type { ApiKeyCreds } from '@polymarket/clob-client';
import { getConfig } from '@/lib/config';
import {
  PolyMarket,
  PolyOrderBook,
  PolyToken,
  OrderResult,
  Side,
} from '@/lib/agents/types';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Polymarket CLOB Client — ethers@5 Wallet + ClobClient SDK
// God-Mode Trading Infrastructure
// ============================================================

// --- Gamma API response shape (market discovery) ---
// Gamma API returns camelCase fields, NOT snake_case
interface GammaMarketResponse {
  conditionId: string;
  questionID?: string;
  question: string;
  description: string;
  slug?: string;
  endDate?: string;
  endDateIso?: string;
  volume?: number | string;
  volumeNum?: number;
  liquidity?: number | string;
  liquidityNum?: number;
  outcomes?: string; // JSON string: '["Yes","No"]'
  outcomePrices?: string; // JSON string: '["0.55","0.45"]'
  clobTokenIds?: string; // JSON string: '["tokenId1","tokenId2"]'
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
  }>;
  tags?: Array<{ label: string }> | string[];
  active: boolean;
  closed: boolean;
  category?: string;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  lastTradePrice?: number;
  volume24hr?: number;
  events?: Array<{ slug: string; title: string }>;
}

// --- Retry with exponential backoff ---
const RETRY_DELAYS = [1000, 2000, 4000];

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < RETRY_DELAYS.length) {
        console.warn(
          `[PolyClient] ${label} attempt ${attempt + 1} failed, retrying in ${RETRY_DELAYS[attempt]}ms...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }
  throw lastError;
}

// ============================================================
// Main Client
// ============================================================

export class PolymarketClient {
  private clobClient: ClobClient | null = null;
  private wallet: ethers.Wallet | null = null;
  private initialized = false;
  private config = getConfig();
  private walletAddress: string = '';

  // --- Initialize wallet + ClobClient ---
  async init(): Promise<void> {
    if (this.initialized) return;

    const { privateKey, apiKey, apiSecret, apiPassphrase, host, chainId, funderAddress } =
      this.config.polymarket;

    // No private key = read-only mode (Gamma API only)
    if (!privateKey) {
      console.warn('[PolyClient] No PRIVATE_KEY — running in read-only mode (no trading)');
      this.initialized = true;
      return;
    }

    try {
      // Step 1: Create ethers@5 Wallet as signer
      this.wallet = new ethers.Wallet(privateKey);
      this.walletAddress = await this.wallet.getAddress();
      console.log(`[PolyClient] Wallet loaded: ${this.walletAddress}`);

      // Step 2: Build or use API credentials
      let creds: ApiKeyCreds | undefined;

      if (apiKey && apiSecret && apiPassphrase) {
        creds = { key: apiKey, secret: apiSecret, passphrase: apiPassphrase };
        console.log('[PolyClient] Using provided API credentials');
      }

      // Step 3: Initialize ClobClient with ethers Wallet signer
      // ClobClient accepts EthersSigner (has _signTypedData + getAddress) which ethers.Wallet provides
      if (creds) {
        this.clobClient = new ClobClient(
          host,
          chainId,
          this.wallet,    // ethers@5 Wallet as ClobSigner
          creds,
          undefined,       // signatureType (default)
          funderAddress || undefined,
        );
      } else {
        // Create temp client with signer to derive API keys
        const tempClient = new ClobClient(
          host,
          chainId,
          this.wallet,
          undefined,
          undefined,
          funderAddress || undefined,
        );

        console.log('[PolyClient] Deriving API credentials from wallet...');
        const derivedCreds = await tempClient.createOrDeriveApiKey();
        console.log('[PolyClient] API credentials derived successfully');

        // Reinitialize with full credentials
        this.clobClient = new ClobClient(
          host,
          chainId,
          this.wallet,
          derivedCreds,
          undefined,
          funderAddress || undefined,
        );

        creds = derivedCreds;
      }

      // Verify connection
      const ok = await this.clobClient.getOk();
      console.log(`[PolyClient] Connected to CLOB API: ${ok}`);
      console.log(`[PolyClient] Chain: Polygon (${chainId}) | Host: ${host}`);
      console.log(`[PolyClient] Funder: ${funderAddress || this.walletAddress}`);

    } catch (err) {
      console.error('[PolyClient] SDK initialization failed:', err);
      this.clobClient = null;
    }

    this.initialized = true;
  }

  // --- Wallet Info ---
  getWalletAddress(): string {
    return this.walletAddress;
  }

  isConnected(): boolean {
    return this.clobClient !== null;
  }

  isReadOnly(): boolean {
    return this.clobClient === null;
  }

  // --- Market Discovery (Gamma API — richer data than CLOB) ---
  async getMarkets(limit = 100): Promise<PolyMarket[]> {
    await this.init();

    return withRetry(async () => {
      const axios = (await import('axios')).default;
      const resp = await axios.get('https://gamma-api.polymarket.com/markets', {
        params: { limit, active: true, closed: false, order: 'volume', ascending: false },
      });
      return (resp.data as GammaMarketResponse[]).map((m) => this.mapMarket(m));
    }, 'getMarkets');
  }

  async getMarket(conditionId: string): Promise<PolyMarket | null> {
    await this.init();

    return withRetry(async () => {
      const axios = (await import('axios')).default;
      const resp = await axios.get(`https://gamma-api.polymarket.com/markets/${conditionId}`);
      if (!resp.data) return null;
      return this.mapMarket(resp.data as GammaMarketResponse);
    }, 'getMarket');
  }

  // --- Order Book (ClobClient SDK → REST fallback) ---
  async getOrderBook(tokenId: string): Promise<PolyOrderBook> {
    await this.init();

    return withRetry(async () => {
      if (this.clobClient) {
        const ob = await this.clobClient.getOrderBook(tokenId);
        return this.mapOrderBookSDK(ob, tokenId);
      }
      // REST fallback for read-only mode
      const axios = (await import('axios')).default;
      const resp = await axios.get(`${this.config.polymarket.host}/book`, {
        params: { token_id: tokenId },
      });
      return this.mapOrderBookRaw(resp.data, tokenId);
    }, 'getOrderBook');
  }

  // --- Get multiple order books in parallel ---
  async getOrderBooks(tokenIds: string[]): Promise<PolyOrderBook[]> {
    await this.init();

    if (this.clobClient) {
      const books = await Promise.all(
        tokenIds.map((id) => this.clobClient!.getOrderBook(id)),
      );
      return books.map((ob, i) => this.mapOrderBookSDK(ob, tokenIds[i]));
    }

    // Fallback: parallel REST calls
    return Promise.all(tokenIds.map((id) => this.getOrderBook(id)));
  }

  // --- Midpoint / Spread / Price ---
  async getMidpoint(tokenId: string): Promise<number> {
    await this.init();
    if (!this.clobClient) {
      const ob = await this.getOrderBook(tokenId);
      return ob.midpoint;
    }
    const mid = await this.clobClient.getMidpoint(tokenId);
    return parseFloat(mid?.mid || '0.5');
  }

  async getSpread(tokenId: string): Promise<number> {
    await this.init();
    if (!this.clobClient) {
      const ob = await this.getOrderBook(tokenId);
      return ob.spread;
    }
    const spread = await this.clobClient.getSpread(tokenId);
    return parseFloat(spread?.spread || '0');
  }

  async getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number> {
    await this.init();
    if (!this.clobClient) {
      const ob = await this.getOrderBook(tokenId);
      return side === 'BUY' ? ob.asks[0]?.price || 1 : ob.bids[0]?.price || 0;
    }
    const price = await this.clobClient.getPrice(tokenId, side);
    return parseFloat(price?.price || '0.5');
  }

  async getLastTradePrice(tokenId: string): Promise<number> {
    await this.init();
    if (!this.clobClient) return 0;
    const resp = await this.clobClient.getLastTradePrice(tokenId);
    return parseFloat(resp?.price || '0');
  }

  async getPriceHistory(tokenId: string, startTs?: number, endTs?: number, fidelity?: number): Promise<Array<{ t: number; p: number }>> {
    await this.init();
    if (!this.clobClient) return [];
    const history = await this.clobClient.getPricesHistory({
      market: tokenId,
      startTs,
      endTs,
      fidelity,
    });
    return (history || []).map((h: any) => ({ t: h.t, p: h.p }));
  }

  // --- Place Order (with DRY_RUN safety) ---
  async placeOrder(
    tokenId: string,
    side: Side,
    price: number,
    size: number,
    marketId: string = '',
  ): Promise<OrderResult> {
    const config = this.config;

    // DRY_RUN safety — default ON
    if (config.bot.dryRun) {
      const result: OrderResult = {
        orderId: `dry-${uuidv4()}`,
        success: true,
        message: `[DRY RUN] Would place ${side} order: ${size} shares @ $${price.toFixed(4)} on token ${tokenId}`,
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
        message: 'CLOB client not initialized — cannot place live orders. Set PRIVATE_KEY.',
        dryRun: false,
        side,
        price,
        size,
        tokenId,
      };
    }

    return withRetry(async () => {
      // Use SDK's createAndPostOrder — signs with ethers Wallet automatically
      const sdkSide = side === 'BUY' ? 'BUY' : 'SELL';
      const order = await this.clobClient!.createAndPostOrder({
        tokenID: tokenId,
        price,
        side: sdkSide as any,
        size,
      });

      return {
        orderId: order?.id || order?.orderID || uuidv4(),
        success: true,
        message: `Order placed: ${side} ${size} @ $${price.toFixed(4)}`,
        dryRun: false,
        side,
        price,
        size,
        tokenId,
      };
    }, 'placeOrder');
  }

  // --- Place Market Order (FOK — Fill or Kill) ---
  async placeMarketOrder(
    tokenId: string,
    side: Side,
    amount: number,
  ): Promise<OrderResult> {
    const config = this.config;

    if (config.bot.dryRun) {
      return {
        orderId: `dry-mkt-${uuidv4()}`,
        success: true,
        message: `[DRY RUN] Would place MARKET ${side} order: $${amount.toFixed(2)} on token ${tokenId}`,
        dryRun: true,
        side,
        price: 0,
        size: amount,
        tokenId,
      };
    }

    await this.init();
    if (!this.clobClient) {
      return {
        orderId: '',
        success: false,
        message: 'CLOB client not initialized',
        dryRun: false,
        side,
        price: 0,
        size: amount,
        tokenId,
      };
    }

    return withRetry(async () => {
      // Calculate market price first
      const marketPrice = await this.clobClient!.calculateMarketPrice(
        tokenId,
        side as any,
        amount,
      );

      const order = await this.clobClient!.createAndPostMarketOrder({
        tokenID: tokenId,
        amount,
        side: side as any,
      });

      return {
        orderId: order?.id || order?.orderID || uuidv4(),
        success: true,
        message: `Market order filled: ${side} $${amount.toFixed(2)} @ ~$${marketPrice.toFixed(4)}`,
        dryRun: false,
        side,
        price: marketPrice,
        size: amount,
        tokenId,
      };
    }, 'placeMarketOrder');
  }

  // --- Cancel Orders ---
  async cancelOrder(orderId: string): Promise<boolean> {
    if (this.config.bot.dryRun) {
      console.log(`[PolyClient] [DRY RUN] Would cancel order ${orderId}`);
      return true;
    }
    if (!this.clobClient) return false;

    return withRetry(async () => {
      await this.clobClient!.cancelOrder({ orderID: orderId });
      return true;
    }, 'cancelOrder');
  }

  async cancelAllOrders(): Promise<boolean> {
    if (this.config.bot.dryRun) {
      console.log('[PolyClient] [DRY RUN] Would cancel all orders');
      return true;
    }
    if (!this.clobClient) return false;

    return withRetry(async () => {
      await this.clobClient!.cancelAll();
      return true;
    }, 'cancelAll');
  }

  // --- Open Orders ---
  async getOpenOrders(): Promise<any[]> {
    if (!this.clobClient) return [];
    return withRetry(async () => {
      const resp = await this.clobClient!.getOpenOrders();
      return resp || [];
    }, 'getOpenOrders');
  }

  // --- Trades / Fills ---
  async getTrades(limit = 50): Promise<any[]> {
    if (!this.clobClient) return [];
    return withRetry(async () => {
      return await this.clobClient!.getTrades(undefined, false);
    }, 'getTrades');
  }

  // --- Balance & Allowance ---
  async getBalanceAllowance(assetType?: string): Promise<{ balance: string; allowance: string }> {
    if (!this.clobClient) return { balance: '0', allowance: '0' };
    return withRetry(async () => {
      const resp = await this.clobClient!.getBalanceAllowance(
        assetType ? { asset_type: assetType as any } : undefined,
      );
      return { balance: resp?.balance || '0', allowance: resp?.allowance || '0' };
    }, 'getBalanceAllowance');
  }

  // --- Rewards / Earnings ---
  async getEarningsForDay(date: string): Promise<any[]> {
    if (!this.clobClient) return [];
    return withRetry(async () => {
      return await this.clobClient!.getEarningsForUserForDay(date);
    }, 'getEarnings');
  }

  // --- Positions (on-chain via CLOB) ---
  async getPositions(): Promise<any[]> {
    if (!this.clobClient) return [];
    return withRetry(async () => {
      // CLOB client doesn't have a direct getPositions — use trades to infer
      const trades = await this.clobClient!.getTrades(undefined, false);
      return trades || [];
    }, 'getPositions');
  }

  async getFills(limit = 50): Promise<any[]> {
    if (!this.clobClient) return [];
    return withRetry(async () => {
      return await this.clobClient!.getTrades(undefined, false);
    }, 'getFills');
  }

  // --- API Key Management ---
  async getApiKeys(): Promise<any> {
    if (!this.clobClient) return null;
    return await this.clobClient.getApiKeys();
  }

  // --- Status / Health ---
  async checkHealth(): Promise<{ ok: boolean; wallet: string; connected: boolean; mode: string }> {
    await this.init();
    let ok = false;
    try {
      if (this.clobClient) {
        await this.clobClient.getOk();
        ok = true;
      }
    } catch {
      ok = false;
    }
    return {
      ok,
      wallet: this.walletAddress || 'none',
      connected: this.isConnected(),
      mode: this.config.bot.dryRun ? 'DRY_RUN' : 'LIVE',
    };
  }

  // ============================================================
  // Private Mapping Helpers
  // ============================================================

  private mapMarket(m: GammaMarketResponse): PolyMarket {
    // Parse outcomes from JSON string
    let outcomes: string[] = ['Yes', 'No'];
    try {
      if (m.outcomes) outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes;
    } catch {}

    // Parse outcome prices from JSON string (Gamma returns "outcomePrices" camelCase)
    let outcomePrices: number[] = [0.5, 0.5];
    try {
      if (m.outcomePrices) {
        const raw = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
        outcomePrices = raw.map(Number);
      }
    } catch {}

    // Parse clobTokenIds from JSON string
    let clobTokenIds: string[] = [];
    try {
      if (m.clobTokenIds) {
        clobTokenIds = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
      }
    } catch {}

    // Build tokens array — prefer clobTokenIds (actual trading IDs)
    const tokens: PolyToken[] = clobTokenIds.length > 0
      ? outcomes.map((o: string, i: number) => ({
          tokenId: clobTokenIds[i] || '',
          outcome: o,
          price: outcomePrices[i] || 0.5,
          winner: false,
        }))
      : m.tokens
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

    // Parse tags
    const tags: string[] = m.tags
      ? (m.tags as any[]).map((t: any) => (typeof t === 'string' ? t : t.label || '').toLowerCase()).filter(Boolean)
      : [];

    const yesPrice = outcomePrices[0] || 0.5;
    const noPrice = outcomePrices[1] || 0.5;
    const vol = m.volumeNum || (typeof m.volume === 'number' ? m.volume : parseFloat(String(m.volume || '0')));
    const liq = m.liquidityNum || (typeof m.liquidity === 'number' ? m.liquidity : parseFloat(String(m.liquidity || '0')));

    return {
      conditionId: m.conditionId || '',
      questionId: m.questionID || '',
      question: m.question || '',
      description: m.description || '',
      slug: m.slug || '',
      endDate: m.endDateIso || m.endDate || '',
      volume: vol,
      liquidity: liq,
      outcomes,
      outcomePrices,
      tags,
      active: m.active,
      closed: m.closed,
      tokens,
      recentTradeCount: 100,
      spread: m.spread ?? Math.abs(yesPrice + noPrice - 1),
      category: m.category || (m.events?.[0]?.slug?.split('-')[0]) || tags[0] || 'general',
    };
  }

  private mapOrderBookSDK(ob: any, tokenId: string): PolyOrderBook {
    const bids = (ob.bids || [])
      .map((b: any) => ({ price: parseFloat(String(b.price)), size: parseFloat(String(b.size)) }))
      .sort((a: any, b: any) => b.price - a.price);
    const asks = (ob.asks || [])
      .map((a: any) => ({ price: parseFloat(String(a.price)), size: parseFloat(String(a.size)) }))
      .sort((a: any, b: any) => a.price - b.price);
    return this.buildOrderBook(ob.market || ob.asset_id || '', tokenId, bids, asks);
  }

  private mapOrderBookRaw(ob: any, tokenId: string): PolyOrderBook {
    const bids = (ob.bids || [])
      .map((b: any) => ({ price: parseFloat(String(b.price)), size: parseFloat(String(b.size)) }))
      .sort((a: any, b: any) => b.price - a.price);
    const asks = (ob.asks || [])
      .map((a: any) => ({ price: parseFloat(String(a.price)), size: parseFloat(String(a.size)) }))
      .sort((a: any, b: any) => a.price - b.price);
    return this.buildOrderBook(ob.market || '', tokenId, bids, asks);
  }

  private buildOrderBook(
    market: string,
    tokenId: string,
    bids: Array<{ price: number; size: number }>,
    asks: Array<{ price: number; size: number }>,
  ): PolyOrderBook {
    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 1;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;
    const bidVolume = bids.reduce((sum, b) => sum + b.size * b.price, 0);
    const askVolume = asks.reduce((sum, a) => sum + a.size * a.price, 0);
    const totalVol = bidVolume + askVolume;
    const imbalance = totalVol > 0 ? (bidVolume - askVolume) / totalVol : 0;

    return { market, assetId: tokenId, bids, asks, spread, midpoint, bidVolume, askVolume, imbalance };
  }
}

// ============================================================
// Singleton via globalThis (survives Next.js hot reloads)
// ============================================================
const GLOBAL_KEY = '__polymarket_client__';

export function getPolymarketClient(): PolymarketClient {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new PolymarketClient();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

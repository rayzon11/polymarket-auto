import { getPolymarketClient } from '@/lib/polymarket/client';

// ============================================================
// Whale Tracker — Monitor Large Trades & Track Whale Wallets
// Polymarket CLOB Intelligence Layer
// ============================================================

// --- Interfaces ---

export interface WhaleAlert {
  address: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  tokenId: string;
  market: string;
  timestamp: string;
  impact: number; // estimated price impact as percentage (0-1)
}

export interface WhaleWalletStats {
  address: string;
  totalVolume: number;
  tradeCount: number;
  avgSize: number;
  firstSeen: string;
  lastSeen: string;
  buyVolume: number;
  sellVolume: number;
  netFlow: number; // positive = net buyer, negative = net seller
  tokenActivity: Record<string, { buys: number; sells: number; volume: number }>;
}

export interface WhaleActivityReport {
  tokenId: string;
  buyPressure: number;   // total whale buy volume
  sellPressure: number;  // total whale sell volume
  netFlow: number;       // buy - sell
  whaleCount: number;    // distinct whale addresses active on this token
  largestTrade: WhaleAlert | null;
  recentAlerts: WhaleAlert[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

// --- Internal trade shape from CLOB client ---

interface RawTrade {
  id?: string;
  taker_order_id?: string;
  maker_address?: string;
  taker_address?: string;
  market?: string;
  asset_id?: string;
  token_id?: string;
  side?: string;
  size?: string | number;
  price?: string | number;
  timestamp?: string | number;
  match_time?: string | number;
  status?: string;
  owner?: string;
  maker_orders?: Array<{
    maker_address?: string;
    matched_amount?: string | number;
    price?: string | number;
  }>;
}

// ============================================================
// WhaleTracker Class
// ============================================================

export class WhaleTracker {
  private alerts: WhaleAlert[] = [];
  private wallets: Map<string, WhaleWalletStats> = new Map();
  private maxAlerts = 5000;
  private maxWallets = 2000;

  // --- Scan recent trades for whale-sized orders ---
  async trackLargeOrders(minSize: number = 1000): Promise<WhaleAlert[]> {
    const client = getPolymarketClient();
    const newAlerts: WhaleAlert[] = [];

    try {
      const trades = await client.getTrades(200);

      for (const trade of trades) {
        const raw = trade as RawTrade;
        const size = parseFloat(String(raw.size || '0'));
        const price = parseFloat(String(raw.price || '0'));
        const notional = size * price;

        // Skip sub-threshold trades
        if (notional < minSize) continue;

        const address = raw.taker_address || raw.maker_address || raw.owner || 'unknown';
        const side = this.parseSide(raw.side);
        const tokenId = raw.asset_id || raw.token_id || '';
        const market = raw.market || '';
        const timestamp = this.parseTimestamp(raw.match_time || raw.timestamp);

        // Skip if we already tracked this exact alert (dedup by address+token+timestamp)
        const dedup = `${address}:${tokenId}:${timestamp}`;
        if (this.alerts.some((a) => `${a.address}:${a.tokenId}:${a.timestamp}` === dedup)) {
          continue;
        }

        // Estimate price impact: larger orders relative to typical size move the market more.
        // Rough heuristic: impact scales with log of notional relative to threshold.
        const impact = Math.min(1, Math.log10(notional / minSize) / 3);

        const alert: WhaleAlert = {
          address,
          side,
          size: notional,
          price,
          tokenId,
          market,
          timestamp,
          impact,
        };

        newAlerts.push(alert);
        this.addAlert(alert);
        this.updateWalletStats(alert);

        // Also track maker side if present in maker_orders
        if (raw.maker_orders && Array.isArray(raw.maker_orders)) {
          for (const mo of raw.maker_orders) {
            const makerAddr = mo.maker_address || '';
            const makerAmount = parseFloat(String(mo.matched_amount || '0'));
            const makerPrice = parseFloat(String(mo.price || price));
            const makerNotional = makerAmount * makerPrice;

            if (makerAddr && makerNotional >= minSize) {
              const makerAlert: WhaleAlert = {
                address: makerAddr,
                side: side === 'BUY' ? 'SELL' : 'BUY', // maker is counterparty
                size: makerNotional,
                price: makerPrice,
                tokenId,
                market,
                timestamp,
                impact: Math.min(1, Math.log10(makerNotional / minSize) / 3),
              };

              const makerDedup = `${makerAddr}:${tokenId}:${timestamp}`;
              if (!this.alerts.some((a) => `${a.address}:${a.tokenId}:${a.timestamp}` === makerDedup)) {
                newAlerts.push(makerAlert);
                this.addAlert(makerAlert);
                this.updateWalletStats(makerAlert);
              }
            }
          }
        }
      }

      console.log(
        `[WhaleTracker] Scanned trades: ${newAlerts.length} whale alerts (threshold: $${minSize})`,
      );
    } catch (err) {
      console.error('[WhaleTracker] Failed to track large orders:', err);
    }

    return newAlerts;
  }

  // --- Get known whale wallets with aggregated stats ---
  getWhaleWallets(): WhaleWalletStats[] {
    return Array.from(this.wallets.values())
      .sort((a, b) => b.totalVolume - a.totalVolume);
  }

  // --- Get recent whale alerts ---
  getWhaleAlerts(limit: number = 50): WhaleAlert[] {
    const sorted = [...this.alerts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return sorted.slice(0, limit);
  }

  // --- Analyze whale buy/sell pressure on a specific token ---
  analyzeWhaleActivity(tokenId: string): WhaleActivityReport {
    const tokenAlerts = this.alerts.filter((a) => a.tokenId === tokenId);

    let buyPressure = 0;
    let sellPressure = 0;
    const whaleAddresses = new Set<string>();
    let largestTrade: WhaleAlert | null = null;

    for (const alert of tokenAlerts) {
      whaleAddresses.add(alert.address);

      if (alert.side === 'BUY') {
        buyPressure += alert.size;
      } else {
        sellPressure += alert.size;
      }

      if (!largestTrade || alert.size > largestTrade.size) {
        largestTrade = alert;
      }
    }

    const netFlow = buyPressure - sellPressure;
    const totalVolume = buyPressure + sellPressure;

    // Determine sentiment based on net flow ratio
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (totalVolume > 0) {
      const ratio = netFlow / totalVolume;
      if (ratio > 0.15) sentiment = 'bullish';
      else if (ratio < -0.15) sentiment = 'bearish';
    }

    // Most recent alerts for this token, capped at 20
    const recentAlerts = tokenAlerts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);

    return {
      tokenId,
      buyPressure,
      sellPressure,
      netFlow,
      whaleCount: whaleAddresses.size,
      largestTrade,
      recentAlerts,
      sentiment,
    };
  }

  // --- Compute a 0-100 whale bullishness score for a token ---
  getWhaleScore(tokenId: string): number {
    const activity = this.analyzeWhaleActivity(tokenId);

    // No whale data = neutral 50
    if (activity.buyPressure === 0 && activity.sellPressure === 0) {
      return 50;
    }

    const totalVolume = activity.buyPressure + activity.sellPressure;

    // Base score from buy/sell ratio (0-100 scale)
    const buyRatio = activity.buyPressure / totalVolume;
    let score = buyRatio * 100;

    // Boost for number of distinct whales agreeing on direction
    // More whales on one side = stronger conviction signal
    const tokenAlerts = this.alerts.filter((a) => a.tokenId === tokenId);
    const buyWhales = new Set(tokenAlerts.filter((a) => a.side === 'BUY').map((a) => a.address));
    const sellWhales = new Set(tokenAlerts.filter((a) => a.side === 'SELL').map((a) => a.address));

    const whaleConviction = buyWhales.size + sellWhales.size > 0
      ? (buyWhales.size - sellWhales.size) / (buyWhales.size + sellWhales.size)
      : 0;

    // Adjust score: conviction can shift it up to +/-10 points
    score += whaleConviction * 10;

    // Factor in recency: recent activity weighs more
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const recentAlerts = tokenAlerts.filter(
      (a) => now - new Date(a.timestamp).getTime() < oneHour,
    );

    if (recentAlerts.length > 0) {
      const recentBuyVol = recentAlerts
        .filter((a) => a.side === 'BUY')
        .reduce((sum, a) => sum + a.size, 0);
      const recentSellVol = recentAlerts
        .filter((a) => a.side === 'SELL')
        .reduce((sum, a) => sum + a.size, 0);
      const recentTotal = recentBuyVol + recentSellVol;

      if (recentTotal > 0) {
        const recentRatio = recentBuyVol / recentTotal;
        // Blend: 70% overall, 30% recent momentum
        score = score * 0.7 + recentRatio * 100 * 0.3;
      }
    }

    // Factor in high-impact trades: large trades that moved the market
    const highImpactAlerts = tokenAlerts.filter((a) => a.impact > 0.3);
    if (highImpactAlerts.length > 0) {
      const impactBuyVol = highImpactAlerts
        .filter((a) => a.side === 'BUY')
        .reduce((sum, a) => sum + a.size, 0);
      const impactSellVol = highImpactAlerts
        .filter((a) => a.side === 'SELL')
        .reduce((sum, a) => sum + a.size, 0);
      const impactTotal = impactBuyVol + impactSellVol;

      if (impactTotal > 0) {
        const impactBias = (impactBuyVol - impactSellVol) / impactTotal;
        // High-impact trades can nudge score up to +/-5 points
        score += impactBias * 5;
      }
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private addAlert(alert: WhaleAlert): void {
    this.alerts.push(alert);

    // Evict oldest alerts if we exceed the cap
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, this.maxAlerts);
    }
  }

  private updateWalletStats(alert: WhaleAlert): void {
    const existing = this.wallets.get(alert.address);

    if (existing) {
      existing.totalVolume += alert.size;
      existing.tradeCount += 1;
      existing.avgSize = existing.totalVolume / existing.tradeCount;
      existing.lastSeen = alert.timestamp;

      if (alert.side === 'BUY') {
        existing.buyVolume += alert.size;
      } else {
        existing.sellVolume += alert.size;
      }
      existing.netFlow = existing.buyVolume - existing.sellVolume;

      // Update per-token activity
      if (!existing.tokenActivity[alert.tokenId]) {
        existing.tokenActivity[alert.tokenId] = { buys: 0, sells: 0, volume: 0 };
      }
      const ta = existing.tokenActivity[alert.tokenId];
      ta.volume += alert.size;
      if (alert.side === 'BUY') {
        ta.buys += 1;
      } else {
        ta.sells += 1;
      }
    } else {
      // Enforce wallet cap — evict lowest-volume wallet if at limit
      if (this.wallets.size >= this.maxWallets) {
        let minAddr = '';
        let minVol = Infinity;
        for (const [addr, stats] of this.wallets) {
          if (stats.totalVolume < minVol) {
            minVol = stats.totalVolume;
            minAddr = addr;
          }
        }
        if (minAddr) this.wallets.delete(minAddr);
      }

      const tokenActivity: Record<string, { buys: number; sells: number; volume: number }> = {};
      tokenActivity[alert.tokenId] = {
        buys: alert.side === 'BUY' ? 1 : 0,
        sells: alert.side === 'SELL' ? 1 : 0,
        volume: alert.size,
      };

      this.wallets.set(alert.address, {
        address: alert.address,
        totalVolume: alert.size,
        tradeCount: 1,
        avgSize: alert.size,
        firstSeen: alert.timestamp,
        lastSeen: alert.timestamp,
        buyVolume: alert.side === 'BUY' ? alert.size : 0,
        sellVolume: alert.side === 'SELL' ? alert.size : 0,
        netFlow: alert.side === 'BUY' ? alert.size : -alert.size,
        tokenActivity,
      });
    }
  }

  private parseSide(side: string | undefined): 'BUY' | 'SELL' {
    if (!side) return 'BUY';
    const upper = side.toUpperCase();
    if (upper === 'SELL' || upper === 'S' || upper === '1') return 'SELL';
    return 'BUY';
  }

  private parseTimestamp(ts: string | number | undefined): string {
    if (!ts) return new Date().toISOString();
    if (typeof ts === 'number') {
      // Handle seconds vs milliseconds
      const ms = ts > 1e12 ? ts : ts * 1000;
      return new Date(ms).toISOString();
    }
    // Already an ISO string or parseable date string
    const parsed = new Date(ts);
    if (isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
  }
}

// ============================================================
// Singleton via globalThis (survives Next.js hot reloads)
// ============================================================

const GLOBAL_KEY = '__whale_tracker__';

export function getWhaleTracker(): WhaleTracker {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new WhaleTracker();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

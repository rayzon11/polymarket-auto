import { NextRequest, NextResponse } from 'next/server';
import { getPolymarketClient } from '@/lib/polymarket/client';
import { getNewsFetcher } from '@/lib/news/fetcher';
import { evaluateConsensus } from '@/lib/bot/consensus';
import { getTracker } from '@/lib/tracker/tracker';
import { getConfig } from '@/lib/config';
import { ScoutAgent } from '@/lib/agents/scout';
import { AnalystAgent } from '@/lib/agents/analyst';
import { StrategistAgent } from '@/lib/agents/strategist';
import { QuantAgent } from '@/lib/agents/quant';
import { OracleAgent } from '@/lib/agents/oracle';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = getConfig();
    const client = getPolymarketClient();
    const market = await client.getMarket(id);

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }

    const tokenId = market.tokens[0]?.tokenId;
    const orderbook = tokenId
      ? await client.getOrderBook(tokenId)
      : { market: id, assetId: '', bids: [], asks: [], spread: 0, midpoint: 0.5, bidVolume: 0, askVolume: 0, imbalance: 0 };

    const newsFetcher = getNewsFetcher();
    const news = await newsFetcher.fetchForMarket(market);

    // Run agents 1-4 in parallel
    const [scoutD, analystD, strategistD, quantD] = await Promise.all([
      new ScoutAgent().analyze(market, orderbook, news),
      new AnalystAgent().analyze(market, orderbook, news),
      new StrategistAgent().analyze(market, orderbook, news),
      new QuantAgent().analyze(market, orderbook, news),
    ]);

    const baseDecisions = [scoutD, analystD, strategistD, quantD];

    // Run Oracle with ensemble
    const oracleD = await new OracleAgent().analyze(market, orderbook, news, baseDecisions);
    const allDecisions = [...baseDecisions, oracleD];

    // Evaluate consensus
    const tracker = getTracker();
    const positions = await tracker.getPositions();
    const consensus = evaluateConsensus(allDecisions, market, orderbook, positions, config);

    return NextResponse.json({
      market,
      orderbook,
      newsCount: news.length,
      decisions: allDecisions,
      consensus,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

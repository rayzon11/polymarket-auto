'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Bot, TrendingUp, TrendingDown, DollarSign,
  Play, Square, Zap, BarChart3, Newspaper, Target,
  AlertCircle, CheckCircle, Clock, Shield,
} from 'lucide-react';

// Types for API responses
interface BotStatus {
  running: boolean;
  dryRun: boolean;
  tickCount: number;
  tradesExecuted: number;
  tradesSkipped: number;
  errors: number;
  lastTickAt: string | null;
  nextTickAt: string | null;
  intervalMs: number;
  uptime: number;
  startedAt: string | null;
  openPositions: number;
  totalExposure: number;
}

interface Position {
  id: string;
  question: string;
  signal: string;
  entryPrice: number;
  currentPrice: number;
  size: number;
  unrealizedPnl: number;
  category: string;
  openedAt: string;
  consensusConfidence: number;
}

interface Analytics {
  totalPnl: number;
  unrealizedPnl: number;
  realizedPnl: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  openPositions: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgHoldHours: number;
  agentStats: AgentStat[];
  tradesSkipped: number;
}

interface AgentStat {
  name: string;
  level: number;
  totalSignals: number;
  avgConfidence: number;
  accuracy: number;
  brierScore: number;
  contributionScore: number;
}

interface Decision {
  timestamp: string;
  market: string;
  shouldTrade: boolean;
  signal: string;
  confidence: number;
  edge: number;
  agreeCount: number;
}

interface NewsArticle {
  title: string;
  source: string;
  sentimentScore: number;
  publishedAt: string;
}

interface SSEEvent {
  type: string;
  timestamp: string;
  data: any;
}

function formatTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleTimeString();
}

function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${pnl.toFixed(2)}`;
}

function pnlColor(pnl: number): string {
  return pnl >= 0 ? 'text-terminal-green' : 'text-terminal-red';
}

function confidenceBar(value: number): string {
  const pct = Math.round(value * 100);
  if (pct >= 70) return 'bg-terminal-green';
  if (pct >= 50) return 'bg-terminal-yellow';
  return 'bg-terminal-red';
}

function signalBadge(signal: string): { bg: string; text: string } {
  switch (signal) {
    case 'BUY_YES': return { bg: 'bg-terminal-green/20 border-terminal-green/40', text: 'text-terminal-green' };
    case 'BUY_NO': return { bg: 'bg-terminal-red/20 border-terminal-red/40', text: 'text-terminal-red' };
    default: return { bg: 'bg-terminal-muted/20 border-terminal-muted/40', text: 'text-terminal-muted' };
  }
}

export default function Dashboard() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, posRes, analyticsRes, decisionsRes, newsRes] = await Promise.allSettled([
        fetch('/api/bot/status').then((r) => r.json()),
        fetch('/api/positions').then((r) => r.json()),
        fetch('/api/analytics').then((r) => r.json()),
        fetch('/api/decisions?limit=20').then((r) => r.json()),
        fetch('/api/news').then((r) => r.json()),
      ]);

      if (statusRes.status === 'fulfilled') setStatus(statusRes.value);
      if (posRes.status === 'fulfilled') setPositions(posRes.value.positions || []);
      if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value);
      if (decisionsRes.status === 'fulfilled') setDecisions(decisionsRes.value.decisions || []);
      if (newsRes.status === 'fulfilled') setNews((newsRes.value.articles || []).slice(0, 10));
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // SSE connection
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        setEvents((prev) => [event, ...prev].slice(0, 50));
        // Refresh data on trade events
        if (event.type === 'trade' || event.type === 'position_update') {
          fetchAll();
        }
      } catch {}
    };
    return () => es.close();
  }, [fetchAll]);

  const handleStart = async () => {
    await fetch('/api/bot/start', { method: 'POST' });
    fetchAll();
  };

  const handleStop = async () => {
    await fetch('/api/bot/stop', { method: 'POST' });
    fetchAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-terminal-muted flex items-center gap-2">
          <Zap className="w-5 h-5 animate-pulse" />
          Loading Polymarket Bot...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-terminal-border">
        <div className="flex items-center gap-3">
          <Bot className="w-8 h-8 text-terminal-purple" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">POLYMARKET AI BOT</h1>
            <p className="text-xs text-terminal-muted">5-Agent Autonomous Trading System</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status?.dryRun && (
            <span className="px-2 py-1 text-xs bg-terminal-yellow/20 text-terminal-yellow border border-terminal-yellow/40 rounded">
              DRY RUN
            </span>
          )}
          <div className="flex items-center gap-2">
            {status?.running ? (
              <span className="flex items-center gap-1.5 text-terminal-green text-sm">
                <span className="w-2 h-2 bg-terminal-green rounded-full animate-pulse-green" />
                LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-terminal-muted text-sm">
                <span className="w-2 h-2 bg-terminal-muted rounded-full" />
                STOPPED
              </span>
            )}
          </div>
          <button
            onClick={status?.running ? handleStop : handleStart}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border ${
              status?.running
                ? 'border-terminal-red/40 text-terminal-red hover:bg-terminal-red/10'
                : 'border-terminal-green/40 text-terminal-green hover:bg-terminal-green/10'
            }`}
          >
            {status?.running ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {status?.running ? 'Stop' : 'Start'}
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label: 'Ticks', value: status?.tickCount || 0, icon: Activity },
          { label: 'Trades', value: status?.tradesExecuted || 0, icon: Target },
          { label: 'Skipped', value: status?.tradesSkipped || 0, icon: Shield },
          { label: 'Win Rate', value: `${((analytics?.winRate || 0) * 100).toFixed(0)}%`, icon: CheckCircle },
          { label: 'Total PnL', value: formatPnl(analytics?.totalPnl || 0), icon: DollarSign, color: pnlColor(analytics?.totalPnl || 0) },
          { label: 'Open', value: positions.length, icon: BarChart3 },
          { label: 'Sharpe', value: (analytics?.sharpeRatio || 0).toFixed(2), icon: TrendingUp },
          { label: 'Last Tick', value: formatTime(status?.lastTickAt || null), icon: Clock },
        ].map((stat, i) => (
          <div key={i} className="bg-terminal-surface border border-terminal-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-terminal-muted text-xs mb-1">
              <stat.icon className="w-3 h-3" />
              {stat.label}
            </div>
            <div className={`text-sm font-semibold ${(stat as any).color || ''}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Positions Panel */}
        <div className="lg:col-span-2 bg-terminal-surface border border-terminal-border rounded-lg">
          <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-terminal-blue" />
            <h2 className="text-sm font-semibold">Open Positions</h2>
            <span className="text-xs text-terminal-muted">({positions.length})</span>
          </div>
          <div className="overflow-x-auto">
            {positions.length === 0 ? (
              <div className="p-8 text-center text-terminal-muted text-sm">No open positions</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-terminal-muted border-b border-terminal-border">
                    <th className="text-left px-4 py-2">Market</th>
                    <th className="text-center px-2 py-2">Signal</th>
                    <th className="text-right px-2 py-2">Entry</th>
                    <th className="text-right px-2 py-2">Current</th>
                    <th className="text-right px-2 py-2">Size</th>
                    <th className="text-right px-4 py-2">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const badge = signalBadge(pos.signal);
                    return (
                      <tr key={pos.id} className="border-b border-terminal-border/50 hover:bg-terminal-border/20">
                        <td className="px-4 py-2 max-w-[300px] truncate">{pos.question}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badge.bg} ${badge.text}`}>
                            {pos.signal}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">${pos.entryPrice.toFixed(3)}</td>
                        <td className="px-2 py-2 text-right">${pos.currentPrice.toFixed(3)}</td>
                        <td className="px-2 py-2 text-right">{pos.size.toFixed(1)}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${pnlColor(pos.unrealizedPnl)}`}>
                          {formatPnl(pos.unrealizedPnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Agent Signals Panel */}
        <div className="bg-terminal-surface border border-terminal-border rounded-lg">
          <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-2">
            <Zap className="w-4 h-4 text-terminal-purple" />
            <h2 className="text-sm font-semibold">Agent Signals</h2>
          </div>
          <div className="p-3 space-y-2">
            {(analytics?.agentStats || [
              { name: 'scout', level: 1, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
              { name: 'analyst', level: 2, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
              { name: 'strategist', level: 3, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
              { name: 'quant', level: 4, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
              { name: 'oracle', level: 5, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
            ]).map((agent) => (
              <div key={agent.name} className="p-2 rounded border border-terminal-border/50 bg-terminal-bg/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-terminal-purple">L{agent.level}</span>
                    <span className="text-xs font-semibold capitalize">{agent.name}</span>
                  </div>
                  <span className="text-[10px] text-terminal-muted">{agent.totalSignals} signals</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${confidenceBar(agent.avgConfidence)}`}
                      style={{ width: `${agent.avgConfidence * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-terminal-muted w-8">
                    {(agent.avgConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-terminal-muted">
                  <span>Acc: {(agent.accuracy * 100).toFixed(0)}%</span>
                  <span>Brier: {agent.brierScore.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decision Log */}
        <div className="lg:col-span-2 bg-terminal-surface border border-terminal-border rounded-lg">
          <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-terminal-yellow" />
            <h2 className="text-sm font-semibold">Decision Log</h2>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {decisions.length === 0 ? (
              <div className="p-8 text-center text-terminal-muted text-sm">No decisions yet — start the bot</div>
            ) : (
              <div className="divide-y divide-terminal-border/50">
                {decisions.map((d, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3 text-xs hover:bg-terminal-border/20">
                    {d.shouldTrade ? (
                      <CheckCircle className="w-3.5 h-3.5 text-terminal-green flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-terminal-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{d.market}</p>
                      <p className="text-terminal-muted text-[10px]">
                        {d.signal} | Conf: {(d.confidence * 100).toFixed(0)}% | Edge: {(d.edge * 100).toFixed(1)}c | Agree: {d.agreeCount}/5
                      </p>
                    </div>
                    <span className="text-terminal-muted text-[10px] flex-shrink-0">
                      {formatTime(d.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* News Feed */}
        <div className="bg-terminal-surface border border-terminal-border rounded-lg">
          <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-terminal-blue" />
            <h2 className="text-sm font-semibold">News Feed</h2>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-terminal-border/50">
            {news.length === 0 ? (
              <div className="p-8 text-center text-terminal-muted text-sm">No news cached</div>
            ) : (
              news.map((article, i) => (
                <div key={i} className="px-4 py-2">
                  <p className="text-xs leading-relaxed">{article.title}</p>
                  <div className="flex justify-between mt-1 text-[10px] text-terminal-muted">
                    <span>{article.source}</span>
                    <span className={
                      article.sentimentScore > 0.1
                        ? 'text-terminal-green'
                        : article.sentimentScore < -0.1
                          ? 'text-terminal-red'
                          : ''
                    }>
                      {article.sentimentScore >= 0 ? '+' : ''}{article.sentimentScore.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Events */}
        <div className="lg:col-span-3 bg-terminal-surface border border-terminal-border rounded-lg">
          <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-2">
            <Activity className="w-4 h-4 text-terminal-green" />
            <h2 className="text-sm font-semibold">Live Events (SSE)</h2>
            <span className="text-[10px] text-terminal-muted">Last {events.length} events</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto font-mono">
            {events.length === 0 ? (
              <div className="p-8 text-center text-terminal-muted text-sm">
                Waiting for events... {status?.running ? '' : '(start the bot)'}
              </div>
            ) : (
              events.map((evt, i) => (
                <div key={i} className="px-4 py-1 text-[11px] border-b border-terminal-border/30 hover:bg-terminal-border/20">
                  <span className="text-terminal-muted">{formatTime(evt.timestamp)}</span>
                  {' '}
                  <span className={
                    evt.type === 'trade' ? 'text-terminal-green font-bold' :
                    evt.type === 'error' ? 'text-terminal-red' :
                    evt.type === 'consensus' ? 'text-terminal-yellow' :
                    'text-terminal-blue'
                  }>
                    [{evt.type.toUpperCase()}]
                  </span>
                  {' '}
                  <span className="text-terminal-text">
                    {typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data).slice(0, 120)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-6 pt-4 border-t border-terminal-border text-center text-[10px] text-terminal-muted">
        Polymarket AI Trading Bot v1.0.0 | 5 Agents | 8-Rule Consensus | {status?.dryRun ? 'DRY RUN MODE' : 'LIVE MODE'}
      </footer>
    </div>
  );
}

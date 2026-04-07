'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Icon Components ───────────────────────────────────────
function Icon({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const icons = {
  dashboard: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  bot: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z',
  news: 'M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6V7.5z',
  wallet: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v-1.5A2.25 2.25 0 0018.75 2.25H5.25A2.25 2.25 0 003 4.5v15A2.25 2.25 0 005.25 21.75h13.5A2.25 2.25 0 0021 19.5v-1.5a2.25 2.25 0 00-2.25-2.25H15a3 3 0 010-6h3.75A2.25 2.25 0 0021 12z',
  play: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z',
  stop: 'M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z',
  check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  x: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  signal: 'M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  target: 'M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  trophy: 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.52.568m0 0a6.023 6.023 0 01-2.52-.568',
  lightning: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  arrowUp: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  arrowDown: 'M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181',
  shield: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  eye: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  settings: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

// ─── Types ─────────────────────────────────────────────────
interface BotStatus {
  running: boolean; dryRun: boolean; tickCount: number;
  tradesExecuted: number; tradesSkipped: number; errors: number;
  lastTickAt: string | null; nextTickAt: string | null;
  intervalMs: number; uptime: number; startedAt: string | null;
  openPositions: number; totalExposure: number;
}
interface Position {
  id: string; question: string; signal: string; entryPrice: number;
  currentPrice: number; size: number; unrealizedPnl: number;
  category: string; openedAt: string; consensusConfidence: number;
}
interface Analytics {
  totalPnl: number; unrealizedPnl: number; realizedPnl: number;
  winRate: number; totalTrades: number; winningTrades: number;
  losingTrades: number; openPositions: number; sharpeRatio: number;
  maxDrawdown: number; avgHoldHours: number;
  agentStats: AgentStat[]; tradesSkipped: number;
}
interface AgentStat {
  name: string; level: number; totalSignals: number; avgConfidence: number;
  accuracy: number; brierScore: number; contributionScore: number;
}
interface Decision {
  timestamp: string; market: string; shouldTrade: boolean; signal: string;
  confidence: number; edge: number; agreeCount: number;
}
interface NewsArticle {
  title: string; source: string; sentimentScore: number; publishedAt: string;
}
interface SSEEvent {
  type: string; timestamp: string; data: any;
}

// ─── Helpers ───────────────────────────────────────────────
function fmt(n: number, d = 2) { return n.toFixed(d); }
function fmtUsd(n: number) { return `${n >= 0 ? '+' : ''}$${fmt(Math.abs(n))}` }
function fmtPct(n: number) { return `${fmt(n * 100, 1)}%` }
function fmtTime(iso: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

const AGENT_COLORS: Record<string, string> = {
  scout: '#00bbff', analyst: '#00ff88', strategist: '#ffcc00',
  quant: '#ff8800', oracle: '#aa66ff',
};
const AGENT_ICONS: Record<string, string> = {
  scout: '🔍', analyst: '📊', strategist: '♟️', quant: '🧮', oracle: '🔮',
};
const AGENT_LABELS: Record<string, string> = {
  scout: 'Scout', analyst: 'Analyst', strategist: 'Strategist',
  quant: 'Quant', oracle: 'Oracle',
};

// ─── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState<'dashboard' | 'positions' | 'agents' | 'news' | 'log' | 'whales' | 'arb' | 'risk' | 'wallet'>('dashboard');
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const eventsRef = useRef<SSEEvent[]>([]);
  const [markets, setMarkets] = useState<any[]>([]);
  // God-Mode state
  const [whaleAlerts, setWhaleAlerts] = useState<any[]>([]);
  const [arbOpps, setArbOpps] = useState<any[]>([]);
  const [riskMetrics, setRiskMetrics] = useState<any>(null);
  const [riskAlerts, setRiskAlerts] = useState<any[]>([]);
  const [walletInfo, setWalletInfo] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [s, p, a, d, n, mk] = await Promise.allSettled([
        fetch('/api/bot/status').then(r => r.json()),
        fetch('/api/positions').then(r => r.json()),
        fetch('/api/analytics').then(r => r.json()),
        fetch('/api/decisions?limit=30').then(r => r.json()),
        fetch('/api/news').then(r => r.json()),
        fetch('/api/markets').then(r => r.json()),
      ]);
      if (s.status === 'fulfilled') setStatus(s.value);
      if (p.status === 'fulfilled') setPositions(p.value.positions || []);
      if (a.status === 'fulfilled') setAnalytics(a.value);
      if (d.status === 'fulfilled') setDecisions(d.value.decisions || []);
      if (n.status === 'fulfilled') setNews((n.value.articles || []).slice(0, 50));
      if (mk.status === 'fulfilled') setMarkets(mk.value.markets || []);
      // God-mode data
      const [wh, ar, ri, wa] = await Promise.allSettled([
        fetch('/api/godmode/whales?action=alerts&limit=20').then(r => r.json()),
        fetch('/api/godmode/arb?action=opportunities&limit=20').then(r => r.json()),
        fetch('/api/godmode/risk?action=metrics').then(r => r.json()),
        fetch('/api/godmode/wallet').then(r => r.json()),
      ]);
      if (wh.status === 'fulfilled') setWhaleAlerts(wh.value.alerts || []);
      if (ar.status === 'fulfilled') setArbOpps(ar.value.opportunities || []);
      if (ri.status === 'fulfilled') { setRiskMetrics(ri.value.metrics || null); setRiskAlerts(ri.value.alerts || []); }
      if (wa.status === 'fulfilled') setWalletInfo(wa.value);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 8000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as SSEEvent;
        eventsRef.current = [evt, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
        if (evt.type === 'trade' || evt.type === 'position_update') fetchAll();
      } catch {}
    };
    return () => es.close();
  }, [fetchAll]);

  const handleBotAction = async (action: 'start' | 'stop') => {
    setActionLoading(true);
    await fetch(`/api/bot/${action}`, { method: 'POST' });
    await fetchAll();
    setActionLoading(false);
  };

  // ─── Loading State ─────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow-md animate-float">
            <span className="text-2xl">🤖</span>
          </div>
          <p className="text-slate-400 font-medium">Initializing PolyBot AI...</p>
          <div className="mt-3 w-48 h-1 mx-auto bg-surface-300 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-500 to-neon-purple rounded-full shimmer" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: icons.dashboard },
    { id: 'positions', label: 'Positions', icon: icons.wallet },
    { id: 'agents', label: 'Agents', icon: icons.bot },
    { id: 'news', label: 'News', icon: icons.news },
    { id: 'log', label: 'Log', icon: icons.chart },
    { id: 'whales', label: 'Whales', icon: icons.eye },
    { id: 'arb', label: 'Arb Scanner', icon: icons.lightning },
    { id: 'risk', label: 'Risk', icon: icons.shield },
    { id: 'wallet', label: 'Wallet', icon: icons.wallet },
  ] as const;

  return (
    <div className="flex min-h-screen">
      {/* ─── Sidebar ─── */}
      <aside className="w-[72px] lg:w-[220px] fixed left-0 top-0 bottom-0 z-40 glass border-r border-surface-400/50 flex flex-col">
        {/* Logo */}
        <div className="p-4 lg:px-5 flex items-center gap-3 border-b border-surface-400/50">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow-sm flex-shrink-0">
            <span className="text-base">🤖</span>
          </div>
          <div className="hidden lg:block">
            <h1 className="text-sm font-bold tracking-tight">PolyBot AI</h1>
            <p className="text-[10px] text-slate-500">v1.0.0</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 lg:px-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                tab === item.id ? 'active' : 'text-slate-500'
              }`}
            >
              <Icon d={item.icon} className="w-5 h-5 flex-shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Bot Control */}
        <div className="p-3 lg:p-4 border-t border-surface-400/50 space-y-3">
          {status?.dryRun && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neon-yellow/5 border border-neon-yellow/20">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-yellow" />
              <span className="text-[10px] font-semibold text-neon-yellow tracking-wide">DRY RUN</span>
            </div>
          )}
          <button
            onClick={() => handleBotAction(status?.running ? 'stop' : 'start')}
            disabled={actionLoading}
            className={`btn-press w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              status?.running
                ? 'bg-neon-red/10 text-neon-red border border-neon-red/20 hover:bg-neon-red/20'
                : 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-glow-sm hover:shadow-glow-md'
            } disabled:opacity-50`}
          >
            <Icon d={status?.running ? icons.stop : icons.play} className="w-4 h-4" />
            <span className="hidden lg:inline">{actionLoading ? '...' : status?.running ? 'Stop Bot' : 'Start Bot'}</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 ml-[72px] lg:ml-[220px] p-4 lg:p-6 max-w-[1500px]">
        {/* Top Bar */}
        <header className="flex items-center justify-between mb-6 animate-fade-in">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold tracking-tight">
              {navItems.find(n => n.id === tab)?.label}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {status?.running ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-neon-green pulse-live" />
                  <span className="text-neon-green font-medium">Live</span>
                  <span className="text-slate-600">·</span>
                  <span>Last tick {fmtTime(status.lastTickAt)}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  <span>Bot is stopped</span>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-4 text-xs text-slate-500 bg-surface-100 rounded-xl px-4 py-2 border border-surface-400/50">
              <span>Ticks: <strong className="text-slate-300">{status?.tickCount || 0}</strong></span>
              <span className="w-px h-3 bg-surface-400" />
              <span>Trades: <strong className="text-slate-300">{status?.tradesExecuted || 0}</strong></span>
              <span className="w-px h-3 bg-surface-400" />
              <span>Errors: <strong className="text-slate-300">{status?.errors || 0}</strong></span>
            </div>
          </div>
        </header>

        {/* ─── Dashboard Tab ─── */}
        {tab === 'dashboard' && (
          <div className="space-y-5 animate-fade-in">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
              {[
                { label: 'Total PnL', value: fmtUsd(analytics?.totalPnl || 0), color: (analytics?.totalPnl || 0) >= 0 ? 'text-neon-green' : 'text-neon-red', glow: (analytics?.totalPnl || 0) >= 0 ? 'shadow-glow-green' : 'shadow-glow-red', icon: icons.arrowUp, sub: `Realized: ${fmtUsd(analytics?.realizedPnl || 0)}` },
                { label: 'Win Rate', value: fmtPct(analytics?.winRate || 0), color: (analytics?.winRate || 0) > 0.6 ? 'text-neon-green' : 'text-neon-yellow', icon: icons.target, sub: `${analytics?.winningTrades || 0}W / ${analytics?.losingTrades || 0}L` },
                { label: 'Sharpe Ratio', value: fmt(analytics?.sharpeRatio || 0), color: 'text-neon-blue', icon: icons.chart, sub: `Drawdown: $${fmt(analytics?.maxDrawdown || 0)}` },
                { label: 'Open Positions', value: String(positions.length), color: 'text-brand-400', icon: icons.wallet, sub: `Exposure: $${fmt(status?.totalExposure || 0)}` },
              ].map((s, i) => (
                <div key={i} className={`stat-card glass rounded-2xl p-4 lg:p-5 ${i === 0 ? s.glow : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</span>
                    <div className="w-8 h-8 rounded-lg bg-surface-300/50 flex items-center justify-center">
                      <Icon d={s.icon} className={`w-4 h-4 ${s.color}`} />
                    </div>
                  </div>
                  <p className={`text-2xl lg:text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Live Markets from Polymarket */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-neon-green pulse-live" />
                  <h3 className="text-sm font-semibold">Live Polymarket Bets</h3>
                </div>
                <span className="text-xs text-slate-500">{markets.length} markets</span>
              </div>
              {markets.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-slate-500">Loading markets from Polymarket...</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-400/20 max-h-[400px] overflow-auto">
                  {markets.slice(0, 25).map((m: any, i: number) => {
                    const yesPrice = m.outcomePrices?.[0] || 0.5;
                    const noPrice = m.outcomePrices?.[1] || 0.5;
                    return (
                      <div key={i} className="table-row px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-center gap-1 w-16 flex-shrink-0">
                            <span className={`text-sm font-bold ${yesPrice >= 0.5 ? 'text-neon-green' : 'text-neon-red'}`}>
                              {fmt(yesPrice * 100, 0)}%
                            </span>
                            <span className="text-[9px] text-slate-600">YES</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{m.question}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-slate-500">Vol: ${m.volume >= 1000000 ? fmt(m.volume / 1000000, 1) + 'M' : m.volume >= 1000 ? fmt(m.volume / 1000, 0) + 'K' : fmt(m.volume, 0)}</span>
                              <span className="text-[10px] text-slate-500">Liq: ${m.liquidity >= 1000 ? fmt(m.liquidity / 1000, 0) + 'K' : fmt(m.liquidity, 0)}</span>
                              {m.passesFilter && <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-green/10 text-neon-green font-bold">TRADEABLE</span>}
                              {m.category && m.category !== 'general' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-300/50 text-slate-500">{m.category}</span>}
                            </div>
                          </div>
                          <div className="w-20 flex-shrink-0">
                            <div className="w-full h-2 rounded-full bg-surface-300/50 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-neon-green to-neon-blue" style={{ width: `${yesPrice * 100}%` }} />
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-[9px] text-neon-green">{fmt(yesPrice * 100, 0)}%</span>
                              <span className="text-[9px] text-neon-red">{fmt(noPrice * 100, 0)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Two Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Positions (3 col) */}
              <div className="lg:col-span-3 glass rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-400/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand-400" />
                    <h3 className="text-sm font-semibold">Open Positions</h3>
                  </div>
                  <span className="text-xs text-slate-500">{positions.length} active</span>
                </div>
                {positions.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-300/50 flex items-center justify-center">
                      <Icon d={icons.target} className="w-6 h-6 text-slate-600" />
                    </div>
                    <p className="text-sm text-slate-500">No open positions</p>
                    <p className="text-xs text-slate-600 mt-1">The bot will open positions when consensus is reached</p>
                  </div>
                ) : (
                  <div className="divide-y divide-surface-400/30">
                    {positions.map((pos, i) => (
                      <div key={pos.id} className="table-row px-5 py-3 flex items-center gap-4" style={{ animationDelay: `${i * 50}ms` }}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${
                          pos.signal === 'BUY_YES' ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-red/10 text-neon-red'
                        }`}>
                          {pos.signal === 'BUY_YES' ? 'YES' : 'NO'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{pos.question}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                            <span>${fmt(pos.entryPrice, 3)} → ${fmt(pos.currentPrice, 3)}</span>
                            <span className="px-1.5 py-0.5 rounded bg-surface-300/50 text-slate-400">{pos.category}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${pos.unrealizedPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                            {fmtUsd(pos.unrealizedPnl)}
                          </p>
                          <p className="text-[10px] text-slate-500">{timeAgo(pos.openedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agents (2 col) */}
              <div className="lg:col-span-2 glass rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-400/50 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-neon-purple" />
                  <h3 className="text-sm font-semibold">Agent Performance</h3>
                </div>
                <div className="p-3 space-y-2">
                  {(analytics?.agentStats || [
                    { name: 'scout', level: 1, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
                    { name: 'analyst', level: 2, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
                    { name: 'strategist', level: 3, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
                    { name: 'quant', level: 4, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
                    { name: 'oracle', level: 5, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0 },
                  ]).map((agent) => {
                    const color = AGENT_COLORS[agent.name] || '#6366f1';
                    return (
                      <div key={agent.name} className="p-3 rounded-xl bg-surface-100/50 border border-surface-400/30 hover:border-surface-400/60 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">{AGENT_ICONS[agent.name]}</span>
                            <div>
                              <span className="text-xs font-semibold">{AGENT_LABELS[agent.name]}</span>
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
                                L{agent.level}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500">{agent.totalSignals} signals</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-surface-300/50 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.max(2, agent.avgConfidence * 100)}%`,
                                background: `linear-gradient(90deg, ${color}88, ${color})`,
                                boxShadow: `0 0 8px ${color}40`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 w-10 text-right">
                            {fmtPct(agent.avgConfidence)}
                          </span>
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                          <span>Accuracy: <strong className="text-slate-400">{fmtPct(agent.accuracy)}</strong></span>
                          <span>Brier: <strong className="text-slate-400">{fmt(agent.brierScore, 3)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recent Decisions */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-neon-yellow" />
                  <h3 className="text-sm font-semibold">Recent Decisions</h3>
                </div>
                <button onClick={() => setTab('log')} className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                  View All →
                </button>
              </div>
              <div className="divide-y divide-surface-400/20 max-h-[280px] overflow-y-auto">
                {decisions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No decisions yet — start the bot to begin analysis</div>
                ) : decisions.slice(0, 8).map((d, i) => (
                  <div key={i} className="table-row px-5 py-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      d.shouldTrade ? 'bg-neon-green/10' : 'bg-surface-300/50'
                    }`}>
                      <Icon d={d.shouldTrade ? icons.check : icons.x} className={`w-4 h-4 ${d.shouldTrade ? 'text-neon-green' : 'text-slate-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{d.market}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                        <span className={`font-bold ${d.signal === 'BUY_YES' ? 'text-neon-green' : d.signal === 'BUY_NO' ? 'text-neon-red' : 'text-slate-500'}`}>
                          {d.signal}
                        </span>
                        <span>·</span>
                        <span>Conf {fmtPct(d.confidence)}</span>
                        <span>·</span>
                        <span>Edge {fmt(d.edge * 100, 1)}c</span>
                        <span>·</span>
                        <span>{d.agreeCount}/5 agree</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">{fmtTime(d.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Feed */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-neon-green pulse-live" />
                <h3 className="text-sm font-semibold">Live Event Stream</h3>
                <span className="text-[10px] text-slate-500 ml-2">{events.length} events</span>
              </div>
              <div className="max-h-[200px] overflow-y-auto font-mono text-[11px]">
                {events.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    {status?.running ? 'Waiting for events...' : 'Start the bot to see live events'}
                  </div>
                ) : events.slice(0, 30).map((evt, i) => {
                  const typeColors: Record<string, string> = {
                    trade: 'text-neon-green', error: 'text-neon-red', consensus: 'text-neon-yellow',
                    signal: 'text-neon-blue', tick: 'text-brand-400', position_update: 'text-neon-cyan',
                    bot_status: 'text-neon-purple', connected: 'text-slate-500',
                  };
                  return (
                    <div key={i} className="px-5 py-1.5 flex items-center gap-3 hover:bg-surface-300/20 border-b border-surface-400/10">
                      <span className="text-slate-600 w-16 flex-shrink-0">{fmtTime(evt.timestamp)}</span>
                      <span className={`font-bold w-20 flex-shrink-0 uppercase ${typeColors[evt.type] || 'text-slate-500'}`}>{evt.type}</span>
                      <span className="text-slate-400 truncate">{typeof evt.data === 'string' ? evt.data : (JSON.stringify(evt.data) || '').slice(0, 150)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── Positions Tab ─── */}
        {tab === 'positions' && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Unrealized PnL', value: fmtUsd(analytics?.unrealizedPnl || 0), color: (analytics?.unrealizedPnl || 0) >= 0 ? 'text-neon-green' : 'text-neon-red' },
                { label: 'Total Exposure', value: `$${fmt(status?.totalExposure || 0)}`, color: 'text-brand-400' },
                { label: 'Avg Hold Time', value: `${fmt(analytics?.avgHoldHours || 0, 1)}h`, color: 'text-neon-blue' },
              ].map((s, i) => (
                <div key={i} className="stat-card glass rounded-2xl p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">{s.label}</p>
                  <p className={`text-2xl font-bold mt-2 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50">
                <h3 className="text-sm font-semibold">All Open Positions</h3>
              </div>
              {positions.length === 0 ? (
                <div className="p-16 text-center">
                  <span className="text-4xl">📭</span>
                  <p className="text-sm text-slate-500 mt-3">No open positions yet</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-surface-400/30">
                      {['Market', 'Signal', 'Entry', 'Current', 'Size', 'PnL', 'Confidence', 'Age'].map(h => (
                        <th key={h} className="text-left px-5 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-400/20">
                    {positions.map((pos) => (
                      <tr key={pos.id} className="table-row">
                        <td className="px-5 py-3 max-w-[300px] truncate font-medium">{pos.question}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                            pos.signal === 'BUY_YES' ? 'bg-neon-green/10 text-neon-green border border-neon-green/20' : 'bg-neon-red/10 text-neon-red border border-neon-red/20'
                          }`}>{pos.signal}</span>
                        </td>
                        <td className="px-5 py-3 font-mono">${fmt(pos.entryPrice, 3)}</td>
                        <td className="px-5 py-3 font-mono">${fmt(pos.currentPrice, 3)}</td>
                        <td className="px-5 py-3 font-mono">{fmt(pos.size, 1)}</td>
                        <td className={`px-5 py-3 font-bold ${pos.unrealizedPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>{fmtUsd(pos.unrealizedPnl)}</td>
                        <td className="px-5 py-3">{fmtPct(pos.consensusConfidence)}</td>
                        <td className="px-5 py-3 text-slate-500">{timeAgo(pos.openedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ─── Agents Tab ─── */}
        {tab === 'agents' && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(analytics?.agentStats || [
                { name: 'scout', level: 1, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0, buyYesCount: 0, buyNoCount: 0, holdCount: 0 },
                { name: 'analyst', level: 2, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0, buyYesCount: 0, buyNoCount: 0, holdCount: 0 },
                { name: 'strategist', level: 3, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0, buyYesCount: 0, buyNoCount: 0, holdCount: 0 },
                { name: 'quant', level: 4, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0, buyYesCount: 0, buyNoCount: 0, holdCount: 0 },
                { name: 'oracle', level: 5, avgConfidence: 0, accuracy: 0, brierScore: 0.25, totalSignals: 0, contributionScore: 0, buyYesCount: 0, buyNoCount: 0, holdCount: 0 },
              ] as any[]).map((agent) => {
                const color = AGENT_COLORS[agent.name] || '#6366f1';
                const descriptions: Record<string, string> = {
                  scout: 'Keyword matching between market titles and news headlines. Fast, low-confidence baseline.',
                  analyst: 'Combines news sentiment with price momentum. Identifies divergence opportunities.',
                  strategist: 'Contrarian orderbook analysis with Kelly criterion position sizing.',
                  quant: 'Multi-factor Bayesian model. Tracks Brier score and adjusts per category.',
                  oracle: 'Claude AI reasoning engine. Ensemble with all other agents. Final veto power.',
                };
                return (
                  <div key={agent.name} className="glass rounded-2xl p-5 hover:shadow-glow-sm transition-shadow glow-border">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${color}15` }}>
                        {AGENT_ICONS[agent.name]}
                      </div>
                      <div>
                        <h3 className="font-bold">{AGENT_LABELS[agent.name]}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
                          Level {agent.level}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">{descriptions[agent.name]}</p>
                    <div className="space-y-3">
                      {[
                        { label: 'Confidence', value: agent.avgConfidence },
                        { label: 'Accuracy', value: agent.accuracy },
                      ].map((bar) => (
                        <div key={bar.label}>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-slate-500">{bar.label}</span>
                            <span className="font-mono text-slate-400">{fmtPct(bar.value)}</span>
                          </div>
                          <div className="h-2 bg-surface-300/50 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(2, bar.value * 100)}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 8px ${color}40` }} />
                          </div>
                        </div>
                      ))}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-surface-400/30">
                        <div className="text-center">
                          <p className="text-lg font-bold text-slate-300">{agent.totalSignals}</p>
                          <p className="text-[9px] text-slate-500">Signals</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold" style={{ color }}>{fmt(agent.brierScore, 3)}</p>
                          <p className="text-[9px] text-slate-500">Brier</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-slate-300">{fmt(agent.contributionScore, 1)}</p>
                          <p className="text-[9px] text-slate-500">Score</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── News Tab ─── */}
        {tab === 'news' && (
          <div className="space-y-4 animate-fade-in">
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center gap-2">
                <h3 className="text-sm font-semibold">News Feed</h3>
                <span className="text-xs text-slate-500">({news.length} articles)</span>
              </div>
              {news.length === 0 ? (
                <div className="p-16 text-center">
                  <span className="text-4xl">📰</span>
                  <p className="text-sm text-slate-500 mt-3">No news articles cached yet</p>
                  <p className="text-xs text-slate-600 mt-1">Articles will appear once the bot starts analyzing markets</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-400/20">
                  {news.map((article, i) => {
                    const sent = article.sentimentScore;
                    const sentColor = sent > 0.1 ? 'text-neon-green' : sent < -0.1 ? 'text-neon-red' : 'text-slate-500';
                    const sentBg = sent > 0.1 ? 'bg-neon-green/10 border-neon-green/20' : sent < -0.1 ? 'bg-neon-red/10 border-neon-red/20' : 'bg-surface-300/50 border-surface-400/30';
                    return (
                      <div key={i} className="table-row px-5 py-4 flex items-start gap-4">
                        <div className={`mt-0.5 px-2 py-1 rounded-lg border text-[10px] font-bold flex-shrink-0 ${sentBg} ${sentColor}`}>
                          {sent >= 0 ? '+' : ''}{fmt(sent)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-relaxed">{article.title}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                            <span className="font-medium">{article.source}</span>
                            {article.publishedAt && <>
                              <span>·</span>
                              <span>{timeAgo(article.publishedAt)}</span>
                            </>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Log Tab ─── */}
        {tab === 'log' && (
          <div className="space-y-4 animate-fade-in">
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center gap-2">
                <h3 className="text-sm font-semibold">Decision Log</h3>
                <span className="text-xs text-slate-500">{decisions.length} entries</span>
              </div>
              {decisions.length === 0 ? (
                <div className="p-16 text-center">
                  <span className="text-4xl">📋</span>
                  <p className="text-sm text-slate-500 mt-3">No decisions recorded yet</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-400/20">
                  {decisions.map((d, i) => (
                    <div key={i} className="table-row px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          d.shouldTrade ? 'bg-neon-green/10' : 'bg-surface-300/50'
                        }`}>
                          <Icon d={d.shouldTrade ? icons.check : icons.x} className={`w-4 h-4 ${d.shouldTrade ? 'text-neon-green' : 'text-slate-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.market}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            <span className={`text-[11px] font-bold ${d.signal === 'BUY_YES' ? 'text-neon-green' : d.signal === 'BUY_NO' ? 'text-neon-red' : 'text-slate-500'}`}>
                              {d.signal}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">Conf: {fmtPct(d.confidence)}</span>
                            <span className="text-[10px] text-slate-500 font-mono">Edge: {fmt(d.edge * 100, 1)}c</span>
                            <span className="text-[10px] text-slate-500 font-mono">Agree: {d.agreeCount}/5</span>
                            {d.shouldTrade && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-green/10 text-neon-green font-bold">TRADED</span>}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-600 flex-shrink-0 font-mono">{fmtTime(d.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Whales Tab ─── */}
        {tab === 'whales' && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={async () => { await fetch('/api/godmode/whales?action=scan'); fetchAll(); }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-neon-blue/10 text-neon-blue border border-neon-blue/20 hover:bg-neon-blue/20 transition-all"
              >Scan Now</button>
              <span className="text-xs text-slate-500">{whaleAlerts.length} alerts tracked</span>
            </div>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center gap-2">
                <Icon d={icons.eye} className="w-5 h-5 text-neon-blue" />
                <h3 className="text-sm font-semibold">Whale Alerts</h3>
              </div>
              {whaleAlerts.length === 0 ? (
                <div className="p-16 text-center">
                  <span className="text-4xl">🐋</span>
                  <p className="text-sm text-slate-500 mt-3">No whale activity detected yet. Click Scan to detect.</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-400/20 max-h-[600px] overflow-auto">
                  {whaleAlerts.map((w: any, i: number) => (
                    <div key={i} className="table-row px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          w.side === 'BUY' ? 'bg-neon-green/10' : 'bg-neon-red/10'
                        }`}>
                          <span className="text-lg">{w.side === 'BUY' ? '🟢' : '🔴'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-slate-400 truncate">{w.address?.slice(0, 6)}...{w.address?.slice(-4)}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-sm font-bold ${w.side === 'BUY' ? 'text-neon-green' : 'text-neon-red'}`}>
                              {w.side} ${fmt(w.size)}
                            </span>
                            <span className="text-[10px] text-slate-500">@ ${fmt(w.price, 4)}</span>
                            <span className="text-[10px] text-slate-500">Impact: {fmt((w.impact || 0) * 100, 1)}%</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">{w.timestamp ? timeAgo(w.timestamp) : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Arb Scanner Tab ─── */}
        {tab === 'arb' && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={async () => { await fetch('/api/godmode/arb?action=scan'); fetchAll(); }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-neon-purple/10 text-neon-purple border border-neon-purple/20 hover:bg-neon-purple/20 transition-all"
              >Run Full Scan</button>
              <span className="text-xs text-slate-500">{arbOpps.length} opportunities</span>
            </div>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center gap-2">
                <Icon d={icons.lightning} className="w-5 h-5 text-neon-purple" />
                <h3 className="text-sm font-semibold">Arbitrage Opportunities</h3>
              </div>
              {arbOpps.length === 0 ? (
                <div className="p-16 text-center">
                  <span className="text-4xl">⚡</span>
                  <p className="text-sm text-slate-500 mt-3">No arb opportunities found. Click Run Full Scan.</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-400/20 max-h-[600px] overflow-auto">
                  {arbOpps.map((a: any, i: number) => (
                    <div key={i} className="table-row px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neon-purple/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-neon-purple uppercase">{a.type?.replace('_', '\n') || 'ARB'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{a.marketA || 'Unknown Market'}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px] text-neon-green font-bold">Edge: {fmt((a.edge || 0) * 100, 2)}%</span>
                            <span className="text-[10px] text-slate-500">Expected: ${fmt(a.expectedProfit || 0)}</span>
                            <span className="text-[10px] text-slate-500">Conf: {fmt((a.confidence || 0) * 100)}%</span>
                            <span className="text-[10px] text-slate-500">Fair: ${fmt(a.fairPrice || 0, 4)} vs ${fmt(a.currentPrice || 0, 4)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Risk Tab ─── */}
        {tab === 'risk' && (
          <div className="space-y-5 animate-fade-in">
            {/* Risk Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Exposure', value: fmtPct(riskMetrics?.totalExposure || 0), color: (riskMetrics?.totalExposure || 0) > 0.2 ? 'text-neon-yellow' : 'text-neon-green' },
                { label: 'VaR (95%)', value: `$${fmt(riskMetrics?.var95 || 0)}`, color: 'text-neon-blue' },
                { label: 'Max Drawdown', value: `$${fmt(riskMetrics?.maxDrawdown || 0)}`, color: 'text-neon-red' },
                { label: 'Risk Score', value: fmt(riskMetrics?.overallRiskScore || 0, 0), color: (riskMetrics?.overallRiskScore || 0) > 70 ? 'text-neon-red' : (riskMetrics?.overallRiskScore || 0) > 40 ? 'text-neon-yellow' : 'text-neon-green' },
              ].map((m, i) => (
                <div key={i} className="stat-card glass rounded-2xl p-4">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{m.label}</span>
                  <p className={`text-2xl font-bold mt-2 ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="stat-card glass rounded-2xl p-4">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Sharpe Ratio</span>
                <p className="text-xl font-bold mt-2 text-neon-blue">{fmt(riskMetrics?.sharpeRatio || 0)}</p>
              </div>
              <div className="stat-card glass rounded-2xl p-4">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Concentration</span>
                <p className="text-xl font-bold mt-2 text-neon-yellow">{fmt((riskMetrics?.concentrationRisk || 0) * 100)}%</p>
              </div>
              <div className="stat-card glass rounded-2xl p-4">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Liquidity Risk</span>
                <p className="text-xl font-bold mt-2 text-neon-purple">{fmt((riskMetrics?.liquidityRisk || 0) * 100)}%</p>
              </div>
            </div>
            {/* Risk Alerts */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-400/50 flex items-center gap-2">
                <Icon d={icons.shield} className="w-5 h-5 text-neon-red" />
                <h3 className="text-sm font-semibold">Risk Alerts</h3>
                <span className="text-xs text-slate-500">{riskAlerts.length} active</span>
              </div>
              {riskAlerts.length === 0 ? (
                <div className="p-10 text-center">
                  <span className="text-3xl">✅</span>
                  <p className="text-sm text-slate-500 mt-2">All risk metrics within limits</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-400/20">
                  {riskAlerts.map((a: any, i: number) => (
                    <div key={i} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        a.level === 'CRITICAL' ? 'bg-neon-red pulse-live' : a.level === 'WARNING' ? 'bg-neon-yellow' : 'bg-neon-blue'
                      }`} />
                      <div className="flex-1">
                        <span className={`text-xs font-bold ${
                          a.level === 'CRITICAL' ? 'text-neon-red' : a.level === 'WARNING' ? 'text-neon-yellow' : 'text-neon-blue'
                        }`}>{a.level}</span>
                        <p className="text-sm text-slate-300 mt-0.5">{a.message}</p>
                      </div>
                      <span className="text-[10px] text-slate-600 font-mono">{a.timestamp ? fmtTime(a.timestamp) : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Wallet Tab ─── */}
        {tab === 'wallet' && (
          <div className="space-y-5 animate-fade-in">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-neon-purple flex items-center justify-center shadow-glow-sm">
                  <Icon d={icons.wallet} className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Wallet Connection</h3>
                  <p className="text-xs text-slate-500">Polygon Mainnet (Chain 137)</p>
                </div>
                <div className="ml-auto">
                  {walletInfo?.connected ? (
                    <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neon-green/10 border border-neon-green/20">
                      <span className="w-2 h-2 rounded-full bg-neon-green pulse-live" />
                      <span className="text-xs font-bold text-neon-green">Connected</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neon-red/10 border border-neon-red/20">
                      <span className="w-2 h-2 rounded-full bg-neon-red" />
                      <span className="text-xs font-bold text-neon-red">Disconnected</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass rounded-xl p-4">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Address</span>
                  <p className="text-sm font-mono text-slate-300 mt-2 break-all">{walletInfo?.wallet || 'Not connected'}</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Mode</span>
                  <p className={`text-sm font-bold mt-2 ${walletInfo?.mode === 'LIVE' ? 'text-neon-green' : 'text-neon-yellow'}`}>
                    {walletInfo?.mode || 'DRY_RUN'}
                  </p>
                </div>
                <div className="glass rounded-xl p-4">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">USDC Balance</span>
                  <p className="text-xl font-bold text-neon-green mt-2">${walletInfo?.balance || '0.00'}</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Allowance</span>
                  <p className="text-xl font-bold text-neon-blue mt-2">${walletInfo?.allowance || '0.00'}</p>
                </div>
              </div>
            </div>
            <div className="glass rounded-2xl p-5">
              <h3 className="text-sm font-semibold mb-3">Connection Status</h3>
              <div className="space-y-2">
                {[
                  { label: 'CLOB API', ok: walletInfo?.ok },
                  { label: 'Wallet Signer', ok: walletInfo?.connected },
                  { label: 'API Credentials', ok: walletInfo?.connected },
                  { label: 'Network (Polygon)', ok: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-100">
                    <span className={`w-2 h-2 rounded-full ${item.ok ? 'bg-neon-green' : 'bg-neon-red'}`} />
                    <span className="text-sm text-slate-400">{item.label}</span>
                    <span className={`ml-auto text-xs font-bold ${item.ok ? 'text-neon-green' : 'text-neon-red'}`}>
                      {item.ok ? 'OK' : 'FAIL'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

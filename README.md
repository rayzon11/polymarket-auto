# Polymarket AI Trading Bot

Autonomous 5-agent prediction market trading system with 90%+ win-rate targeting strategy. Built with Next.js 14, TypeScript, and the Polymarket CLOB SDK.

## Architecture

```
5 AI AGENTS → 8-RULE CONSENSUS ENGINE → TRADE EXECUTION
     ↑              ↑                        ↓
  NewsAPI     Market Filter           Position Tracker
  Claude AI   Orderbook Data          JSON Persistence
```

### The 5 Agents

| # | Agent | Level | Strategy |
|---|-------|-------|----------|
| 1 | Scout | L1 | Keyword matching: market titles vs news headlines |
| 2 | Analyst | L2 | News sentiment + price momentum combination |
| 3 | Strategist | L3 | Contrarian orderbook analysis + Kelly criterion sizing |
| 4 | Quant | L4 | Multi-factor Bayesian model + Brier score tracking |
| 5 | Oracle | L5 | Claude AI reasoning + ensemble with quant signals |

### Why 90%+ Win Rate

1. **Extreme market filter** — volume, spread, category, timing
2. **4-of-5 agent consensus** — not just majority, supermajority
3. **Oracle (Claude AI) as veto power** — must not be HOLD or LOW confidence
4. **8-cent minimum edge** — only trade when mispricing is significant
5. **Kelly position sizing** — never overbetting, 5% cap per position
6. **25% max portfolio exposure** — survive bad streaks
7. **Category win-rate tracking** — double down on working categories
8. **Bayesian confidence updating** — agents learn from each trade
9. **No entries in final 6 hours** — avoid resolution uncertainty
10. **Brier score monitoring** — reduce sizing when predictions degrade

## Quick Start

```bash
# Clone and install
cd polymarket-bot
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run in development (DRY_RUN=true by default)
npm run dev

# Open dashboard
open http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | Yes | Ethereum private key for Polymarket |
| `POLYMARKET_API_KEY` | No | CLOB API key (auto-derived if not set) |
| `POLYMARKET_API_SECRET` | No | CLOB API secret |
| `POLYMARKET_API_PASSPHRASE` | No | CLOB API passphrase |
| `NEWS_API_KEY` | Yes | NewsAPI.org API key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Oracle agent |
| `DRY_RUN` | No | `true` (default) or `false` — prevents real orders |
| `BOT_INTERVAL_MS` | No | Trading loop interval (default: 90000ms) |
| `MAX_PORTFOLIO_EXPOSURE` | No | Max % of bankroll at risk (default: 0.25) |
| `MAX_SINGLE_POSITION` | No | Max % per position (default: 0.05) |
| `BANKROLL` | No | Starting bankroll in USD (default: 10000) |
| `PERSISTENCE_MODE` | No | `file` (default) or `memory` (for Vercel) |
| `CRON_SECRET` | No | Secret for Vercel cron endpoint |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | System health + bot status |
| GET | `/api/markets` | Filtered candidate markets |
| GET | `/api/markets/all` | All active markets |
| GET | `/api/markets/:id` | Market detail + orderbook |
| POST | `/api/markets/:id/analyze` | Run all 5 agents on a market |
| POST | `/api/trade` | Manual trade |
| GET | `/api/positions` | Open positions |
| GET/DELETE | `/api/positions/:id` | Position detail / close |
| GET | `/api/history` | Trade history |
| GET | `/api/history/export` | CSV download |
| GET | `/api/analytics` | Full analytics |
| GET | `/api/analytics/leaderboard` | Agent ranking |
| GET | `/api/analytics/calibration` | Brier scores |
| GET | `/api/news` | Cached news articles |
| GET | `/api/news/search?q=X` | Search news |
| GET | `/api/agents` | All 5 agents with stats |
| GET | `/api/agents/:name` | Agent detail |
| GET | `/api/decisions` | Decision log |
| POST | `/api/bot/start` | Start autonomous loop |
| POST | `/api/bot/stop` | Stop loop |
| GET/POST | `/api/bot/config` | Read/update config |
| GET | `/api/bot/status` | Loop status |
| POST | `/api/bot/tick` | Single tick (Vercel cron) |
| GET | `/api/stream` | SSE real-time events |

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Set PERSISTENCE_MODE=memory
# Set CRON_SECRET for tick endpoint security
```

The bot runs via Vercel Cron (every 2 minutes) hitting `/api/bot/tick`.

## Localhost Development

```bash
npm run dev        # Start Next.js dev server on :3000
```

- Dashboard: http://localhost:3000
- Start bot: `POST http://localhost:3000/api/bot/start`
- View status: `GET http://localhost:3000/api/bot/status`
- SSE stream: `GET http://localhost:3000/api/stream`

## Safety

- **DRY_RUN=true by default** — all orders are simulated
- **5% Kelly cap** per position
- **25% max portfolio exposure**
- **8-rule consensus gate** — only trades when everything aligns
- Atomic file writes prevent data corruption
- Agent failures produce HOLD (safe default), never crash the loop

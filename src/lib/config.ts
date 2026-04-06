import { BotConfig } from '@/lib/agents/types';

export function getConfig(): BotConfig {
  return {
    polymarket: {
      host: process.env.POLYMARKET_HOST || 'https://clob.polymarket.com',
      chainId: 137,
      privateKey: process.env.PRIVATE_KEY || '',
      apiKey: process.env.POLYMARKET_API_KEY || '',
      apiSecret: process.env.POLYMARKET_API_SECRET || '',
      apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE || '',
      funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS || '',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '1024', 10),
    },
    newsApi: {
      apiKey: process.env.NEWS_API_KEY || '',
      baseUrl: process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2',
    },
    bot: {
      intervalMs: parseInt(process.env.BOT_INTERVAL_MS || '90000', 10),
      dryRun: process.env.DRY_RUN !== 'false',
      maxExposure: parseFloat(process.env.MAX_PORTFOLIO_EXPOSURE || '0.25'),
      maxSinglePosition: parseFloat(process.env.MAX_SINGLE_POSITION || '0.05'),
      minConsensusAgents: parseInt(process.env.MIN_CONSENSUS_AGENTS || '4', 10),
      minEdge: parseFloat(process.env.MIN_EDGE || '0.07'),
      minMarketVolume: parseFloat(process.env.MIN_MARKET_VOLUME || '50000'),
      bankroll: parseFloat(process.env.BANKROLL || '10000'),
      kellyCap: parseFloat(process.env.KELLY_CAP || '0.05'),
    },
    dataDir: process.env.DATA_DIR || './data',
    persistenceMode: (process.env.PERSISTENCE_MODE as 'file' | 'memory') || 'file',
    cronSecret: process.env.CRON_SECRET || '',
  };
}

export function getConfigSafe(): Omit<BotConfig, 'polymarket'> & {
  polymarket: { host: string; chainId: number; hasKey: boolean };
} {
  const config = getConfig();
  return {
    ...config,
    polymarket: {
      host: config.polymarket.host,
      chainId: config.polymarket.chainId,
      hasKey: !!config.polymarket.privateKey,
    },
  };
}

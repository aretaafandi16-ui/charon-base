'use strict';

require('dotenv').config({ override: true });

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v, d = false) => {
  if (v === undefined || v === null || v === '') return d;
  return String(v).toLowerCase() === 'true' || v === '1';
};
const list = (v, d = []) =>
  (v ? String(v).split(',') : d).map((s) => s.trim()).filter(Boolean);

const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  signals: {
    sources: list(process.env.SIGNAL_SOURCES, ['dexscreener']),
    pollMs: num(process.env.SIGNAL_POLL_MS, 30_000),
    serverUrl: process.env.SIGNAL_SERVER_URL || '',
    serverKey: process.env.SIGNAL_SERVER_KEY || '',
    dexscreenerBaseUrl:
      process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com',
    geckoterminalBaseUrl:
      process.env.GECKOTERMINAL_BASE_URL ||
      'https://api.geckoterminal.com/api/v2',
  },
  rpc: {
    httpUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    wsUrl: process.env.BASE_WS_URL || '',
    alchemyKey: process.env.ALCHEMY_API_KEY || '',
  },
  enrichment: {
    moralisApiKey: process.env.MORALIS_API_KEY || '',
    goplusAppKey: process.env.GOPLUS_APP_KEY || '',
    goplusAppSecret: process.env.GOPLUS_APP_SECRET || '',
  },
  wallet: {
    privateKey: process.env.EVM_PRIVATE_KEY || '',
    minEthReserve: num(process.env.LIVE_MIN_ETH_RESERVE, 0.005),
  },
  execution: {
    mode: (process.env.TRADING_MODE || 'dry_run').toLowerCase(),
    router: (process.env.ROUTER || 'zeroex').toLowerCase(),
    zeroexBaseUrl: process.env.ZEROEX_BASE_URL || 'https://base.api.0x.org',
    zeroexApiKey: process.env.ZEROEX_API_KEY || '',
    uniswapRouter:
      process.env.UNISWAP_ROUTER_ADDRESS ||
      '0x2626664c2603336E57B271c5C0b26F421741e481',
    slippageBps: num(process.env.DEFAULT_SLIPPAGE_BPS, 200),
    defaultBuyEth: num(process.env.DEFAULT_BUY_ETH, 0.01),
    positionCheckMs: num(process.env.POSITION_CHECK_MS, 10_000),
  },
  llm: {
    enabled: bool(process.env.ENABLE_LLM, true),
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 60_000),
    pickCount: num(process.env.LLM_CANDIDATE_PICK_COUNT, 10),
    maxAgeMs: num(process.env.LLM_CANDIDATE_MAX_AGE_MS, 600_000),
  },
  storage: {
    dbPath: process.env.DB_PATH || './charon-base.sqlite',
  },
};

const VALID_MODES = ['dry_run', 'confirm', 'live'];
if (!VALID_MODES.includes(config.execution.mode)) {
  throw new Error(
    `Invalid TRADING_MODE: ${config.execution.mode}. Must be one of ${VALID_MODES.join(', ')}.`,
  );
}

module.exports = config;

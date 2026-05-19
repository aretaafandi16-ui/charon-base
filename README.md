# Charon-Base

Charon-Base is a Telegram trench agent for screening noisy memecoin flow on
**Base chain** with overlap signals, strategy gates, LLM selection, and
dry-run/confirm/live execution. It is a Base-chain reimplementation of the
original Solana-focused Charon.

> 🇮🇩 **Versi Bahasa Indonesia**: Dokumentasi lengkap dalam Bahasa Indonesia
> tersedia di [DOCS.id.md](./DOCS.id.md).

# ALERT

This codebase is in a **testing period**. The author makes no guarantee of any
financial result. You are responsible for any funds you point at it.

## Flow

1. Charon-Base polls signal sources (DexScreener, CoinGecko Trending,
   GeckoTerminal, LunarCrush, optional custom server) every `SIGNAL_POLL_MS`.
2. The active strategy gates source count, liquidity, volume, age, market cap,
   holders, and price-change quality.
3. Passing candidates are enriched with token info, DexScreener pair data,
   GoPlus security, Moralis analytics, and LunarCrush social metrics.
4. The LLM screens up to `LLM_CANDIDATE_PICK_COUNT` recent candidates and may
   pick one `BUY`.
5. Charon routes approved buys through `dry_run`, `confirm`, or `live`.
6. Open positions are monitored every `POSITION_CHECK_MS` for TP, SL, trailing
   TP, and max-hold rules.

## Signal Sources

DexScreener is the default signal source — public, free, no API key:

- DexScreener token profiles + pair lookup (Base chain)
- CoinGecko Trending — top 15 trending coins globally, filtered for Base (free, no key)
- GeckoTerminal trending pools (optional, rate-limited ≈30 req/min)
- LunarCrush MCP — social trending for Base ecosystem (requires paid subscription)
- Custom Charon-style server (optional)

```
SIGNAL_SOURCES=dexscreener                       # default
SIGNAL_SOURCES=dexscreener,coingecko             # + CoinGecko trending (recommended)
SIGNAL_SOURCES=dexscreener,coingecko,geckoterminal  # + GeckoTerminal
SIGNAL_SOURCES=dexscreener,lunarcrush            # + LunarCrush (needs subscription)
SIGNAL_SOURCES=dexscreener,custom                # + private server
SIGNAL_SERVER_URL=https://your-server/api
SIGNAL_SERVER_KEY=your_key
```

## Enrichment (GMGN equivalent)

Charon-Base uses a public GMGN-equivalent stack instead of a single proprietary API:

- **GoPlus Token Security** — automatic, no key. Provides honeypot flag,
  buy/sell tax, holder count, LP holder count, contract verified flag,
  proxy / mintable / pausable flags, owner address.
- **DexScreener** — automatic, no key. Provides price, liquidity, volume,
  marketcap, price change windows, pair URL.
- **Moralis Token API** — optional, free key at https://moralis.com.
  Adds richer holder analytics and 24h buyer/seller counts.
- **LunarCrush** — optional (requires subscription). Adds Galaxy Score,
  social volume, interactions, sentiment per token.

Each enricher has its own rate-limited queue with response caching, so
hammering `SIGNAL_POLL_MS` low won't blow past public limits.

Strategy filters that consume security data:

```
block_honeypot          # block any token GoPlus flags as honeypot
max_buy_tax_pct         # reject if buy tax above threshold (e.g. 5)
max_sell_tax_pct        # reject if sell tax above threshold
require_open_source     # require contract source to be verified
block_pausable          # reject tokens whose transfer can be paused
```

## Install

```
git clone <your-fork> charon-base
cd charon-base
npm install
cp .env.example .env
```

Edit `.env`, then:

```
npm start
```

For PM2:

```
pm2 start index.js --name charon-base
pm2 save
```

For macOS launchd (auto-start on boot + auto-restart on crash):

```bash
cp com.charon-base.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.charon-base.plist
```

## Required Config

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`TELEGRAM_CHAT_ID` is the chat or group ID where Charon-Base sends alerts and
accepts commands. Only messages from this chat are processed.

Base RPC (defaults to public RPC; paid endpoint recommended for live):

```
BASE_RPC_URL=https://mainnet.base.org
```

## Execution Modes

```
TRADING_MODE=dry_run            # dry_run | confirm | live
ROUTER=zeroex                   # zeroex | uniswap (uniswap is a stub)
ZEROEX_API_KEY=
DEFAULT_BUY_ETH=0.01
DEFAULT_SLIPPAGE_BPS=200
LIVE_MIN_ETH_RESERVE=0.005
```

- `dry_run`: stores simulated buys/sells in SQLite, no wallet needed.
- `confirm`: sends a Telegram trade intent with approve/reject buttons.
  Executes live only after you confirm.
- `live`: signs and submits 0x Swap quotes immediately after strategy and LLM
  approval.

Live and confirm modes require:

```
EVM_PRIVATE_KEY=
ZEROEX_API_KEY=
```

`LIVE_MIN_ETH_RESERVE` is the minimum ETH kept in the wallet after any buy.
Charon-Base refuses to execute if the balance would fall below this.

The default router is **0x Swap API v2 (permit2 quote)** on Base. Slippage and
routing are handled by 0x. Set `ROUTER=uniswap` to plug in a Uniswap V3
SwapRouter02 flow yourself (the file is a stub by design).

## LLM Config

```
ENABLE_LLM=true
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
LLM_CANDIDATE_PICK_COUNT=10
```

Any OpenAI-compatible endpoint works. Each strategy has its own
`llm_min_confidence` threshold:

```
/stratset sniper llm_min_confidence 70
```

Set `ENABLE_LLM=false` to disable globally. Strategies with `use_llm: false`
(e.g. `degen`) auto-approve any candidate that passes filters.

Change the model at runtime via Telegram:

```
/model gpt-4o
/model moonshotai/kimi-k2.6
```

## Strategies

Use `/menu → Strategy` or commands:

```
/strategy
/strategy sniper
/strategy dip_buy
/strategy smart_money
/strategy degen
/strategy microcap
/stratset sniper tp_percent 75
```

Default strategies:

- `sniper`: fast entry on fresh tokens, LLM on.
- `dip_buy`: waits for negative 24h price-change dip on more mature tokens.
- `smart_money`: stricter holder/liquidity quality, partial TP support.
- `degen`: lower thresholds, rule-based (no LLM).
- `microcap`: sweet spot $250k–$1.2M market cap on Base.

Strategy settings are stored in SQLite and hot-read. Menu changes apply without
restart.

## Telegram Commands

```
/menu                           Main menu with inline buttons
/strategy [id]                  List or switch active strategy
/stratset <id> <key> <value>    Set a strategy parameter
/positions                      Show open positions
/candidate <address>            Inspect a token by address
/filters                        Show filters of active strategy
/pnl                            7-day PnL summary
/model [name]                   View or change LLM model
/trending [coins|topics]        Show trending tokens/topics (CoinGecko/LunarCrush)
/learn <window>                 Record a lesson (1h|24h|7d)
/lessons                        Show recent lessons
/walletadd <label> <address>    Save a wallet to watch
/walletremove <label>           Remove a saved wallet
/wallets                        List saved wallets
```

## Storage

Charon-Base uses `charon-base.sqlite` as source of truth. It stores:

- candidates and filter results
- LLM decisions
- dry-run/live positions and trades
- trade intents
- saved wallets
- strategy configs
- learning runs and lessons
- runtime settings (active strategy, LLM model override)

Open positions resume monitoring after restart.

## Auto-start (macOS)

A `com.charon-base.plist` launchd agent is included. It:
- Starts the bot on login/boot (`RunAtLoad`)
- Auto-restarts if the process exits for any reason (`KeepAlive`)
- Waits 5 seconds between restarts (`ThrottleInterval`)
- Logs to `logs/stdout.log` and `logs/stderr.log`

Install:

```bash
cp com.charon-base.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.charon-base.plist
```

Manage:

```bash
launchctl list | grep charon                     # check status
launchctl kickstart -k gui/$(id -u)/com.charon-base  # force restart
launchctl unload ~/Library/LaunchAgents/com.charon-base.plist  # stop
```

## Verification

```
npm run check
```

## Config Reloading

SQLite/menu settings are hot-read by the bot. API keys, wallet key, RPC URL,
and polling intervals are `.env` values and require a restart.

The LLM model can be changed at runtime via `/model <name>` — persisted in
SQLite and survives restarts.

## API Usage Notes

- DexScreener: public, no key, but rate-limited at high QPS. Default poll is
  30s.
- CoinGecko: public, no key. `/search/trending` returns top 15 globally.
  Rate limit ~30 req/min.
- GeckoTerminal: public, no key.
- LunarCrush MCP: requires `LUNARCRUSH_API_KEY` + paid subscription for data
  access. Session management handled automatically.
- 0x Swap API v2: requires `ZEROEX_API_KEY` for production; `0x-version: v2`
  header is sent automatically.
- Base RPC: position monitoring polls every `POSITION_CHECK_MS`. Use a paid
  endpoint (Alchemy, QuickNode, BlockPI) for live trading.
- LLM: one API call per batch cycle (up to `LLM_CANDIDATE_PICK_COUNT`
  candidates per call).

## Notes

- Live execution uses `viem` for transaction signing and submission.
- Position monitor sends a Telegram alert after 3 consecutive failures on any
  polling loop.
- The Uniswap V3 router path is intentionally a stub. Use 0x by default; extend
  `src/execution/uniswap.js` only if you need Uniswap-specific routing.
- GoPlus tax values are converted to percentage points internally to match
  strategy config thresholds (e.g. 5 = 5% tax).

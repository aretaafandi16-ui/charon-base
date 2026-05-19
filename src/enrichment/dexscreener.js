'use strict';

const axios = require('axios');
const PQueue = require('p-queue').default;
const config = require('../config');
const { warn } = require('../utils');

// DexScreener public, free, no key. Documented limit ~300 req/min.
// We stay well under: 4 req/s, concurrency 2.
const queue = new PQueue({ interval: 1000, intervalCap: 4, concurrency: 2 });

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

async function enrichFromDexscreener(address) {
  if (!address) return null;
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  return queue.add(async () => {
    try {
      const { data } = await axios.get(
        `${config.signals.dexscreenerBaseUrl}/latest/dex/tokens/${key}`,
        { timeout: 15_000 },
      );
      const pairs = (data?.pairs || []).filter((p) => p.chainId === 'base');
      if (pairs.length === 0) {
        cache.set(key, { ts: Date.now(), data: null });
        return null;
      }
      const top = pairs.sort(
        (a, b) =>
          (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0),
      )[0];
      const out = {
        priceUsd: Number(top.priceUsd) || null,
        liquidityUsd: Number(top.liquidity?.usd) || null,
        volume24h: Number(top.volume?.h24) || null,
        volume1h: Number(top.volume?.h1) || null,
        txns24h:
          (top.txns?.h24?.buys || 0) + (top.txns?.h24?.sells || 0) || null,
        priceChange1h:
          top.priceChange?.h1 != null ? top.priceChange.h1 / 100 : null,
        priceChange6h:
          top.priceChange?.h6 != null ? top.priceChange.h6 / 100 : null,
        priceChange24h:
          top.priceChange?.h24 != null ? top.priceChange.h24 / 100 : null,
        marketCap: Number(top.marketCap) || null,
        fdv: Number(top.fdv) || null,
        dexUrl: top.url,
        pairAddress: top.pairAddress,
      };
      cache.set(key, { ts: Date.now(), data: out });
      return out;
    } catch (e) {
      warn('dexscreener enrich failed:', e.response?.status || e.message);
      return null;
    }
  });
}

module.exports = { enrichFromDexscreener };

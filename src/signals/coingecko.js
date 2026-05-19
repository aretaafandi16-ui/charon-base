'use strict';

const axios = require('axios');
const PQueue = require('p-queue').default;
const config = require('../config');
const { warn, log } = require('../utils');

// CoinGecko free API — /search/trending (no API key needed).
// Returns top 15 trending coins by search popularity.
// Rate limit: ~30 req/min on the free tier.

const BASE_URL = 'https://api.coingecko.com/api/v3';
const queue = new PQueue({ interval: 2000, intervalCap: 1, concurrency: 1 });
const BASE_CHAIN_ID = 8453;

const cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 min (trending doesn't change fast)

/**
 * Fetch CoinGecko trending coins and filter for those available on Base.
 * Returns normalized candidates compatible with the signal pipeline.
 */
async function fetchCoinGeckoTrending() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;

  return queue.add(async () => {
    try {
      const { data } = await axios.get(`${BASE_URL}/search/trending`, {
        timeout: 15_000,
      });
      const coins = data?.coins || [];
      const results = [];

      for (const entry of coins) {
        const c = entry.item;
        if (!c) continue;

        // CoinGecko trending includes all chains. We try to resolve Base address
        // via the platforms field if available, otherwise include as general signal.
        let address = null;
        if (c.platforms) {
          // "base" key in platforms object
          address = c.platforms?.base || c.platforms?.['base'] || null;
        }

        const priceChange24h = c.data?.price_change_percentage_24h?.usd ?? null;

        results.push({
          address: address ? address.toLowerCase() : null,
          symbol: c.symbol,
          name: c.name,
          chainId: BASE_CHAIN_ID,
          priceUsd: c.data?.price ?? null,
          marketCap: c.data?.market_cap ?? null,
          volume24h: c.data?.total_volume ?? null,
          priceChange24h: priceChange24h != null ? priceChange24h / 100 : null,
          trendingScore: c.score ?? null,
          marketCapRank: c.market_cap_rank ?? null,
          coingeckoId: c.id,
          sources: ['coingecko_trending'],
          raw: { coingecko: c },
        });
      }

      // Try to resolve Base addresses for coins that don't have them
      const needsAddress = results.filter((r) => !r.address && r.coingeckoId);
      if (needsAddress.length > 0) {
        await resolveBaseAddresses(needsAddress);
      }

      const withAddress = results.filter((r) => r.address);
      log(`[coingecko] ${coins.length} trending, ${withAddress.length} on Base`);
      cache.data = withAddress;
      cache.ts = Date.now();
      return withAddress;
    } catch (e) {
      warn('[coingecko] trending fetch failed:', e.response?.status || e.message);
      return [];
    }
  });
}

/**
 * Resolve Base chain contract addresses for coins using /coins/{id} endpoint.
 * Only fetches a few to stay within rate limits.
 */
async function resolveBaseAddresses(coins) {
  // Only resolve up to 5 per cycle to stay within rate limits
  const batch = coins.slice(0, 5);
  for (const coin of batch) {
    try {
      await new Promise((r) => setTimeout(r, 2200)); // respect rate limit
      const { data } = await axios.get(
        `${BASE_URL}/coins/${coin.coingeckoId}`,
        {
          params: { localization: false, tickers: false, community_data: false, developer_data: false },
          timeout: 10_000,
        },
      );
      const baseAddr = data?.platforms?.base || data?.detail_platforms?.base?.contract_address;
      if (baseAddr) {
        coin.address = baseAddr.toLowerCase();
      }
    } catch {
      // skip — don't burn rate limit on errors
    }
  }
}

module.exports = { fetchCoinGeckoTrending };

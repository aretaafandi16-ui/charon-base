'use strict';

const axios = require('axios');
const config = require('../config');
const { warn } = require('../utils');

const BASE_CHAIN_ID = 8453;
const BASE_CG_NETWORK = 'base';

function normalizeFromDexscreener(pair) {
  if (!pair?.baseToken?.address) return null;
  const ageMs =
    pair.pairCreatedAt && Number.isFinite(pair.pairCreatedAt)
      ? Date.now() - Number(pair.pairCreatedAt)
      : null;
  return {
    address: pair.baseToken.address.toLowerCase(),
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    chainId: BASE_CHAIN_ID,
    priceUsd: Number(pair.priceUsd) || null,
    liquidityUsd: Number(pair.liquidity?.usd) || null,
    volume24h: Number(pair.volume?.h24) || null,
    volume1h: Number(pair.volume?.h1) || null,
    txns24h:
      (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0) || null,
    priceChange1h: pair.priceChange?.h1 != null ? pair.priceChange.h1 / 100 : null,
    priceChange6h: pair.priceChange?.h6 != null ? pair.priceChange.h6 / 100 : null,
    priceChange24h:
      pair.priceChange?.h24 != null ? pair.priceChange.h24 / 100 : null,
    fdv: Number(pair.fdv) || null,
    marketCap: Number(pair.marketCap) || null,
    ageMinutes: ageMs ? Math.floor(ageMs / 60_000) : null,
    dexUrl: pair.url || null,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    sources: ['dexscreener'],
    raw: { dexscreener: pair },
  };
}

async function fetchDexscreenerTrending() {
  const url = `${config.signals.dexscreenerBaseUrl}/token-profiles/latest/v1`;
  try {
    const { data } = await axios.get(url, { timeout: 15_000 });
    const profiles = Array.isArray(data) ? data : [];
    const baseProfiles = profiles.filter(
      (p) => p.chainId === 'base' && p.tokenAddress,
    );

    const out = [];
    for (const p of baseProfiles.slice(0, 30)) {
      try {
        const pairResp = await axios.get(
          `${config.signals.dexscreenerBaseUrl}/latest/dex/tokens/${p.tokenAddress}`,
          { timeout: 15_000 },
        );
        const pair = (pairResp.data?.pairs || [])
          .filter((x) => x.chainId === 'base')
          .sort(
            (a, b) =>
              (Number(b.liquidity?.usd) || 0) -
              (Number(a.liquidity?.usd) || 0),
          )[0];
        if (!pair) continue;
        const norm = normalizeFromDexscreener(pair);
        if (norm) out.push(norm);
      } catch (e) {
        warn('dexscreener pair lookup failed', p.tokenAddress, e.message);
      }
    }
    return out;
  } catch (e) {
    warn('dexscreener trending fetch failed:', e.message);
    return [];
  }
}

async function fetchGeckoterminalTrending() {
  const url = `${config.signals.geckoterminalBaseUrl}/networks/${BASE_CG_NETWORK}/trending_pools?include=base_token,quote_token`;
  try {
    const { data } = await axios.get(url, { timeout: 15_000 });
    const pools = data?.data || [];
    const included = data?.included || [];
    const tokenLookup = new Map(
      included
        .filter((x) => x.type === 'token')
        .map((t) => [t.id, t.attributes]),
    );

    return pools
      .map((pool) => {
        const a = pool.attributes || {};
        const baseId = pool.relationships?.base_token?.data?.id;
        const tk = baseId ? tokenLookup.get(baseId) : null;
        if (!tk?.address) return null;
        const ageMs = a.pool_created_at
          ? Date.now() - new Date(a.pool_created_at).getTime()
          : null;
        return {
          address: String(tk.address).toLowerCase(),
          symbol: tk.symbol,
          name: tk.name,
          chainId: BASE_CHAIN_ID,
          priceUsd: Number(a.base_token_price_usd) || null,
          liquidityUsd: Number(a.reserve_in_usd) || null,
          volume24h: Number(a.volume_usd?.h24) || null,
          volume1h: Number(a.volume_usd?.h1) || null,
          txns24h:
            (a.transactions?.h24?.buys || 0) +
              (a.transactions?.h24?.sells || 0) || null,
          priceChange1h:
            a.price_change_percentage?.h1 != null
              ? Number(a.price_change_percentage.h1) / 100
              : null,
          priceChange24h:
            a.price_change_percentage?.h24 != null
              ? Number(a.price_change_percentage.h24) / 100
              : null,
          fdv: Number(a.fdv_usd) || null,
          marketCap: Number(a.market_cap_usd) || null,
          ageMinutes: ageMs ? Math.floor(ageMs / 60_000) : null,
          dexUrl: a.pool_address
            ? `https://www.geckoterminal.com/${BASE_CG_NETWORK}/pools/${a.pool_address}`
            : null,
          pairAddress: a.address,
          sources: ['geckoterminal'],
          raw: { geckoterminal: a },
        };
      })
      .filter(Boolean);
  } catch (e) {
    warn('geckoterminal trending fetch failed:', e.message);
    return [];
  }
}

async function fetchCustomServer() {
  if (!config.signals.serverUrl) return [];
  try {
    const { data } = await axios.get(`${config.signals.serverUrl}/signals`, {
      timeout: 15_000,
      headers: config.signals.serverKey
        ? { 'x-api-key': config.signals.serverKey }
        : undefined,
    });
    const items = Array.isArray(data) ? data : data?.signals || [];
    return items.map((it) => ({
      address: String(it.address || it.token).toLowerCase(),
      symbol: it.symbol,
      name: it.name,
      chainId: BASE_CHAIN_ID,
      priceUsd: it.priceUsd ?? null,
      liquidityUsd: it.liquidityUsd ?? null,
      volume24h: it.volume24h ?? null,
      marketCap: it.marketCap ?? null,
      holders: it.holders ?? null,
      ageMinutes: it.ageMinutes ?? null,
      dexUrl: it.url ?? null,
      sources: ['custom'],
      raw: { custom: it },
    }));
  } catch (e) {
    warn('custom signal server fetch failed:', e.message);
    return [];
  }
}

const SOURCE_FETCHERS = {
  dexscreener: fetchDexscreenerTrending,
  geckoterminal: fetchGeckoterminalTrending,
  custom: fetchCustomServer,
};

function mergeCandidates(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const c of list) {
      if (!c?.address) continue;
      const key = c.address;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...c, sources: [...(c.sources || [])] });
      } else {
        existing.sources = Array.from(
          new Set([...(existing.sources || []), ...(c.sources || [])]),
        );
        for (const f of [
          'priceUsd',
          'liquidityUsd',
          'volume24h',
          'volume1h',
          'txns24h',
          'priceChange1h',
          'priceChange6h',
          'priceChange24h',
          'fdv',
          'marketCap',
          'holders',
          'ageMinutes',
          'dexUrl',
          'symbol',
          'name',
        ]) {
          if (existing[f] == null && c[f] != null) existing[f] = c[f];
        }
        existing.raw = { ...(existing.raw || {}), ...(c.raw || {}) };
      }
    }
  }
  return Array.from(map.values());
}

async function fetchAllSignals() {
  const enabled = config.signals.sources.filter((s) => SOURCE_FETCHERS[s]);
  const results = await Promise.all(enabled.map((s) => SOURCE_FETCHERS[s]()));
  return mergeCandidates(results);
}

module.exports = { fetchAllSignals };

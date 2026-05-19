'use strict';

const axios = require('axios');
const config = require('../config');
const { warn } = require('../utils');

async function enrichFromDexscreener(address) {
  if (!address) return null;
  try {
    const { data } = await axios.get(
      `${config.signals.dexscreenerBaseUrl}/latest/dex/tokens/${address}`,
      { timeout: 15_000 },
    );
    const pairs = (data?.pairs || []).filter((p) => p.chainId === 'base');
    if (pairs.length === 0) return null;
    const top = pairs.sort(
      (a, b) =>
        (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0),
    )[0];
    return {
      priceUsd: Number(top.priceUsd) || null,
      liquidityUsd: Number(top.liquidity?.usd) || null,
      volume24h: Number(top.volume?.h24) || null,
      txns24h:
        (top.txns?.h24?.buys || 0) + (top.txns?.h24?.sells || 0) || null,
      marketCap: Number(top.marketCap) || null,
      fdv: Number(top.fdv) || null,
      dexUrl: top.url,
      pairAddress: top.pairAddress,
    };
  } catch (e) {
    warn('dexscreener enrich failed:', e.message);
    return null;
  }
}

module.exports = { enrichFromDexscreener };

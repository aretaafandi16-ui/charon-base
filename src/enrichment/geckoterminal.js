'use strict';

const axios = require('axios');
const config = require('../config');
const { warn } = require('../utils');

async function enrichFromGeckoterminal(address) {
  if (!address) return null;
  try {
    const { data } = await axios.get(
      `${config.signals.geckoterminalBaseUrl}/networks/base/tokens/${address}`,
      { timeout: 15_000 },
    );
    const a = data?.data?.attributes || {};
    return {
      symbol: a.symbol,
      name: a.name,
      priceUsd: Number(a.price_usd) || null,
      fdv: Number(a.fdv_usd) || null,
      marketCap: Number(a.market_cap_usd) || null,
      totalSupply: a.total_supply,
      holders: a.holders?.count ?? null,
    };
  } catch (e) {
    warn('geckoterminal enrich failed:', e.message);
    return null;
  }
}

module.exports = { enrichFromGeckoterminal };

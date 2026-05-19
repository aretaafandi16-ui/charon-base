'use strict';

const axios = require('axios');
const PQueue = require('p-queue').default;
const config = require('../config');
const { warn } = require('../utils');

// Moralis is optional. If MORALIS_API_KEY is not set, this enricher returns null.
// Endpoints used:
//   GET /erc20/{address}/holders        (holder stats)
//   GET /erc20/{address}/analytics      (volume + buyer/seller stats)
const BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const queue = new PQueue({ interval: 1000, intervalCap: 5, concurrency: 2 });

function headers() {
  return { 'X-API-Key': config.enrichment.moralisApiKey };
}

async function enrichFromMoralis(address) {
  if (!config.enrichment.moralisApiKey || !address) return null;
  return queue.add(async () => {
    try {
      const [holdersResp, analyticsResp] = await Promise.allSettled([
        axios.get(`${BASE_URL}/erc20/${address}/holders`, {
          params: { chain: 'base' },
          timeout: 15_000,
          headers: headers(),
        }),
        axios.get(`${BASE_URL}/erc20/${address}/analytics`, {
          params: { chain: 'base' },
          timeout: 15_000,
          headers: headers(),
        }),
      ]);

      const out = {};
      if (holdersResp.status === 'fulfilled') {
        const h = holdersResp.value.data || {};
        out.holders = Number(h.totalHolders) || null;
        if (h.holderSupply?.top10?.supplyPercent != null) {
          out.top10HolderPct = Number(h.holderSupply.top10.supplyPercent);
        }
      }
      if (analyticsResp.status === 'fulfilled') {
        const a = analyticsResp.value.data || {};
        out.totalBuyers24h = Number(a.totalBuyers?.['24h']) || null;
        out.totalSellers24h = Number(a.totalSellers?.['24h']) || null;
      }
      return Object.keys(out).length ? out : null;
    } catch (e) {
      warn('moralis enrich failed:', e.response?.status || e.message);
      return null;
    }
  });
}

module.exports = { enrichFromMoralis };

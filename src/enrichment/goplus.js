'use strict';

const axios = require('axios');
const PQueue = require('p-queue').default;
const { warn } = require('../utils');

// GoPlus public Token Security API. No API key required.
// Docs: https://docs.gopluslabs.io/reference/tokensecurityusingget_1
const BASE_CHAIN_ID = 8453;
const GOPLUS_URL = 'https://api.gopluslabs.io/api/v1/token_security';

// 5 req/s ceiling — GoPlus public limit is friendly but we keep it modest.
const queue = new PQueue({ interval: 1000, intervalCap: 4, concurrency: 2 });

const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool01(v) {
  if (v === undefined || v === null) return null;
  return String(v) === '1';
}

function shapeReport(r) {
  if (!r) return null;
  const buyTax = num(r.buy_tax);
  const sellTax = num(r.sell_tax);
  const isHoneypot = bool01(r.is_honeypot);
  const isOpenSource = bool01(r.is_open_source);
  const isProxy = bool01(r.is_proxy);
  const isMintable = bool01(r.is_mintable);
  const transferPausable = bool01(r.transfer_pausable);
  const blacklist = bool01(r.is_blacklisted);
  const totalSupply = num(r.total_supply);
  const holderCount = num(r.holder_count);
  const lpHolderCount = num(r.lp_holder_count);
  const ownerAddress = r.owner_address || null;
  const creatorAddress = r.creator_address || null;
  return {
    holders: holderCount,
    lpHolders: lpHolderCount,
    totalSupply,
    buyTax,
    sellTax,
    isHoneypot,
    isOpenSource,
    isProxy,
    isMintable,
    transferPausable,
    blacklist,
    ownerAddress,
    creatorAddress,
    raw: r,
  };
}

async function enrichFromGoplus(address) {
  if (!address) return null;
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  return queue.add(async () => {
    try {
      const { data } = await axios.get(
        `${GOPLUS_URL}/${BASE_CHAIN_ID}?contract_addresses=${key}`,
        { timeout: 12_000 },
      );
      const result = data?.result?.[key];
      const shaped = shapeReport(result);
      cache.set(key, { ts: Date.now(), data: shaped });
      return shaped;
    } catch (e) {
      warn('goplus enrich failed:', e.response?.status || e.message);
      return null;
    }
  });
}

module.exports = { enrichFromGoplus };

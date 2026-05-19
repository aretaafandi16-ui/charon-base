'use strict';

const axios = require('axios');
const crypto = require('crypto');
const PQueue = require('p-queue').default;
const config = require('../config');
const { warn, log } = require('../utils');

// GoPlus Token Security API.
// Supports authenticated mode (app_key + app_secret → access token)
// and unauthenticated mode (free, rate-limited).
const BASE_CHAIN_ID = 8453;
const GOPLUS_URL = 'https://api.gopluslabs.io/api/v1/token_security';
const GOPLUS_TOKEN_URL = 'https://api.gopluslabs.io/api/v1/token';

const queue = new PQueue({ interval: 1000, intervalCap: 4, concurrency: 2 });
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Access token state
let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const appKey = config.enrichment.goplusAppKey;
  const appSecret = config.enrichment.goplusAppSecret;
  if (!appKey || !appSecret) return null;

  // Refresh 60s before expiry
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;

  const time = Math.floor(Date.now() / 1000);
  const sign = crypto
    .createHash('sha1')
    .update(`${appKey}${time}${appSecret}`)
    .digest('hex');

  try {
    const { data } = await axios.post(
      GOPLUS_TOKEN_URL,
      { app_key: appKey, sign, time },
      { timeout: 10_000 },
    );
    if (data?.code === 1 && data.result?.access_token) {
      accessToken = data.result.access_token;
      // Default 24h expiry, but respect server if given
      const expiresIn = data.result.expires_in || 86400;
      tokenExpiresAt = Date.now() + expiresIn * 1000;
      log('[goplus] access token refreshed');
      return accessToken;
    }
    warn('[goplus] token response unexpected:', JSON.stringify(data));
    return null;
  } catch (e) {
    warn('[goplus] get access token failed:', e.response?.status || e.message);
    return null;
  }
}

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
      const token = await getAccessToken();
      const headers = {};
      if (token) headers.Authorization = token;

      const { data } = await axios.get(
        `${GOPLUS_URL}/${BASE_CHAIN_ID}?contract_addresses=${key}`,
        { timeout: 12_000, headers },
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

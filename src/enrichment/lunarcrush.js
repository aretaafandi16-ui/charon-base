'use strict';

const axios = require('axios');
const PQueue = require('p-queue').default;
const config = require('../config');
const { warn, log } = require('../utils');

// LunarCrush MCP Server — social intelligence via MCP HTTP streaming protocol.
// Endpoint: https://lunarcrush.ai/mcp
// Auth: Bearer token via LUNARCRUSH_API_KEY
// Tools: list, cryptocurrencies, topic, search, etc.

const MCP_URL = 'https://lunarcrush.ai/mcp';
const queue = new PQueue({ interval: 1500, intervalCap: 2, concurrency: 1 });
const cache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 min

let sessionId = null;

function authHeaders() {
  const h = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${config.enrichment.lunarcrushApiKey}`,
  };
  if (sessionId) h['Mcp-Session-Id'] = sessionId;
  return h;
}

function parseSSEResponse(text) {
  // MCP returns SSE format: "event: message\ndata: {...}\n\n"
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.slice(6));
      } catch { /* ignore */ }
    }
  }
  // Try parsing as plain JSON
  try { return JSON.parse(text); } catch { return null; }
}

async function initSession() {
  if (sessionId) return;
  try {
    const { data, headers: respHeaders } = await axios.post(
      MCP_URL,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'charon-base', version: '1.0' },
        },
      },
      { headers: authHeaders(), timeout: 10_000, transformResponse: [(d) => d] },
    );
    // Extract session ID from response headers
    sessionId = respHeaders['mcp-session-id'] || null;
    if (sessionId) log('[lunarcrush] MCP session initialized');
  } catch (e) {
    warn('[lunarcrush] MCP init failed:', e.response?.status || e.message);
  }
}

async function callTool(toolName, args = {}) {
  if (!config.enrichment.lunarcrushApiKey) return null;
  await initSession();

  try {
    const { data } = await axios.post(
      MCP_URL,
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      },
      { headers: authHeaders(), timeout: 20_000, transformResponse: [(d) => d] },
    );
    const parsed = parseSSEResponse(data);
    if (parsed?.result?.content) {
      // MCP returns content array with text items
      const textItem = parsed.result.content.find((c) => c.type === 'text');
      if (textItem?.text) {
        try { return JSON.parse(textItem.text); } catch { return textItem.text; }
      }
    }
    return parsed?.result || null;
  } catch (e) {
    // If session expired, reset and retry once
    if (e.response?.status === 400 || e.response?.data?.includes?.('Session not found')) {
      sessionId = null;
      await initSession();
      try {
        const { data } = await axios.post(
          MCP_URL,
          {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: toolName, arguments: args },
          },
          { headers: authHeaders(), timeout: 20_000, transformResponse: [(d) => d] },
        );
        const parsed = parseSSEResponse(data);
        if (parsed?.result?.content) {
          const textItem = parsed.result.content.find((c) => c.type === 'text');
          if (textItem?.text) {
            try { return JSON.parse(textItem.text); } catch { return textItem.text; }
          }
        }
        return parsed?.result || null;
      } catch (e2) {
        warn('[lunarcrush] MCP retry failed:', e2.response?.status || e2.message);
        return null;
      }
    }
    warn('[lunarcrush] MCP call failed:', toolName, e.response?.status || e.message);
    return null;
  }
}

/**
 * Fetch trending coins on Base ecosystem sorted by social interactions.
 */
async function fetchTrendingCoins({ sort = 'interactions', limit = 30 } = {}) {
  if (!config.enrichment.lunarcrushApiKey) {
    warn('[lunarcrush] LUNARCRUSH_API_KEY not set — skipping');
    return [];
  }

  const cacheKey = `trending:${sort}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  return queue.add(async () => {
    const data = await callTool('cryptocurrencies', {
      sector: 'base-ecosystem',
      sort,
      limit,
    });
    if (!data || typeof data === 'string') {
      if (typeof data === 'string' && data.includes('Subscription required')) {
        // Only log once per cache cycle
        if (!cache.get('_sub_warned')) {
          warn('[lunarcrush] Subscription required — upgrade at https://lunarcrush.com/pricing');
          cache.set('_sub_warned', { ts: Date.now(), data: true });
        }
      } else {
        log('[lunarcrush] trending response:', typeof data === 'string' ? data.slice(0, 200) : 'null');
      }
      cache.set(cacheKey, { ts: Date.now(), data: [] });
      return [];
    }

    const coins = Array.isArray(data) ? data : data?.data || [];
    const results = coins.map((c) => normalizeLunarCoin(c)).filter((c) => c.address);

    log(`[lunarcrush] fetched ${coins.length} Base coins, ${results.length} with addresses`);
    cache.set(cacheKey, { ts: Date.now(), data: results });
    return results;
  });
}

/**
 * Fetch social data for a specific coin by symbol.
 */
async function fetchCoinSocial(symbol) {
  if (!config.enrichment.lunarcrushApiKey || !symbol) return null;

  const cacheKey = `coin:${symbol.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  return queue.add(async () => {
    const data = await callTool('topic', { topic: `$${symbol.toLowerCase()}` });
    if (!data || typeof data !== 'object' || typeof data === 'string') return null;

    const out = {
      galaxyScore: data.galaxy_score ?? null,
      altRank: data.alt_rank ?? data.topic_rank ?? null,
      socialVolume24h: data.posts_active ?? data.num_posts ?? null,
      interactions24h: data.interactions ?? data.interactions_24h ?? null,
      socialDominance: data.social_dominance ?? null,
      sentiment: data.sentiment ?? null,
    };
    cache.set(cacheKey, { ts: Date.now(), data: out });
    return out;
  });
}

/**
 * Fetch trending social topics.
 */
async function fetchTrendingTopics({ limit = 20, category = 'cryptocurrencies' } = {}) {
  if (!config.enrichment.lunarcrushApiKey) return [];

  const cacheKey = `topics:${category}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  return queue.add(async () => {
    const data = await callTool('list', { category, sort: 'interactions', limit });
    if (!data) return [];

    const topics = Array.isArray(data) ? data : data?.data || [];
    const results = topics.map((t) => ({
      topic: t.topic || t.name || t.symbol,
      title: t.title || t.name || t.topic,
      socialVolume: t.posts_active ?? t.num_posts ?? null,
      interactions: t.interactions ?? null,
      sentiment: t.sentiment ?? null,
      galaxyScore: t.galaxy_score ?? null,
      categories: t.categories ? t.categories.split(',') : [],
    }));
    cache.set(cacheKey, { ts: Date.now(), data: results });
    return results;
  });
}

function normalizeLunarCoin(c) {
  // Try to extract Base chain address from blockchains array or known fields
  let address = null;
  if (c.blockchains) {
    const baseChain = c.blockchains.find((b) => b.network === 'base');
    if (baseChain?.address) address = baseChain.address.toLowerCase();
  }
  // Some responses include address directly
  if (!address && c.address) address = c.address.toLowerCase();

  return {
    address,
    symbol: c.symbol || c.topic,
    name: c.name || c.title,
    chainId: 8453,
    priceUsd: c.close ?? c.price ?? null,
    marketCap: c.market_cap ?? null,
    volume24h: c.volume_24h ?? null,
    priceChange1h: c.percent_change_1h != null ? c.percent_change_1h / 100 : null,
    priceChange24h: c.percent_change_24h != null ? c.percent_change_24h / 100 : null,
    // LunarCrush social metrics
    galaxyScore: c.galaxy_score ?? null,
    altRank: c.alt_rank ?? c.topic_rank ?? null,
    socialVolume24h: c.posts_active ?? c.social_volume_24h ?? null,
    interactions24h: c.interactions ?? c.interactions_24h ?? null,
    socialDominance: c.social_dominance ?? null,
    sentiment: c.sentiment ?? null,
    sources: ['lunarcrush'],
    raw: { lunarcrush: c },
  };
}

module.exports = {
  fetchTrendingCoins,
  fetchCoinSocial,
  fetchTrendingTopics,
  callTool,
};

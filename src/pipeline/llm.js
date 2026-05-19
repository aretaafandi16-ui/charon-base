'use strict';

const axios = require('axios');
const config = require('../config');
const { warn } = require('../utils');

function buildPrompt(candidates) {
  const compact = candidates.map((c, i) => ({
    i,
    address: c.address,
    symbol: c.symbol,
    name: c.name,
    chain: 'base',
    priceUsd: c.priceUsd,
    marketCap: c.marketCap,
    liquidityUsd: c.liquidityUsd,
    volume24h: c.volume24h,
    txns24h: c.txns24h,
    holders: c.holders,
    ageMinutes: c.ageMinutes,
    priceChange1h: c.priceChange1h,
    priceChange6h: c.priceChange6h,
    priceChange24h: c.priceChange24h,
    sources: c.sources,
  }));

  return [
    {
      role: 'system',
      content:
        'You are a trading screener for Base-chain memecoins. Pick at most one BUY from the list, or NONE. Respond strictly as compact JSON: {"decision":"BUY"|"NONE","index":number|null,"confidence":0-100,"reason":"short"}. Confidence must reflect risk: scams, low liquidity, illogical metrics, or stale momentum reduce confidence sharply.',
    },
    {
      role: 'user',
      content: JSON.stringify({ candidates: compact }),
    },
  ];
}

async function pickCandidate(candidates) {
  if (!config.llm.enabled || candidates.length === 0) return null;
  if (!config.llm.apiKey) {
    warn('[llm] missing LLM_API_KEY, skipping');
    return null;
  }
  const messages = buildPrompt(candidates);
  try {
    const { data } = await axios.post(
      `${config.llm.baseUrl}/chat/completions`,
      {
        model: config.llm.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages,
      },
      {
        timeout: config.llm.timeoutMs,
        headers: {
          Authorization: `Bearer ${config.llm.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
    if (parsed.decision !== 'BUY' || typeof parsed.index !== 'number') {
      return { decision: 'NONE', confidence: parsed.confidence ?? 0, reason: parsed.reason };
    }
    const pick = candidates[parsed.index];
    if (!pick) return null;
    return {
      decision: 'BUY',
      candidate: pick,
      confidence: Number(parsed.confidence) || 0,
      reason: parsed.reason || '',
    };
  } catch (e) {
    warn('[llm] call failed:', e.message);
    return null;
  }
}

module.exports = { pickCandidate };

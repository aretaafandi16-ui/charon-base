'use strict';

const { stmts } = require('../db');
const { nowMs } = require('../utils');

const DEFAULTS = {
  sniper: {
    name: 'sniper',
    use_llm: true,
    llm_min_confidence: 70,
    min_sources: 1,
    min_liquidity_usd: 25_000,
    min_volume_24h_usd: 50_000,
    max_age_minutes: 240,
    min_marketcap_usd: 50_000,
    max_marketcap_usd: 5_000_000,
    min_holders: 200,
    min_price_change_1h: 0.05,
    max_concurrent_positions: 5,
    buy_eth: 0.01,
    tp_percent: 75,
    sl_percent: 35,
    trailing_tp_percent: 25,
    max_hold_ms: 6 * 60 * 60 * 1000,
    partial_tp: 0,
    block_honeypot: true,
    max_buy_tax_pct: 5,
    max_sell_tax_pct: 5,
    require_open_source: false,
    block_pausable: true,
  },
  dip_buy: {
    name: 'dip_buy',
    use_llm: true,
    llm_min_confidence: 65,
    min_sources: 1,
    min_liquidity_usd: 80_000,
    min_volume_24h_usd: 250_000,
    max_age_minutes: 60 * 24 * 30,
    min_marketcap_usd: 500_000,
    max_marketcap_usd: 50_000_000,
    min_holders: 1500,
    max_price_change_24h: -0.15,
    max_concurrent_positions: 4,
    buy_eth: 0.015,
    tp_percent: 60,
    sl_percent: 25,
    trailing_tp_percent: 20,
    max_hold_ms: 24 * 60 * 60 * 1000,
    partial_tp: 1,
    block_honeypot: true,
    max_buy_tax_pct: 3,
    max_sell_tax_pct: 3,
    require_open_source: true,
    block_pausable: true,
  },
  smart_money: {
    name: 'smart_money',
    use_llm: true,
    llm_min_confidence: 75,
    min_sources: 2,
    min_liquidity_usd: 100_000,
    min_volume_24h_usd: 300_000,
    max_age_minutes: 60 * 24 * 14,
    min_marketcap_usd: 250_000,
    max_marketcap_usd: 25_000_000,
    min_holders: 1000,
    min_price_change_1h: 0.02,
    max_concurrent_positions: 3,
    buy_eth: 0.02,
    tp_percent: 100,
    sl_percent: 30,
    trailing_tp_percent: 30,
    max_hold_ms: 12 * 60 * 60 * 1000,
    partial_tp: 1,
    block_honeypot: true,
    max_buy_tax_pct: 3,
    max_sell_tax_pct: 3,
    require_open_source: true,
    block_pausable: true,
  },
  degen: {
    name: 'degen',
    use_llm: false,
    llm_min_confidence: 0,
    min_sources: 1,
    min_liquidity_usd: 8_000,
    min_volume_24h_usd: 15_000,
    max_age_minutes: 60,
    min_marketcap_usd: 10_000,
    max_marketcap_usd: 2_000_000,
    min_holders: 50,
    min_price_change_1h: 0.1,
    max_concurrent_positions: 8,
    buy_eth: 0.005,
    tp_percent: 150,
    sl_percent: 50,
    trailing_tp_percent: 40,
    max_hold_ms: 2 * 60 * 60 * 1000,
    partial_tp: 0,
    block_honeypot: true,
    max_buy_tax_pct: 10,
    max_sell_tax_pct: 10,
    require_open_source: false,
    block_pausable: false,
  },
};

function ensureDefaults() {
  const s = stmts();
  for (const id of Object.keys(DEFAULTS)) {
    if (!s.getStrategy.get(id)) {
      s.upsertStrategy.run({
        strategyId: id,
        payload: JSON.stringify(DEFAULTS[id]),
        ts: nowMs(),
      });
    }
  }
}

function listStrategies() {
  ensureDefaults();
  const s = stmts();
  return s.listStrategies.all().map((row) => ({
    id: row.strategy_id,
    config: JSON.parse(row.payload),
    updatedAt: row.updated_at,
  }));
}

function getStrategy(id) {
  ensureDefaults();
  const row = stmts().getStrategy.get(id);
  if (!row) return null;
  return JSON.parse(row.payload);
}

function setStrategyKey(id, key, value) {
  const cfg = getStrategy(id);
  if (!cfg) throw new Error(`Unknown strategy: ${id}`);
  let v = value;
  if (typeof DEFAULTS[id]?.[key] === 'number') v = Number(value);
  if (typeof DEFAULTS[id]?.[key] === 'boolean')
    v = String(value).toLowerCase() === 'true' || value === '1';
  cfg[key] = v;
  stmts().upsertStrategy.run({
    strategyId: id,
    payload: JSON.stringify(cfg),
    ts: nowMs(),
  });
  return cfg;
}

function getActiveStrategy() {
  ensureDefaults();
  const s = stmts();
  const row = s.getSetting.get('active_strategy');
  return row?.value || 'sniper';
}

function setActiveStrategy(id) {
  if (!DEFAULTS[id] && !getStrategy(id)) {
    throw new Error(`Unknown strategy: ${id}`);
  }
  stmts().setSetting.run({ key: 'active_strategy', value: id });
  return id;
}

module.exports = {
  DEFAULTS,
  ensureDefaults,
  listStrategies,
  getStrategy,
  setStrategyKey,
  getActiveStrategy,
  setActiveStrategy,
};

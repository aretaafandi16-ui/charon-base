'use strict';

const Database = require('better-sqlite3');
const config = require('../config');

let db;

function init() {
  if (db) return db;
  db = new Database(config.storage.dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      address TEXT PRIMARY KEY,
      symbol TEXT,
      name TEXT,
      first_seen INTEGER,
      last_seen INTEGER,
      payload TEXT
    );

    CREATE TABLE IF NOT EXISTS filter_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT,
      strategy_id TEXT,
      passed INTEGER,
      reason TEXT,
      ts INTEGER
    );

    CREATE TABLE IF NOT EXISTS llm_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT,
      address TEXT,
      decision TEXT,
      confidence INTEGER,
      reason TEXT,
      ts INTEGER
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT,
      symbol TEXT,
      strategy_id TEXT,
      mode TEXT,
      amount_eth REAL,
      entry_price_usd REAL,
      tokens_bought REAL,
      opened_at INTEGER,
      closed_at INTEGER,
      tp_percent REAL,
      sl_percent REAL,
      trailing_tp_percent REAL,
      max_hold_ms INTEGER,
      partial_tp INTEGER,
      status TEXT,
      pnl REAL,
      tx_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER,
      side TEXT,
      amount_eth REAL,
      tokens REAL,
      price_usd REAL,
      tx_hash TEXT,
      ts INTEGER
    );

    CREATE TABLE IF NOT EXISTS trade_intents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT,
      symbol TEXT,
      strategy_id TEXT,
      router TEXT,
      mode TEXT,
      amount_eth REAL,
      slippage_bps INTEGER,
      llm_confidence INTEGER,
      status TEXT,
      created_at INTEGER,
      resolved_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS strategy_configs (
      strategy_id TEXT PRIMARY KEY,
      payload TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS saved_wallets (
      label TEXT PRIMARY KEY,
      address TEXT,
      added_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      window TEXT,
      summary TEXT,
      created_at INTEGER
    );
  `);

  return db;
}

function get() {
  return init();
}

const stmts = () => {
  const d = get();
  return {
    upsertCandidate: d.prepare(`
      INSERT INTO candidates (address, symbol, name, first_seen, last_seen, payload)
      VALUES (@address, @symbol, @name, @ts, @ts, @payload)
      ON CONFLICT(address) DO UPDATE SET
        last_seen = @ts,
        symbol = excluded.symbol,
        name = excluded.name,
        payload = excluded.payload
    `),
    getCandidate: d.prepare(`SELECT * FROM candidates WHERE address = ?`),
    recentCandidates: d.prepare(`
      SELECT * FROM candidates
      WHERE last_seen >= ?
      ORDER BY last_seen DESC
      LIMIT ?
    `),
    insertFilterResult: d.prepare(`
      INSERT INTO filter_results (address, strategy_id, passed, reason, ts)
      VALUES (@address, @strategyId, @passed, @reason, @ts)
    `),
    insertLlmDecision: d.prepare(`
      INSERT INTO llm_decisions (batch_id, address, decision, confidence, reason, ts)
      VALUES (@batchId, @address, @decision, @confidence, @reason, @ts)
    `),
    insertPosition: d.prepare(`
      INSERT INTO positions (
        address, symbol, strategy_id, mode, amount_eth, entry_price_usd,
        tokens_bought, opened_at, tp_percent, sl_percent, trailing_tp_percent,
        max_hold_ms, partial_tp, status, tx_hash
      ) VALUES (
        @address, @symbol, @strategyId, @mode, @amountEth, @entryPriceUsd,
        @tokensBought, @openedAt, @tpPercent, @slPercent, @trailingTpPercent,
        @maxHoldMs, @partialTp, 'open', @txHash
      )
    `),
    closePosition: d.prepare(`
      UPDATE positions
      SET closed_at = @closedAt, status = @status, pnl = @pnl
      WHERE id = @id
    `),
    openPositions: d.prepare(`SELECT * FROM positions WHERE status = 'open'`),
    insertTrade: d.prepare(`
      INSERT INTO trades (position_id, side, amount_eth, tokens, price_usd, tx_hash, ts)
      VALUES (@positionId, @side, @amountEth, @tokens, @priceUsd, @txHash, @ts)
    `),
    insertIntent: d.prepare(`
      INSERT INTO trade_intents
        (address, symbol, strategy_id, router, mode, amount_eth, slippage_bps,
         llm_confidence, status, created_at)
      VALUES (@address, @symbol, @strategyId, @router, @mode, @amountEth,
              @slippageBps, @llmConfidence, 'pending', @createdAt)
    `),
    setIntentStatus: d.prepare(`
      UPDATE trade_intents SET status = @status, resolved_at = @resolvedAt WHERE id = @id
    `),
    getIntent: d.prepare(`SELECT * FROM trade_intents WHERE id = ?`),
    upsertStrategy: d.prepare(`
      INSERT INTO strategy_configs (strategy_id, payload, updated_at)
      VALUES (@strategyId, @payload, @ts)
      ON CONFLICT(strategy_id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `),
    getStrategy: d.prepare(`SELECT * FROM strategy_configs WHERE strategy_id = ?`),
    listStrategies: d.prepare(`SELECT * FROM strategy_configs`),
    upsertWallet: d.prepare(`
      INSERT INTO saved_wallets (label, address, added_at)
      VALUES (@label, @address, @ts)
      ON CONFLICT(label) DO UPDATE SET
        address = excluded.address,
        added_at = excluded.added_at
    `),
    removeWallet: d.prepare(`DELETE FROM saved_wallets WHERE label = ?`),
    listWallets: d.prepare(`SELECT * FROM saved_wallets ORDER BY added_at DESC`),
    setSetting: d.prepare(`
      INSERT INTO settings (key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `),
    getSetting: d.prepare(`SELECT value FROM settings WHERE key = ?`),
    insertLesson: d.prepare(`
      INSERT INTO lessons (window, summary, created_at)
      VALUES (@window, @summary, @ts)
    `),
    listLessons: d.prepare(`SELECT * FROM lessons ORDER BY created_at DESC LIMIT ?`),
  };
};

module.exports = { init, get, stmts };

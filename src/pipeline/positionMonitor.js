'use strict';

const config = require('../config');
const { stmts } = require('../db');
const { enrichFromDexscreener } = require('../enrichment/dexscreener');
const { sleep, nowMs, log, warn } = require('../utils');

let running = false;
let stopRequested = false;
let consecutiveFailures = 0;

async function refreshPosition(p, onClose) {
  const enriched = await enrichFromDexscreener(p.address);
  if (!enriched?.priceUsd) return null;

  const entry = p.entry_price_usd || 0;
  const now = enriched.priceUsd;
  const pnl = entry > 0 ? (now - entry) / entry : 0;
  const elapsed = nowMs() - p.opened_at;

  let closeReason = null;
  if (pnl * 100 >= p.tp_percent) closeReason = 'tp';
  else if (pnl * 100 <= -p.sl_percent) closeReason = 'sl';
  else if (elapsed >= p.max_hold_ms) closeReason = 'max_hold';

  if (closeReason) {
    stmts().closePosition.run({
      id: p.id,
      closedAt: nowMs(),
      status: `closed_${closeReason}`,
      pnl,
    });
    if (typeof onClose === 'function') {
      await onClose({ position: p, pnl, reason: closeReason, currentPriceUsd: now });
    }
  }

  return { pnl, currentPriceUsd: now, closeReason };
}

async function startMonitor({ onClose, onError } = {}) {
  if (running) return;
  running = true;
  stopRequested = false;
  log(`[positions] monitor started — every ${config.execution.positionCheckMs}ms`);

  while (!stopRequested) {
    try {
      const open = stmts().openPositions.all();
      for (const p of open) {
        await refreshPosition(p, onClose);
      }
      consecutiveFailures = 0;
    } catch (e) {
      consecutiveFailures += 1;
      warn(`[positions] monitor error #${consecutiveFailures}:`, e.message);
      if (consecutiveFailures === 3 && typeof onError === 'function') {
        await onError(e);
      }
    }
    await sleep(config.execution.positionCheckMs);
  }
  running = false;
}

function stopMonitor() {
  stopRequested = true;
}

module.exports = { startMonitor, stopMonitor, refreshPosition };

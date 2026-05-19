'use strict';

const config = require('./config');
const { init: initDb } = require('./db');
const { ensureDefaults } = require('./pipeline/strategies');
const { startPoller } = require('./signals/poller');
const { processBatch } = require('./pipeline/candidates');
const { startMonitor } = require('./pipeline/positionMonitor');
const { executeBuy } = require('./liveExecutor');
const tg = require('./telegram/bot');
const { formatCandidate } = require('./format');
const { log, err, warn } = require('./utils');

async function startApp() {
  initDb();
  ensureDefaults();
  tg.start();

  log(`[charon-base] mode=${config.execution.mode} router=${config.execution.router}`);
  log(`[charon-base] sources=${config.signals.sources.join(',')}`);

  // Position monitor
  startMonitor({
    onClose: async ({ position, pnl, reason, currentPriceUsd }) => {
      await tg.notify(
        `<b>Position closed</b> ${position.symbol} (${reason})\npnl: ${(pnl * 100).toFixed(2)}%  px: ${currentPriceUsd}`,
      );
    },
    onError: async (e) => {
      await tg.notify(`⚠ position monitor: ${e.message}`);
    },
  }).catch((e) => err('[monitor] crashed:', e));

  // Signal poller → pipeline
  startPoller(async (rawCandidates) => {
    if (rawCandidates.length === 0) return;
    try {
      const result = await processBatch(rawCandidates);
      if (!result || !result.pick) return;
      const { strategy, pick, llm } = result;

      await tg.notify(
        `<b>Pick</b> by <i>${strategy.name}</i>${llm ? ` (llm conf=${llm.confidence})` : ''}\n${formatCandidate(pick)}`,
      );

      const exec = await executeBuy({ candidate: pick, strategy, llm });
      if (exec.mode === 'confirm' && exec.intent) {
        await tg.notifyIntent(exec.intent);
      } else if (exec.mode === 'live') {
        await tg.notify(`✅ live BUY submitted ${pick.symbol}\ntx: ${exec.txHash}`);
      } else if (exec.mode === 'dry_run') {
        await tg.notify(`📝 dry_run position opened #${exec.positionId}`);
      }
    } catch (e) {
      warn('[pipeline] batch error:', e.message);
    }
  }).catch((e) => err('[poller] crashed:', e));

  process.on('SIGINT', () => {
    log('[charon-base] SIGINT, exiting');
    process.exit(0);
  });
}

module.exports = { startApp };

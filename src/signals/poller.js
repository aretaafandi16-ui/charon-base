'use strict';

const config = require('../config');
const { fetchAllSignals } = require('./sources');
const { stmts } = require('../db');
const { log, err, sleep, nowMs } = require('../utils');

let running = false;
let stopRequested = false;

async function runOnce(onCandidates) {
  const candidates = await fetchAllSignals();
  const ts = nowMs();
  const s = stmts();
  for (const c of candidates) {
    s.upsertCandidate.run({
      address: c.address,
      symbol: c.symbol || '',
      name: c.name || '',
      ts,
      payload: JSON.stringify(c),
    });
  }
  if (typeof onCandidates === 'function') await onCandidates(candidates);
  return candidates;
}

async function startPoller(onCandidates) {
  if (running) return;
  running = true;
  stopRequested = false;
  log(
    `[signals] polling every ${config.signals.pollMs}ms — sources: ${config.signals.sources.join(', ')}`,
  );
  while (!stopRequested) {
    try {
      await runOnce(onCandidates);
    } catch (e) {
      err('[signals] poll error:', e.message);
    }
    await sleep(config.signals.pollMs);
  }
  running = false;
}

function stopPoller() {
  stopRequested = true;
}

module.exports = { startPoller, stopPoller, runOnce };

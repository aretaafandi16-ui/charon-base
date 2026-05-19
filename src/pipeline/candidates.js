'use strict';

const config = require('../config');
const { stmts } = require('../db');
const { gateCandidate } = require('./filters');
const { getActiveStrategy, getStrategy } = require('./strategies');
const { pickCandidate } = require('./llm');
const { enrichCandidate } = require('../enrichment/tokenInfo');
const { nowMs, log } = require('../utils');

function _batchId() {
  return `b_${nowMs()}`;
}

async function processBatch(rawCandidates) {
  const strategyId = getActiveStrategy();
  const strategy = getStrategy(strategyId);
  if (!strategy) return null;

  const open = stmts().openPositions.all();
  if (open.length >= (strategy.max_concurrent_positions ?? 5)) {
    return { reason: 'max_positions_reached' };
  }

  const filtered = [];
  const s = stmts();
  for (const c of rawCandidates) {
    const enriched = await enrichCandidate(c);
    const { passed, reasons } = gateCandidate(enriched, strategy);
    s.insertFilterResult.run({
      address: enriched.address,
      strategyId,
      passed: passed ? 1 : 0,
      reason: reasons.join(',') || 'ok',
      ts: nowMs(),
    });
    if (passed) filtered.push(enriched);
  }

  if (filtered.length === 0) return { reason: 'no_candidates_passed' };

  const recent = filtered
    .sort((a, b) => (a.ageMinutes ?? 9e9) - (b.ageMinutes ?? 9e9))
    .slice(0, config.llm.pickCount);

  if (!strategy.use_llm) {
    return { strategy, pick: recent[0], llm: null };
  }

  const llm = await pickCandidate(recent);
  const batchId = _batchId();
  for (const c of recent) {
    s.insertLlmDecision.run({
      batchId,
      address: c.address,
      decision:
        llm?.decision === 'BUY' && llm.candidate?.address === c.address
          ? 'BUY'
          : 'NONE',
      confidence: llm?.confidence ?? null,
      reason: llm?.reason ?? null,
      ts: nowMs(),
    });
  }

  if (
    !llm ||
    llm.decision !== 'BUY' ||
    (llm.confidence ?? 0) < (strategy.llm_min_confidence ?? 0)
  ) {
    return { reason: 'llm_no_buy', llm };
  }

  log(`[pipeline] LLM picked ${llm.candidate.symbol} conf=${llm.confidence}`);
  return { strategy, pick: llm.candidate, llm };
}

module.exports = { processBatch };

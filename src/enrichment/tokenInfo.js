'use strict';

const { enrichFromDexscreener } = require('./dexscreener');
const { enrichFromGeckoterminal } = require('./geckoterminal');

async function enrichCandidate(c) {
  const [dex, gt] = await Promise.all([
    enrichFromDexscreener(c.address),
    enrichFromGeckoterminal(c.address),
  ]);
  const merged = { ...c };
  for (const src of [dex, gt]) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if ((merged[k] === undefined || merged[k] === null) && v != null) {
        merged[k] = v;
      }
    }
  }
  return merged;
}

module.exports = { enrichCandidate };

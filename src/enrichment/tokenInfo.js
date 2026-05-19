'use strict';

const { enrichFromDexscreener } = require('./dexscreener');
const { enrichFromGoplus } = require('./goplus');
const { enrichFromMoralis } = require('./moralis');
const { fetchCoinSocial } = require('./lunarcrush');

function mergeNonNull(target, src) {
  if (!src) return;
  for (const [k, v] of Object.entries(src)) {
    if ((target[k] === undefined || target[k] === null) && v != null) {
      target[k] = v;
    }
  }
}

async function enrichCandidate(c) {
  const [dex, gp, mr, lc] = await Promise.all([
    enrichFromDexscreener(c.address),
    enrichFromGoplus(c.address),
    enrichFromMoralis(c.address),
    c.symbol ? fetchCoinSocial(c.symbol) : Promise.resolve(null),
  ]);
  const merged = { ...c };
  mergeNonNull(merged, dex);
  mergeNonNull(merged, gp);
  mergeNonNull(merged, mr);
  mergeNonNull(merged, lc);
  // Always overwrite security flags from goplus when available.
  if (gp) {
    merged.security = {
      isHoneypot: gp.isHoneypot,
      buyTax: gp.buyTax,
      sellTax: gp.sellTax,
      isOpenSource: gp.isOpenSource,
      isProxy: gp.isProxy,
      isMintable: gp.isMintable,
      transferPausable: gp.transferPausable,
      blacklist: gp.blacklist,
      ownerAddress: gp.ownerAddress,
      creatorAddress: gp.creatorAddress,
    };
  }
  return merged;
}

module.exports = { enrichCandidate };

'use strict';

// Minimal Uniswap V3 SwapRouter02 helper.
// This is a stub: V3 quoting needs a Quoter contract or off-chain helper.
// For now we only expose a placeholder so router selection works.
// Live trading defaults to ROUTER=zeroex.

const config = require('../config');

async function buildBuyTx() {
  throw new Error(
    `Uniswap V3 router execution is not implemented in this scaffold. ` +
      `Set ROUTER=zeroex or extend src/execution/uniswap.js with a Quoter+SwapRouter02 flow. ` +
      `Configured router address: ${config.execution.uniswapRouter}`,
  );
}

module.exports = { buildBuyTx };

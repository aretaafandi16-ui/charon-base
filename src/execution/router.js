'use strict';

const config = require('../config');
const zeroex = require('./zeroex');
const uniswap = require('./uniswap');

async function quoteBuy({ tokenOut, amountWei, taker, slippageBps }) {
  if (config.execution.router === 'zeroex') {
    return zeroex.getQuote({
      tokenIn: 'ETH',
      tokenOut,
      amountWei,
      taker,
      slippageBps,
    });
  }
  if (config.execution.router === 'uniswap') {
    return uniswap.buildBuyTx({ tokenOut, amountWei, taker, slippageBps });
  }
  throw new Error(`Unknown router: ${config.execution.router}`);
}

module.exports = { quoteBuy };

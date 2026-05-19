'use strict';

const axios = require('axios');
const config = require('../config');
const { warn } = require('../utils');

const NATIVE = 'ETH';

function authHeaders() {
  const h = { '0x-version': 'v2' };
  if (config.execution.zeroexApiKey) {
    h['0x-api-key'] = config.execution.zeroexApiKey;
  }
  return h;
}

async function getQuote({ tokenIn, tokenOut, amountWei, taker, slippageBps }) {
  const params = new URLSearchParams({
    chainId: '8453',
    sellToken: tokenIn || NATIVE,
    buyToken: tokenOut,
    sellAmount: String(amountWei),
    taker: taker || '',
    slippageBps: String(slippageBps ?? config.execution.slippageBps),
  });
  try {
    const { data } = await axios.get(
      `${config.execution.zeroexBaseUrl}/swap/permit2/quote?${params.toString()}`,
      { timeout: 15_000, headers: authHeaders() },
    );
    return data;
  } catch (e) {
    warn('0x quote failed:', e.response?.data?.reason || e.message);
    throw e;
  }
}

module.exports = { getQuote };

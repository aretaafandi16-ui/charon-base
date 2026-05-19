'use strict';

const {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const config = require('./config');
const { quoteBuy } = require('./execution/router');
const { stmts } = require('./db');
const { log, warn, err, nowMs } = require('./utils');

let publicClient;
let walletClient;
let account;

function ensureClients() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: base,
      transport: http(config.rpc.httpUrl),
    });
  }
  if (config.execution.mode === 'live' || config.execution.mode === 'confirm') {
    if (!walletClient) {
      if (!config.wallet.privateKey) {
        throw new Error('EVM_PRIVATE_KEY required for live/confirm modes');
      }
      account = privateKeyToAccount(config.wallet.privateKey);
      walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(config.rpc.httpUrl),
      });
    }
  }
  return { publicClient, walletClient, account };
}

async function getEthBalance() {
  const { publicClient, account } = ensureClients();
  if (!account) return null;
  const wei = await publicClient.getBalance({ address: account.address });
  return Number(formatEther(wei));
}

async function executeBuy({ candidate, strategy, llm }) {
  const mode = config.execution.mode;
  const amountEth = strategy.buy_eth ?? config.execution.defaultBuyEth;
  const amountWei = parseEther(String(amountEth));

  if (mode === 'dry_run') {
    return openDryRunPosition({ candidate, strategy, llm, amountEth });
  }

  ensureClients();
  const balance = await getEthBalance();
  if (balance != null && balance - amountEth < config.wallet.minEthReserve) {
    throw new Error(
      `Insufficient ETH: balance ${balance} would fall below reserve ${config.wallet.minEthReserve}`,
    );
  }

  if (mode === 'confirm') {
    return queueIntent({ candidate, strategy, llm, amountEth });
  }

  if (mode === 'live') {
    return executeLiveBuy({ candidate, strategy, llm, amountEth, amountWei });
  }

  throw new Error(`Unknown trading mode: ${mode}`);
}

function openDryRunPosition({ candidate, strategy, llm, amountEth }) {
  const s = stmts();
  const entryPriceUsd = candidate.priceUsd || 0;
  const tokensBought = entryPriceUsd > 0 ? (amountEth * 3000) / entryPriceUsd : 0;
  const info = s.insertPosition.run({
    address: candidate.address,
    symbol: candidate.symbol || '',
    strategyId: strategy.name,
    mode: 'dry_run',
    amountEth,
    entryPriceUsd,
    tokensBought,
    openedAt: nowMs(),
    tpPercent: strategy.tp_percent,
    slPercent: strategy.sl_percent,
    trailingTpPercent: strategy.trailing_tp_percent,
    maxHoldMs: strategy.max_hold_ms,
    partialTp: strategy.partial_tp ? 1 : 0,
    txHash: null,
  });
  log(`[exec] dry_run BUY ${candidate.symbol} ${amountEth} ETH (id=${info.lastInsertRowid})`);
  return { mode: 'dry_run', positionId: info.lastInsertRowid };
}

function queueIntent({ candidate, strategy, llm, amountEth }) {
  const s = stmts();
  const info = s.insertIntent.run({
    address: candidate.address,
    symbol: candidate.symbol || '',
    strategyId: strategy.name,
    router: config.execution.router,
    mode: 'confirm',
    amountEth,
    slippageBps: config.execution.slippageBps,
    llmConfidence: llm?.confidence ?? null,
    createdAt: nowMs(),
  });
  log(`[exec] confirm intent queued id=${info.lastInsertRowid}`);
  return {
    mode: 'confirm',
    intentId: info.lastInsertRowid,
    intent: {
      id: info.lastInsertRowid,
      address: candidate.address,
      symbol: candidate.symbol,
      strategyId: strategy.name,
      router: config.execution.router,
      mode: 'confirm',
      amountEth,
      slippageBps: config.execution.slippageBps,
      llmConfidence: llm?.confidence ?? null,
    },
  };
}

async function executeLiveBuy({ candidate, strategy, llm, amountEth, amountWei }) {
  const { walletClient, account } = ensureClients();
  const quote = await quoteBuy({
    tokenOut: candidate.address,
    amountWei,
    taker: account.address,
    slippageBps: config.execution.slippageBps,
  });

  if (!quote?.transaction) {
    throw new Error('0x quote returned no transaction');
  }

  const tx = quote.transaction;
  const hash = await walletClient.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value || amountWei),
    gas: tx.gas ? BigInt(tx.gas) : undefined,
  });
  log(`[exec] live BUY submitted ${candidate.symbol} tx=${hash}`);

  const s = stmts();
  const info = s.insertPosition.run({
    address: candidate.address,
    symbol: candidate.symbol || '',
    strategyId: strategy.name,
    mode: 'live',
    amountEth,
    entryPriceUsd: candidate.priceUsd || 0,
    tokensBought: 0,
    openedAt: nowMs(),
    tpPercent: strategy.tp_percent,
    slPercent: strategy.sl_percent,
    trailingTpPercent: strategy.trailing_tp_percent,
    maxHoldMs: strategy.max_hold_ms,
    partialTp: strategy.partial_tp ? 1 : 0,
    txHash: hash,
  });
  return { mode: 'live', positionId: info.lastInsertRowid, txHash: hash };
}

async function resolveIntent(intentId, action) {
  const s = stmts();
  const intent = s.getIntent.get(intentId);
  if (!intent) throw new Error(`Intent ${intentId} not found`);
  if (intent.status !== 'pending') {
    return { intent, alreadyResolved: true };
  }

  if (action === 'reject') {
    s.setIntentStatus.run({
      id: intent.id,
      status: 'rejected',
      resolvedAt: nowMs(),
    });
    return { intent, action: 'rejected' };
  }

  if (action === 'approve') {
    try {
      const result = await executeLiveBuy({
        candidate: { address: intent.address, symbol: intent.symbol, priceUsd: 0 },
        strategy: {
          name: intent.strategy_id,
          tp_percent: 75,
          sl_percent: 35,
          trailing_tp_percent: 25,
          max_hold_ms: 6 * 60 * 60 * 1000,
          partial_tp: 0,
        },
        llm: { confidence: intent.llm_confidence },
        amountEth: intent.amount_eth,
        amountWei: parseEther(String(intent.amount_eth)),
      });
      s.setIntentStatus.run({
        id: intent.id,
        status: 'executed',
        resolvedAt: nowMs(),
      });
      return { intent, action: 'executed', result };
    } catch (e) {
      err('[exec] confirm execution failed:', e.message);
      s.setIntentStatus.run({
        id: intent.id,
        status: 'failed',
        resolvedAt: nowMs(),
      });
      throw e;
    }
  }

  throw new Error(`Unknown action: ${action}`);
}

module.exports = { executeBuy, getEthBalance, resolveIntent, ensureClients };

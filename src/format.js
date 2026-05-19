'use strict';

const { shorten, fmtUsd, pct } = require('./utils');

const escape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function formatCandidate(c) {
  const sec = c.security || {};
  const lines = [
    `<b>${escape(c.symbol || c.name || 'token')}</b>  <code>${escape(shorten(c.address))}</code>`,
    `chain: base`,
    `mc: ${fmtUsd(c.marketCap)}  liq: ${fmtUsd(c.liquidityUsd)}  vol24h: ${fmtUsd(c.volume24h)}`,
    `holders: ${c.holders ?? '—'}  age: ${c.ageMinutes ?? '—'}m`,
    `priceChange1h: ${pct(c.priceChange1h)}  6h: ${pct(c.priceChange6h)}  24h: ${pct(c.priceChange24h)}`,
    `tax buy/sell: ${sec.buyTax ?? '—'}/${sec.sellTax ?? '—'}  honeypot: ${sec.isHoneypot === true ? 'YES' : sec.isHoneypot === false ? 'no' : '—'}`,
    `sources: ${(c.sources || []).join(', ') || '—'}`,
  ];
  if (c.dexUrl) lines.push(`url: ${escape(c.dexUrl)}`);
  return lines.join('\n');
}

function formatPosition(p) {
  return [
    `<b>${escape(p.symbol)}</b>  <code>${escape(shorten(p.address))}</code>`,
    `entry: ${fmtUsd(p.entryPriceUsd)}  now: ${fmtUsd(p.currentPriceUsd)}`,
    `pnl: ${pct(p.pnl)}  size: ${p.amountEth} ETH`,
    `tp: ${pct(p.tpPercent / 100)}  sl: ${pct(p.slPercent / 100)}`,
  ].join('\n');
}

function formatTradeIntent(intent) {
  return [
    `<b>Trade intent</b> #${intent.id}`,
    `${escape(intent.symbol)}  <code>${escape(shorten(intent.address))}</code>`,
    `mode: ${intent.mode}  router: ${intent.router}`,
    `size: ${intent.amountEth} ETH  slippage: ${intent.slippageBps / 100}%`,
    `strategy: ${intent.strategyId}  llm_conf: ${intent.llmConfidence ?? '—'}`,
  ].join('\n');
}

module.exports = { escape, formatCandidate, formatPosition, formatTradeIntent };

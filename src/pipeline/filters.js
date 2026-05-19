'use strict';

function gateCandidate(candidate, strategy) {
  const reasons = [];
  const c = candidate;
  const s = strategy;
  const sec = c.security || {};

  if ((c.sources?.length || 0) < (s.min_sources ?? 1)) {
    reasons.push(`sources<${s.min_sources}`);
  }
  if (s.min_liquidity_usd != null && (c.liquidityUsd ?? 0) < s.min_liquidity_usd) {
    reasons.push(`liq<${s.min_liquidity_usd}`);
  }
  if (s.min_volume_24h_usd != null && (c.volume24h ?? 0) < s.min_volume_24h_usd) {
    reasons.push(`vol24h<${s.min_volume_24h_usd}`);
  }
  if (s.max_age_minutes != null && c.ageMinutes != null && c.ageMinutes > s.max_age_minutes) {
    reasons.push(`age>${s.max_age_minutes}m`);
  }
  if (s.min_marketcap_usd != null && (c.marketCap ?? c.fdv ?? 0) < s.min_marketcap_usd) {
    reasons.push(`mc<${s.min_marketcap_usd}`);
  }
  if (s.max_marketcap_usd != null && (c.marketCap ?? c.fdv ?? Infinity) > s.max_marketcap_usd) {
    reasons.push(`mc>${s.max_marketcap_usd}`);
  }
  if (s.min_holders != null && c.holders != null && c.holders > 0 && c.holders < s.min_holders) {
    reasons.push(`holders<${s.min_holders}`);
  }
  if (s.min_price_change_1h != null && c.priceChange1h != null &&
      c.priceChange1h < s.min_price_change_1h) {
    reasons.push(`1h<${s.min_price_change_1h}`);
  }
  if (s.max_price_change_24h != null && c.priceChange24h != null &&
      c.priceChange24h > s.max_price_change_24h) {
    reasons.push(`24h>${s.max_price_change_24h}`);
  }
  // Security gates (GoPlus)
  if (s.block_honeypot && sec.isHoneypot === true) {
    reasons.push('honeypot');
  }
  if (s.max_buy_tax_pct != null && sec.buyTax != null && sec.buyTax > s.max_buy_tax_pct) {
    reasons.push(`buy_tax>${s.max_buy_tax_pct}`);
  }
  if (s.max_sell_tax_pct != null && sec.sellTax != null && sec.sellTax > s.max_sell_tax_pct) {
    reasons.push(`sell_tax>${s.max_sell_tax_pct}`);
  }
  if (s.require_open_source && sec.isOpenSource === false) {
    reasons.push('not_open_source');
  }
  if (s.block_pausable && sec.transferPausable === true) {
    reasons.push('transfer_pausable');
  }

  return { passed: reasons.length === 0, reasons };
}

module.exports = { gateCandidate };

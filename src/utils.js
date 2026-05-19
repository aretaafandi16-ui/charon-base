'use strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const nowMs = () => Date.now();

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const shorten = (addr, n = 4) =>
  !addr ? '' : `${addr.slice(0, 2 + n)}…${addr.slice(-n)}`;

const pct = (num, dp = 2) =>
  num === undefined || num === null || Number.isNaN(num)
    ? '—'
    : `${(num * 100).toFixed(dp)}%`;

const fmtUsd = (n) => {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${Number(n).toFixed(2)}`;
};

const log = (...args) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
};

const warn = (...args) => {
  const ts = new Date().toISOString();
  console.warn(`[${ts}]`, ...args);
};

const err = (...args) => {
  const ts = new Date().toISOString();
  console.error(`[${ts}]`, ...args);
};

module.exports = { sleep, safeJson, nowMs, clamp, shorten, pct, fmtUsd, log, warn, err };

'use strict';

const { stmts, get } = require('../db');
const { nowMs } = require('../utils');

function summarizeWindow(windowMs) {
  const db = get();
  const since = nowMs() - windowMs;
  const closed = db
    .prepare(
      `SELECT * FROM positions WHERE closed_at IS NOT NULL AND closed_at >= ?`,
    )
    .all(since);
  const total = closed.length;
  const wins = closed.filter((p) => (p.pnl ?? 0) > 0).length;
  const avgPnl =
    total > 0 ? closed.reduce((s, p) => s + (p.pnl || 0), 0) / total : 0;
  const summary = {
    total,
    wins,
    winRate: total ? wins / total : 0,
    avgPnl,
    byStrategy: {},
  };
  for (const p of closed) {
    const k = p.strategy_id;
    if (!summary.byStrategy[k]) summary.byStrategy[k] = { total: 0, wins: 0, sumPnl: 0 };
    summary.byStrategy[k].total += 1;
    if ((p.pnl ?? 0) > 0) summary.byStrategy[k].wins += 1;
    summary.byStrategy[k].sumPnl += p.pnl || 0;
  }
  return summary;
}

function recordLesson(windowLabel, summary) {
  stmts().insertLesson.run({
    window: windowLabel,
    summary: JSON.stringify(summary),
    ts: nowMs(),
  });
}

function listLessons(limit = 10) {
  return stmts().listLessons.all(limit).map((row) => ({
    id: row.id,
    window: row.window,
    summary: JSON.parse(row.summary),
    createdAt: row.created_at,
  }));
}

module.exports = { summarizeWindow, recordLesson, listLessons };

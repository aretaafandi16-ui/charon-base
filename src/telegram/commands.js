'use strict';

const { stmts, get } = require('../db');
const {
  listStrategies,
  getActiveStrategy,
  setActiveStrategy,
  setStrategyKey,
  getStrategy,
} = require('../pipeline/strategies');
const { resolveIntent } = require('../liveExecutor');
const { summarizeWindow, listLessons, recordLesson } = require('../learning/lessons');
const { formatCandidate, formatPosition } = require('../format');
const { mainMenuKeyboard, strategyKeyboard, intentKeyboard } = require('./menu');
const { nowMs, fmtUsd, pct } = require('../utils');

function sendableErr(e) {
  return `⚠ ${e.message}`;
}

async function handleCommand(bot, chatId, msg) {
  const text = (msg.text || '').trim();
  const [cmd, ...args] = text.split(/\s+/);

  switch (cmd) {
    case '/start':
    case '/menu':
      await bot.sendMessage(chatId, '<b>Charon-Base</b>\nWhat would you like to inspect?', {
        parse_mode: 'HTML',
        reply_markup: mainMenuKeyboard(),
      });
      return;

    case '/strategy': {
      if (args[0]) {
        try {
          const id = setActiveStrategy(args[0]);
          await bot.sendMessage(chatId, `Active strategy → <b>${id}</b>`, { parse_mode: 'HTML' });
        } catch (e) {
          await bot.sendMessage(chatId, sendableErr(e));
        }
        return;
      }
      const active = getActiveStrategy();
      const lines = listStrategies().map(
        (s) => `${s.id === active ? '✅' : '•'} <b>${s.id}</b> use_llm=${s.config.use_llm} buy=${s.config.buy_eth}ETH`,
      );
      await bot.sendMessage(chatId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: strategyKeyboard(),
      });
      return;
    }

    case '/stratset': {
      const [id, key, ...rest] = args;
      const value = rest.join(' ');
      if (!id || !key || !value) {
        await bot.sendMessage(chatId, 'Usage: /stratset <strategy_id> <key> <value>');
        return;
      }
      try {
        const cfg = setStrategyKey(id, key, value);
        await bot.sendMessage(
          chatId,
          `<b>${id}</b>.${key} = ${cfg[key]}`,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        await bot.sendMessage(chatId, sendableErr(e));
      }
      return;
    }

    case '/positions': {
      const open = stmts().openPositions.all();
      if (open.length === 0) {
        await bot.sendMessage(chatId, 'No open positions.');
        return;
      }
      const lines = open
        .map((p) =>
          formatPosition({
            symbol: p.symbol,
            address: p.address,
            entryPriceUsd: p.entry_price_usd,
            currentPriceUsd: p.entry_price_usd,
            pnl: 0,
            amountEth: p.amount_eth,
            tpPercent: p.tp_percent,
            slPercent: p.sl_percent,
          }),
        )
        .join('\n\n');
      await bot.sendMessage(chatId, lines, { parse_mode: 'HTML' });
      return;
    }

    case '/candidate': {
      const addr = (args[0] || '').toLowerCase();
      if (!addr) {
        await bot.sendMessage(chatId, 'Usage: /candidate <token_address>');
        return;
      }
      const row = stmts().getCandidate.get(addr);
      if (!row) {
        await bot.sendMessage(chatId, 'Candidate not found in cache.');
        return;
      }
      const c = JSON.parse(row.payload);
      await bot.sendMessage(chatId, formatCandidate(c), { parse_mode: 'HTML' });
      return;
    }

    case '/filters': {
      const id = getActiveStrategy();
      const cfg = getStrategy(id);
      const lines = Object.entries(cfg).map(([k, v]) => `${k}: ${v}`);
      await bot.sendMessage(
        chatId,
        `<b>Active filters: ${id}</b>\n${lines.join('\n')}`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    case '/pnl': {
      const sum = summarizeWindow(7 * 24 * 60 * 60 * 1000);
      await bot.sendMessage(
        chatId,
        [
          `<b>PnL — last 7d</b>`,
          `total: ${sum.total}  wins: ${sum.wins}  winRate: ${pct(sum.winRate)}`,
          `avgPnl: ${pct(sum.avgPnl)}`,
          ...Object.entries(sum.byStrategy).map(
            ([k, v]) => `• ${k}: ${v.total} trades, ${v.wins} wins, sumPnl=${pct(v.sumPnl)}`,
          ),
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      return;
    }

    case '/learn': {
      const window = args[0] || '24h';
      const ms = window === '7d' ? 7 * 86400_000 : window === '24h' ? 86400_000 : 3600_000;
      const sum = summarizeWindow(ms);
      recordLesson(window, sum);
      await bot.sendMessage(
        chatId,
        `Recorded lesson for window=${window}: total=${sum.total}, winRate=${pct(sum.winRate)}`,
      );
      return;
    }

    case '/lessons': {
      const items = listLessons(5);
      if (items.length === 0) {
        await bot.sendMessage(chatId, 'No lessons yet. Run /learn first.');
        return;
      }
      const lines = items.map(
        (l) =>
          `#${l.id} ${l.window} — total=${l.summary.total} winRate=${pct(l.summary.winRate)} avgPnl=${pct(l.summary.avgPnl)}`,
      );
      await bot.sendMessage(chatId, lines.join('\n'));
      return;
    }

    case '/walletadd': {
      const [label, address] = args;
      if (!label || !address) {
        await bot.sendMessage(chatId, 'Usage: /walletadd <label> <address>');
        return;
      }
      stmts().upsertWallet.run({ label, address: address.toLowerCase(), ts: nowMs() });
      await bot.sendMessage(chatId, `Saved wallet ${label} → ${address}`);
      return;
    }

    case '/walletremove': {
      const [label] = args;
      if (!label) {
        await bot.sendMessage(chatId, 'Usage: /walletremove <label>');
        return;
      }
      stmts().removeWallet.run(label);
      await bot.sendMessage(chatId, `Removed wallet ${label}`);
      return;
    }

    case '/wallets': {
      const rows = stmts().listWallets.all();
      if (rows.length === 0) {
        await bot.sendMessage(chatId, 'No saved wallets.');
        return;
      }
      const lines = rows.map((r) => `• ${r.label} → <code>${r.address}</code>`);
      await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    default:
      // ignore unknown
  }
}

async function handleCallback(bot, query) {
  const data = query.data || '';
  const chatId = query.message?.chat?.id;
  if (!chatId) return;

  if (data === 'menu:strategy') {
    await bot.sendMessage(chatId, 'Pick a strategy:', {
      reply_markup: strategyKeyboard(),
    });
  } else if (data.startsWith('strategy:set:')) {
    const id = data.split(':')[2];
    try {
      setActiveStrategy(id);
      await bot.sendMessage(chatId, `Active strategy → <b>${id}</b>`, {
        parse_mode: 'HTML',
      });
    } catch (e) {
      await bot.sendMessage(chatId, sendableErr(e));
    }
  } else if (data.startsWith('intent:')) {
    const [, action, idStr] = data.split(':');
    const id = Number(idStr);
    try {
      const result = await resolveIntent(id, action);
      await bot.sendMessage(
        chatId,
        result.alreadyResolved
          ? `Intent ${id} already resolved.`
          : `Intent ${id} → ${result.action}${result.result?.txHash ? `\ntx: ${result.result.txHash}` : ''}`,
      );
    } catch (e) {
      await bot.sendMessage(chatId, sendableErr(e));
    }
  } else if (data === 'menu:positions') {
    await handleCommand(bot, chatId, { text: '/positions' });
  } else if (data === 'menu:lessons') {
    await handleCommand(bot, chatId, { text: '/lessons' });
  } else if (data === 'menu:filters') {
    await handleCommand(bot, chatId, { text: '/filters' });
  }
  await bot.answerCallbackQuery(query.id).catch(() => {});
}

module.exports = { handleCommand, handleCallback, intentKeyboard };

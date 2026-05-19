'use strict';

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { handleCommand, handleCallback, intentKeyboard } = require('./commands');
const { formatTradeIntent } = require('../format');
const { log, warn } = require('../utils');

let bot;

const COMMAND_LIST = [
  { command: 'menu', description: 'Open the main menu' },
  { command: 'strategy', description: 'List or pick active strategy' },
  { command: 'stratset', description: 'Set a strategy parameter' },
  { command: 'positions', description: 'Show open positions' },
  { command: 'candidate', description: 'Inspect a token by address' },
  { command: 'filters', description: 'Show filters of active strategy' },
  { command: 'pnl', description: 'Show 7-day PnL summary' },
  { command: 'learn', description: 'Record a lesson over a window' },
  { command: 'lessons', description: 'Show recent lessons' },
  { command: 'walletadd', description: 'Save a wallet to watch' },
  { command: 'walletremove', description: 'Remove a saved wallet' },
  { command: 'wallets', description: 'List saved wallets' },
];

async function registerCommands(b) {
  try {
    await b.setMyCommands(COMMAND_LIST, {
      scope: { type: 'default' },
    });
    log('[telegram] commands registered');
  } catch (e) {
    warn('[telegram] setMyCommands failed:', e.message);
  }
}

function start() {
  if (bot) return bot;
  if (!config.telegram.token) {
    warn('[telegram] TELEGRAM_BOT_TOKEN missing — bot disabled');
    return null;
  }
  bot = new TelegramBot(config.telegram.token, { polling: true });

  bot.on('message', async (msg) => {
    try {
      if (String(msg.chat.id) !== String(config.telegram.chatId)) return;
      await handleCommand(bot, msg.chat.id, msg);
    } catch (e) {
      warn('[telegram] message handler error:', e.message);
    }
  });

  bot.on('callback_query', async (q) => {
    try {
      if (String(q.message?.chat?.id) !== String(config.telegram.chatId)) return;
      await handleCallback(bot, q);
    } catch (e) {
      warn('[telegram] callback handler error:', e.message);
    }
  });

  registerCommands(bot);

  log('[telegram] bot started');
  return bot;
}

async function notify(text, opts = {}) {
  if (!bot || !config.telegram.chatId) return;
  try {
    await bot.sendMessage(config.telegram.chatId, text, {
      parse_mode: 'HTML',
      ...opts,
    });
  } catch (e) {
    warn('[telegram] notify failed:', e.message);
  }
}

async function notifyIntent(intent) {
  return notify(formatTradeIntent(intent), {
    reply_markup: intentKeyboard(intent.id),
  });
}

module.exports = { start, notify, notifyIntent };

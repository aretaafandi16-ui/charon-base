'use strict';

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { handleCommand, handleCallback, intentKeyboard } = require('./commands');
const { formatTradeIntent } = require('../format');
const { log, warn } = require('../utils');

let bot;

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

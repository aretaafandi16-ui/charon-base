'use strict';

const {
  listStrategies,
  getActiveStrategy,
  setActiveStrategy,
} = require('../pipeline/strategies');

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📡 Strategy', callback_data: 'menu:strategy' }],
      [{ text: '📈 Positions', callback_data: 'menu:positions' }],
      [{ text: '🔥 Trending', callback_data: 'menu:trending' }],
      [{ text: '🤖 Model', callback_data: 'menu:model' }],
      [{ text: '🧠 Lessons', callback_data: 'menu:lessons' }],
      [{ text: '⚙ Filters', callback_data: 'menu:filters' }],
    ],
  };
}

function strategyKeyboard() {
  const active = getActiveStrategy();
  const strategies = listStrategies();
  return {
    inline_keyboard: strategies.map((s) => [
      {
        text: `${s.id === active ? '✅ ' : ''}${s.id}`,
        callback_data: `strategy:set:${s.id}`,
      },
    ]),
  };
}

function intentKeyboard(intentId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `intent:approve:${intentId}` },
        { text: '❌ Reject', callback_data: `intent:reject:${intentId}` },
      ],
    ],
  };
}

const MODEL_OPTIONS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'claude-sonnet-4-20250514',
];

function modelKeyboard() {
  return {
    inline_keyboard: MODEL_OPTIONS.map((m) => [
      { text: m, callback_data: `model:set:${m}` },
    ]),
  };
}

module.exports = {
  mainMenuKeyboard,
  strategyKeyboard,
  intentKeyboard,
  modelKeyboard,
  setActiveStrategy,
};

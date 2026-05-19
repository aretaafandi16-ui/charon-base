'use strict';

// Always let .env win over inherited shell env. Otherwise stale shell
// exports (TELEGRAM_BOT_TOKEN, LLM_API_KEY, etc.) silently override the
// project's intended config and produce confusing 401/404 errors.
require('dotenv').config({ override: true });

const { startApp } = require('./src/app');

startApp().catch((err) => {
  console.error('[charon-base] fatal:', err);
  process.exit(1);
});

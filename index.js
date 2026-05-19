'use strict';

require('dotenv').config();

const { startApp } = require('./src/app');

startApp().catch((err) => {
  console.error('[charon-base] fatal:', err);
  process.exit(1);
});

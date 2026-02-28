#!/usr/bin/env node
'use strict';

const cli = require('../lib/cli');
cli(process.argv.slice(2)).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});

'use strict';

const fs = require('fs');
const path = require('path');

const ANTHROPIC_KEYS = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
]);

function reset() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');

  if (!fs.existsSync(envPath)) {
    console.log('No .env file found. Nothing to reset.');
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');

  const filtered = lines.filter(line => {
    const match = line.match(/^([A-Z_]+)=/);
    if (match && ANTHROPIC_KEYS.has(match[1])) return false;
    return true;
  });

  // Remove trailing blank lines left behind
  while (filtered.length > 0 && filtered[filtered.length - 1] === '') {
    filtered.pop();
  }

  if (filtered.length === 0) {
    fs.unlinkSync(envPath);
    console.log('All variables removed. Deleted empty .env file.');
  } else {
    fs.writeFileSync(envPath, filtered.join('\n') + '\n');
    console.log('Removed ANTHROPIC variables from .env.');
  }
}

module.exports = reset;

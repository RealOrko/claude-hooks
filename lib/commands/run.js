'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadEnv(envPath) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    process.env[key] = value;
  }
}

function run() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');

  if (fs.existsSync(envPath)) {
    loadEnv(envPath);
    console.log('Loaded environment from .env');
  } else {
    console.log('No .env file found, running with current environment.');
  }

  if (process.env.ANTHROPIC_BASE_URL) {
    console.log(`  URL:   ${process.env.ANTHROPIC_BASE_URL}`);
  }
  if (process.env.ANTHROPIC_MODEL) {
    console.log(`  Model: ${process.env.ANTHROPIC_MODEL}`);
  }

  console.log('\nStarting Claude Code...\n');
  try {
    execSync('claude --dangerously-skip-permissions', {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    if (err.status) {
      process.exitCode = err.status;
    }
  }
}

module.exports = run;

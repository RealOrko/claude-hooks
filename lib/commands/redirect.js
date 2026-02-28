'use strict';

const fs = require('fs');
const path = require('path');

const ANTHROPIC_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
];

const DEFAULT_URL = 'http://localhost:8000';
const DEFAULT_MODEL = 'redirected-model';
const DEFAULT_TOKEN = 'none';

function parseEnv(content) {
  const lines = content.split('\n');
  return lines;
}

function buildEnvVars(url, token, model) {
  return {
    ANTHROPIC_BASE_URL: url,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
  };
}

function updateEnvFile(envPath, vars) {
  let lines = [];
  if (fs.existsSync(envPath)) {
    lines = parseEnv(fs.readFileSync(envPath, 'utf8'));
  }

  const updated = new Set();

  // Update existing lines in place
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([A-Z_]+)=/);
    if (match && vars[match[1]] !== undefined) {
      lines[i] = `${match[1]}=${vars[match[1]]}`;
      updated.add(match[1]);
    }
  }

  // Append any vars that weren't already in the file
  const toAppend = Object.entries(vars).filter(([key]) => !updated.has(key));
  if (toAppend.length > 0) {
    // Add a blank line separator if file doesn't end with one
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }
    for (const [key, value] of toAppend) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, lines.join('\n') + '\n');
}

function ensureGitignore(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  let content = '';

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n').map(l => l.trim());
    if (lines.includes('.env')) return;
  }

  // Append .env entry
  if (content.length > 0 && !content.endsWith('\n')) {
    content += '\n';
  }
  content += '.env\n';
  fs.writeFileSync(gitignorePath, content);
}

function redirect(url, token, model) {
  const resolvedUrl = url || DEFAULT_URL;
  const resolvedToken = token || DEFAULT_TOKEN;
  const resolvedModel = model || DEFAULT_MODEL;

  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');

  // 1. Write/update .env
  const vars = buildEnvVars(resolvedUrl, resolvedToken, resolvedModel);
  updateEnvFile(envPath, vars);

  // 2. Ensure .gitignore covers .env
  ensureGitignore(cwd);

  console.log('\nRedirect configured:');
  console.log(`  URL:   ${resolvedUrl}`);
  console.log(`  Model: ${resolvedModel}`);
  console.log(`  Token: ${resolvedToken}`);
  console.log(`\nEnvironment written to ${envPath}`);
  console.log('Run "chx --run" to start Claude Code with these settings.');
}

module.exports = redirect;

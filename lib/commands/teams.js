'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEAMS_KEY = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';

function ensureGitignore(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  let content = '';

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n').map(l => l.trim());
    if (lines.includes('.env')) return;
  }

  if (content.length > 0 && !content.endsWith('\n')) {
    content += '\n';
  }
  content += '.env\n';
  fs.writeFileSync(gitignorePath, content);
}

function updateClaudeSettings(enable) {
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }

  if (enable) {
    settings.enableTeams = true;
  } else {
    delete settings.enableTeams;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`${enable ? 'Set' : 'Removed'} enableTeams in ${settingsPath}`);
}

function enableTeams() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');

  let lines = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, 'utf8').split('\n');
  }

  // Check if already set
  const existing = lines.findIndex(l => l.match(new RegExp(`^${TEAMS_KEY}=`)));
  if (existing !== -1) {
    lines[existing] = `${TEAMS_KEY}=1`;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push(`${TEAMS_KEY}=1`);
  }

  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  ensureGitignore(cwd);

  updateClaudeSettings(true);

  console.log(`\nAgent teams enabled: ${TEAMS_KEY}=1`);
  console.log(`Written to ${envPath}`);
  console.log('Run "chx --run" to start Claude Code with these settings.');
}

function disableTeams() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');

  if (!fs.existsSync(envPath)) {
    console.log('No .env file found. Nothing to remove.');
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const filtered = lines.filter(l => !l.match(new RegExp(`^${TEAMS_KEY}=`)));

  // Remove trailing blank lines
  while (filtered.length > 0 && filtered[filtered.length - 1] === '') {
    filtered.pop();
  }

  if (filtered.length === 0) {
    fs.unlinkSync(envPath);
    console.log(`Removed ${TEAMS_KEY}. Deleted empty .env file.`);
  } else {
    fs.writeFileSync(envPath, filtered.join('\n') + '\n');
    console.log(`Removed ${TEAMS_KEY} from .env.`);
  }

  updateClaudeSettings(false);
}

module.exports = { enableTeams, disableTeams };

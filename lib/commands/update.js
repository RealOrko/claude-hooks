'use strict';

const { execSync } = require('child_process');
const path = require('path');

function update() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  console.log(`Updating claude-hooks in ${repoRoot}...`);
  execSync('git pull', { cwd: repoRoot, stdio: 'inherit' });
}

module.exports = update;

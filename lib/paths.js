'use strict';

const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function getSourceModuleDir(name) {
  return path.join(repoRoot, 'modules', name);
}

function getTargetBaseDir() {
  return path.join(process.cwd(), '.claude', 'claude-hooks');
}

function getTargetModuleDir(name) {
  return path.join(getTargetBaseDir(), name);
}

function getSettingsLocalPath() {
  return path.join(process.cwd(), '.claude', 'settings.local.json');
}

module.exports = {
  getSourceModuleDir,
  getTargetBaseDir,
  getTargetModuleDir,
  getSettingsLocalPath,
};

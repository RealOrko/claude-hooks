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

function getSettingsPath() {
  return path.join(process.cwd(), '.claude', 'settings.json');
}

function getMcpConfigPath() {
  return path.join(process.cwd(), '.mcp.json');
}

module.exports = {
  getSourceModuleDir,
  getTargetBaseDir,
  getTargetModuleDir,
  getSettingsPath,
  getMcpConfigPath,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { getTargetModuleDir, getTargetBaseDir } = require('../paths');
const { removeModuleSettings } = require('../settings');

function uninstall(moduleName) {
  const targetDir = getTargetModuleDir(moduleName);
  const baseDir = getTargetBaseDir();

  // 1. Validate module is installed
  if (!fs.existsSync(targetDir)) {
    console.error(`Module "${moduleName}" is not installed.`);
    process.exitCode = 1;
    return;
  }

  // 2. Read module's settings.json
  let moduleSettings = {};
  try {
    const settingsPath = path.join(targetDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      moduleSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch {}

  // 3. Remove matching entries from settings.local.json
  removeModuleSettings(moduleName, moduleSettings);

  // 4. Delete module files except data/
  const dataDir = path.join(targetDir, 'data');
  const hasData = fs.existsSync(dataDir);

  if (hasData) {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'data') continue;
      const fullPath = path.join(targetDir, entry.name);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  } else {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // 5. Clean up base dir if empty
  if (fs.existsSync(baseDir)) {
    const remaining = fs.readdirSync(baseDir);
    if (remaining.length === 0) {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  }

  // 6. Print success
  console.log(`Uninstalled ${moduleName} successfully.`);
  if (hasData) {
    console.log(`Note: data/ directory preserved at ${dataDir}`);
    console.log('Delete it manually if no longer needed.');
  }
  console.log('Restart Claude Code for changes to take effect.');
}

module.exports = uninstall;

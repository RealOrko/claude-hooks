'use strict';

const fs = require('fs');
const path = require('path');
const { getTargetModuleDir } = require('../paths');

function list() {
  const modulesDir = path.resolve(__dirname, '..', '..', 'modules');

  let entries;
  try {
    entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  } catch {
    console.error('Could not read modules directory.');
    process.exitCode = 1;
    return;
  }

  const dirs = entries.filter(e => e.isDirectory());

  if (dirs.length === 0) {
    console.log('No modules found.');
    return;
  }

  const installed = [];
  const available = [];

  for (const dir of dirs) {
    const versionFile = path.join(modulesDir, dir.name, 'version.json');
    let mod;
    try {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      mod = {
        name: data.Name || dir.name,
        version: data.Version || 'unknown',
        description: data.Description || '',
      };
    } catch {
      mod = {
        name: dir.name,
        version: 'unknown',
        description: '(no version.json found)',
      };
    }

    const targetDir = getTargetModuleDir(dir.name);
    if (fs.existsSync(targetDir)) {
      installed.push(mod);
    } else {
      available.push(mod);
    }
  }

  const all = [...installed, ...available];
  const nameWidth = Math.max(...all.map(m => m.name.length));
  const versionWidth = Math.max(...all.map(m => m.version.length));

  function printModules(mods) {
    for (const mod of mods) {
      const name = mod.name.padEnd(nameWidth);
      const ver = `v${mod.version}`.padEnd(versionWidth + 1);
      console.log(`  ${name}  ${ver}  ${mod.description}`);
    }
  }

  if (installed.length > 0) {
    console.log('\nInstalled modules:\n');
    printModules(installed);
  }

  if (available.length > 0) {
    console.log('\nAvailable modules:\n');
    printModules(available);
  }

  if (installed.length === 0 && available.length === 0) {
    console.log('No modules found.');
  }

  console.log();
}

module.exports = list;

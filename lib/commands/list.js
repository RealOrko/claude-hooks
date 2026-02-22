'use strict';

const fs = require('fs');
const path = require('path');

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

  const modules = [];
  for (const dir of dirs) {
    const versionFile = path.join(modulesDir, dir.name, 'version.json');
    try {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      modules.push({
        name: data.Name || dir.name,
        version: data.Version || 'unknown',
        description: data.Description || '',
      });
    } catch {
      modules.push({
        name: dir.name,
        version: 'unknown',
        description: '(no version.json found)',
      });
    }
  }

  const nameWidth = Math.max(...modules.map(m => m.name.length));
  const versionWidth = Math.max(...modules.map(m => m.version.length));

  console.log('\nAvailable modules:\n');
  for (const mod of modules) {
    const name = mod.name.padEnd(nameWidth);
    const ver = `v${mod.version}`.padEnd(versionWidth + 1);
    console.log(`  ${name}  ${ver}  ${mod.description}`);
  }
  console.log();
}

module.exports = list;

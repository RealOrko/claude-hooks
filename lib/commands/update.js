'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getSourceModuleDir, getTargetBaseDir, getTargetModuleDir } = require('../paths');
const { mergeModuleSettings, removeModuleSettings } = require('../settings');

function copyRecursive(src, dest, excludes) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (excludes.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, excludes);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getInstalledModules() {
  const baseDir = getTargetBaseDir();
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

function updateModule(moduleName) {
  const sourceDir = getSourceModuleDir(moduleName);
  const targetDir = getTargetModuleDir(moduleName);

  // Validate source still exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`  Source module "${moduleName}" no longer exists in repo — skipping.`);
    return false;
  }

  // 1. Remove old settings
  try {
    const settingsPath = path.join(targetDir, 'settings.json');
    let moduleSettings = {};
    if (fs.existsSync(settingsPath)) {
      moduleSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    removeModuleSettings(moduleName, moduleSettings);
  } catch (err) {
    console.error(`  Failed to remove old settings: ${err.message}`);
    return false;
  }

  // 2. Delete everything except data/
  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'data') continue;
      const fullPath = path.join(targetDir, entry.name);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`  Failed to clean old files: ${err.message}`);
    return false;
  }

  // 3. Copy fresh files from source
  try {
    copyRecursive(sourceDir, targetDir, ['node_modules', 'data']);
  } catch (err) {
    console.error(`  Failed to copy module files: ${err.message}`);
    return false;
  }

  // 4. Run npm install
  try {
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
  } catch {
    console.error(`  npm install failed.`);
    return false;
  }

  // 5. Run npm run setup if defined
  try {
    const pkgPath = path.join(targetDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.setup) {
        console.log(`  Running setup...`);
        execSync('npm run setup', { cwd: targetDir, stdio: 'inherit' });
      }
    }
  } catch {
    console.error(`  Setup script failed.`);
    return false;
  }

  // 6. Merge fresh settings
  try {
    const settingsPath = path.join(targetDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const moduleSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      mergeModuleSettings(moduleSettings);
    }
  } catch (err) {
    console.error(`  Failed to merge settings: ${err.message}`);
    return false;
  }

  return true;
}

function update() {
  // 1. Git pull the repo
  const repoRoot = path.resolve(__dirname, '..', '..');
  console.log(`Updating claude-hooks in ${repoRoot}...`);
  try {
    execSync('git pull', { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    console.error('git pull failed.');
    process.exitCode = 1;
    return;
  }

  // 2. Find installed modules
  const installed = getInstalledModules();
  if (installed.length === 0) {
    console.log('\nNo modules installed in this project. Nothing to update.');
    return;
  }

  console.log(`\nFound ${installed.length} installed module(s): ${installed.join(', ')}`);

  // 3. Update each module
  const results = { success: [], failed: [] };
  for (const moduleName of installed) {
    console.log(`\nUpdating ${moduleName}...`);
    const ok = updateModule(moduleName);
    if (ok) {
      let label = moduleName;
      try {
        const vPath = path.join(getTargetModuleDir(moduleName), 'version.json');
        if (fs.existsSync(vPath)) {
          const data = JSON.parse(fs.readFileSync(vPath, 'utf8'));
          label = `${data.Name || moduleName} v${data.Version || 'unknown'}`;
        }
      } catch {}
      results.success.push(label);
    } else {
      results.failed.push(moduleName);
    }
  }

  // 4. Summary
  console.log('\n--- Update Summary ---');
  if (results.success.length > 0) {
    console.log(`Updated: ${results.success.join(', ')}`);
  }
  if (results.failed.length > 0) {
    console.log(`Failed:  ${results.failed.join(', ')}`);
    process.exitCode = 1;
  }
  if (results.success.length > 0) {
    console.log('Restart Claude Code for changes to take effect.');
  }
}

module.exports = update;

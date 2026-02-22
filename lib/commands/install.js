'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getSourceModuleDir, getTargetModuleDir } = require('../paths');
const { mergeModuleSettings } = require('../settings');

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

function install(moduleName) {
  const sourceDir = getSourceModuleDir(moduleName);
  const targetDir = getTargetModuleDir(moduleName);

  // 1. Validate module exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`Module "${moduleName}" not found in modules directory.`);
    process.exitCode = 1;
    return;
  }

  // 2. Check not already installed
  if (fs.existsSync(targetDir)) {
    console.error(`Module "${moduleName}" is already installed at ${targetDir}`);
    process.exitCode = 1;
    return;
  }

  // 3. Copy files, excluding node_modules/ and data/
  try {
    copyRecursive(sourceDir, targetDir, ['node_modules', 'data']);
  } catch (err) {
    console.error(`Failed to copy module files: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  // 4. Run npm install
  try {
    console.log(`Installing dependencies for ${moduleName}...`);
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
  } catch {
    console.error(`npm install failed for "${moduleName}". Cleaning up...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  // 5. Run npm run setup if script exists
  try {
    const pkgPath = path.join(targetDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.setup) {
        console.log(`Running setup for ${moduleName}...`);
        execSync('npm run setup', { cwd: targetDir, stdio: 'inherit' });
      }
    }
  } catch {
    console.error(`Setup script failed for "${moduleName}". Cleaning up...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  // 6. Merge settings
  try {
    const settingsPath = path.join(targetDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const moduleSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      mergeModuleSettings(moduleSettings);
    }
  } catch (err) {
    console.error(`Failed to merge settings: ${err.message}. Cleaning up...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  // 7. Print success
  let versionInfo = moduleName;
  try {
    const versionPath = path.join(targetDir, 'version.json');
    if (fs.existsSync(versionPath)) {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      versionInfo = `${data.Name || moduleName} v${data.Version || 'unknown'}`;
    }
  } catch {}

  console.log(`\nInstalled ${versionInfo} successfully.`);
  console.log('Restart Claude Code for hooks to take effect.');
}

module.exports = install;

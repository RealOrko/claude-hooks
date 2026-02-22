'use strict';

const fs = require('fs');
const { getSettingsLocalPath } = require('./paths');

function readSettings() {
  const settingsPath = getSettingsLocalPath();
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  const settingsPath = getSettingsLocalPath();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function mergeModuleSettings(moduleSettings) {
  const settings = readSettings();

  if (moduleSettings.hooks) {
    if (!settings.hooks) settings.hooks = {};
    for (const [event, groups] of Object.entries(moduleSettings.hooks)) {
      if (!settings.hooks[event]) settings.hooks[event] = [];
      settings.hooks[event].push(...groups);
    }
  }

  if (moduleSettings.mcpServers) {
    if (!settings.mcpServers) settings.mcpServers = {};
    for (const [name, config] of Object.entries(moduleSettings.mcpServers)) {
      settings.mcpServers[name] = config;
    }
  }

  writeSettings(settings);
}

function removeModuleSettings(moduleName, moduleSettings) {
  const settingsPath = getSettingsLocalPath();
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return;
  }

  const pattern = `claude-hooks/${moduleName}/`;

  if (settings.hooks) {
    for (const event of Object.keys(settings.hooks)) {
      settings.hooks[event] = settings.hooks[event].filter(group => {
        if (!group.hooks) return true;
        return !group.hooks.some(h => h.command && h.command.includes(pattern));
      });
      if (settings.hooks[event].length === 0) {
        delete settings.hooks[event];
      }
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }

  if (settings.mcpServers && moduleSettings.mcpServers) {
    for (const name of Object.keys(moduleSettings.mcpServers)) {
      delete settings.mcpServers[name];
    }
    if (Object.keys(settings.mcpServers).length === 0) {
      delete settings.mcpServers;
    }
  }

  writeSettings(settings);
}

module.exports = { mergeModuleSettings, removeModuleSettings };

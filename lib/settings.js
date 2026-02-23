'use strict';

const fs = require('fs');
const { getSettingsPath, getMcpConfigPath } = require('./paths');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function mergeModuleSettings(moduleSettings) {
  // Hooks → .claude/settings.json
  if (moduleSettings.hooks) {
    const settings = readJson(getSettingsPath());
    if (!settings.hooks) settings.hooks = {};
    for (const [event, groups] of Object.entries(moduleSettings.hooks)) {
      if (!settings.hooks[event]) settings.hooks[event] = [];
      settings.hooks[event].push(...groups);
    }
    writeJson(getSettingsPath(), settings);
  }

  // MCP servers → .mcp.json
  if (moduleSettings.mcpServers) {
    const mcp = readJson(getMcpConfigPath());
    if (!mcp.mcpServers) mcp.mcpServers = {};
    for (const [name, config] of Object.entries(moduleSettings.mcpServers)) {
      mcp.mcpServers[name] = config;
    }
    writeJson(getMcpConfigPath(), mcp);
  }
}

function removeModuleSettings(moduleName, moduleSettings) {
  // Remove hooks from .claude/settings.json
  const settingsPath = getSettingsPath();
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    settings = null;
  }

  if (settings) {
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

    // Clean any leftover mcpServers from settings.json (migration)
    if (settings.mcpServers && moduleSettings.mcpServers) {
      for (const name of Object.keys(moduleSettings.mcpServers)) {
        delete settings.mcpServers[name];
      }
      if (Object.keys(settings.mcpServers).length === 0) {
        delete settings.mcpServers;
      }
    }

    writeJson(settingsPath, settings);
  }

  // Remove MCP servers from .mcp.json
  if (moduleSettings.mcpServers) {
    const mcpPath = getMcpConfigPath();
    let mcp;
    try {
      mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch {
      mcp = null;
    }

    if (mcp && mcp.mcpServers) {
      for (const name of Object.keys(moduleSettings.mcpServers)) {
        delete mcp.mcpServers[name];
      }
      if (Object.keys(mcp.mcpServers).length === 0) {
        delete mcp.mcpServers;
      }
      writeJson(mcpPath, mcp);
    }
  }
}

module.exports = { mergeModuleSettings, removeModuleSettings };

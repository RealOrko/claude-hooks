'use strict';

const { version } = require('../package.json');
const list = require('./commands/list');
const update = require('./commands/update');
const install = require('./commands/install');
const uninstall = require('./commands/uninstall');

const USAGE = `
claude-hooks v${version}

Usage: claude-hooks [options]

Options:
  --help, -h                  Show this help message
  --version, -v               Show version number
  --list, -l                  List available hook modules
  --update                    Update repo and refresh all installed modules
  --install <module-name>     Install a hook module into current project
  --uninstall <module-name>   Uninstall a hook module from current project
`.trim();

function getNextArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function cli(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(USAGE);
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(version);
    return;
  }

  if (args.includes('--list') || args.includes('-l')) {
    list();
    return;
  }

  if (args.includes('--update')) {
    update();
    return;
  }

  if (args.includes('--install')) {
    const moduleName = getNextArg(args, '--install');
    if (!moduleName) {
      console.error('Usage: claude-hooks --install <module-name>');
      process.exitCode = 1;
      return;
    }
    install(moduleName);
    return;
  }

  if (args.includes('--uninstall')) {
    const moduleName = getNextArg(args, '--uninstall');
    if (!moduleName) {
      console.error('Usage: claude-hooks --uninstall <module-name>');
      process.exitCode = 1;
      return;
    }
    uninstall(moduleName);
    return;
  }

  console.error(`Unknown option: ${args[0]}`);
  console.log(USAGE);
  process.exitCode = 1;
}

module.exports = cli;

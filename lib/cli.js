'use strict';

const { version } = require('../package.json');
const list = require('./commands/list');
const update = require('./commands/update');
const install = require('./commands/install');
const uninstall = require('./commands/uninstall');
const redirect = require('./commands/redirect');
const reset = require('./commands/reset');
const run = require('./commands/run');
const { enableTeams, disableTeams } = require('./commands/teams');

const USAGE = `
chx (claude-hooks) v${version}

Usage: chx [options]

Options:
  --help, -h                  Show this help message
  --version, -v               Show version number
  --list, -l                  List available hook modules
  --update                    Update repo and refresh all installed modules
  --install <module-name>     Install a hook module into current project
  --uninstall <module-name>   Uninstall a hook module from current project
  --redirect [url]            Redirect Claude Code to a different model endpoint
                              (default: http://localhost:8000)
      --api-token <token>       API token (default: none)
      --model <model>           Model name (default: redirected-model)
  --reset                     Remove redirect variables from .env
  --run                       Load .env and start Claude Code (--dangerously-skip-permissions)
  --teams                     Enable experimental agent teams in .env
  --no-teams                  Disable experimental agent teams from .env
`.trim();

function getNextArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function getOptionalNextArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const next = args[idx + 1];
  if (next.startsWith('--')) return null;
  return next;
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

  if (args.includes('--redirect')) {
    const url = getOptionalNextArg(args, '--redirect');
    const token = getNextArg(args, '--api-token');
    const model = getNextArg(args, '--model');
    redirect(url, token, model);
    return;
  }

  if (args.includes('--reset')) {
    reset();
    return;
  }

  if (args.includes('--run')) {
    run();
    return;
  }

  if (args.includes('--teams')) {
    enableTeams();
    return;
  }

  if (args.includes('--no-teams')) {
    disableTeams();
    return;
  }

  console.error(`Unknown option: ${args[0]}`);
  console.log(USAGE);
  process.exitCode = 1;
}

module.exports = cli;

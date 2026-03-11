import { execFileSync } from 'child_process';
import path from 'path';

const BIN = 'vector-kv';

export function getProjectKey() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const project = path.basename(projectDir);
  return `claude-hooks::vector-kv::${project}`;
}

export function set(key, content, meta) {
  const args = ['set', key];
  if (meta) {
    args.push('--meta', typeof meta === 'string' ? meta : JSON.stringify(meta));
  }
  execFileSync(BIN, args, {
    input: content,
    encoding: 'utf8',
    timeout: 30000,
  });
}

export function get(key, { query, meta, k } = {}) {
  const args = ['get', key];
  if (query) {
    args.push('-q', query);
  }
  if (meta) {
    args.push('-m', meta);
  }
  if (k) {
    args.push('-k', String(k));
  }
  const stdout = execFileSync(BIN, args, {
    encoding: 'utf8',
    timeout: 30000,
  });
  try {
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

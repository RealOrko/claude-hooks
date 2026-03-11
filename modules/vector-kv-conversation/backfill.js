import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { extractExchanges, loadBookmarks, saveBookmarks } from './lib/transcript.js';
import { set } from './lib/vkv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getProjectRoot() {
  // When installed: <project>/.claude/claude-hooks/vector-kv-conversation/
  // Go up 3 levels to get project root
  return path.resolve(__dirname, '..', '..', '..');
}

function getClaudeProjectsDir(projectRoot) {
  const encoded = projectRoot.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

function getProjectKey(projectRoot) {
  const project = path.basename(projectRoot);
  return `claude-hooks::vector-kv::${project}`;
}

async function main() {
  const projectRoot = getProjectRoot();
  const projectsDir = getClaudeProjectsDir(projectRoot);
  const key = getProjectKey(projectRoot);

  console.log(`Project root: ${projectRoot}`);
  console.log(`Transcripts dir: ${projectsDir}`);
  console.log(`Vector-kv key: ${key}`);

  if (!fs.existsSync(projectsDir)) {
    console.log('No Claude transcripts found for this project. Nothing to backfill.');
    return;
  }

  const jsonlFiles = fs.readdirSync(projectsDir).filter(f => f.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) {
    console.log('No transcript files found. Nothing to backfill.');
    return;
  }

  console.log(`Found ${jsonlFiles.length} transcript files to process.\n`);

  const bookmarks = loadBookmarks();
  let totalIndexed = 0;
  let totalSkipped = 0;

  for (let fileIdx = 0; fileIdx < jsonlFiles.length; fileIdx++) {
    const file = jsonlFiles[fileIdx];
    const sessionId = path.basename(file, '.jsonl');
    const transcriptPath = path.join(projectsDir, file);

    const afterUuid = bookmarks[sessionId] ?? null;
    const exchanges = extractExchanges(transcriptPath, afterUuid);

    if (exchanges.length === 0) {
      totalSkipped++;
      continue;
    }

    let sessionIndexed = 0;

    for (let i = 0; i < exchanges.length; i++) {
      const ex = exchanges[i];
      const fullText = `USER: ${ex.user_text}\n\nASSISTANT: ${ex.assistant_text}`;

      let summary = ex.user_text.slice(0, 200).replace(/\n/g, ' ').trim();
      if (ex.user_text.length > 200) summary += '...';

      const meta = {
        session_id: sessionId,
        ts: ex.timestamp || new Date().toISOString(),
        idx: i,
        summary,
      };

      try {
        set(key, fullText, meta);
        sessionIndexed++;
      } catch (err) {
        console.error(`  Failed to index exchange ${i}: ${err.message}`);
      }
    }

    if (exchanges.length > 0) {
      bookmarks[sessionId] = exchanges[exchanges.length - 1].assistant_uuid;
      saveBookmarks(bookmarks);
    }

    totalIndexed += sessionIndexed;
    console.log(`[${fileIdx + 1}/${jsonlFiles.length}] Session ${sessionId}: indexed ${sessionIndexed} exchanges`);
  }

  console.log(`\nBackfill complete: ${totalIndexed} exchanges indexed, ${totalSkipped} sessions already up to date.`);
}

main().catch(err => {
  console.error('backfill error:', err.message);
  process.exit(1);
});

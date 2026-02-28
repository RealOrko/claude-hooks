import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { embed, embedBatch } from './lib/embeddings.js';
import { search, addChunks, deleteByFilePaths, getCount, getIndexedFiles } from './lib/db.js';

const CHUNK_LINES = 100;
const OVERLAP_LINES = 20;
const CONCURRENCY = os.cpus().length;
const DB_FLUSH_THRESHOLD = 200; // flush records to DB every N records

const EXTENSION_LANGUAGES = {
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
  '.py': 'python', '.rb': 'ruby', '.rs': 'rust', '.go': 'go',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.css': 'css', '.scss': 'scss', '.html': 'html',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.md': 'markdown', '.sql': 'sql', '.lua': 'lua', '.zig': 'zig',
  '.el': 'elisp', '.clj': 'clojure', '.ex': 'elixir', '.erl': 'erlang',
  '.hs': 'haskell', '.ml': 'ocaml', '.fs': 'fsharp', '.cs': 'csharp',
  '.php': 'php', '.r': 'r', '.jl': 'julia', '.dart': 'dart',
  '.vim': 'vim', '.proto': 'protobuf', '.graphql': 'graphql',
};

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGES[ext] || ext.slice(1) || 'unknown';
}

function walkFiles(dir, patterns, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.claude', '__pycache__', '.venv',
           'dist', 'build', '.next', 'target', 'vendor'].includes(entry.name)) {
        continue;
      }
      walkFiles(fullPath, patterns, results);
    } else if (entry.isFile()) {
      const matches = patterns.some(p => {
        if (p.startsWith('*.')) {
          return entry.name.endsWith(p.slice(1));
        }
        return entry.name === p;
      });
      if (matches) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function chunkFile(content, filePath) {
  const lines = content.split('\n');
  const chunks = [];

  if (lines.length <= CHUNK_LINES) {
    chunks.push({
      start_line: 1,
      end_line: lines.length,
      text: content,
    });
    return chunks;
  }

  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + CHUNK_LINES, lines.length);
    const chunkLines = lines.slice(start, end);

    chunks.push({
      start_line: start + 1,
      end_line: end,
      text: chunkLines.join('\n'),
    });

    start += CHUNK_LINES - OVERLAP_LINES;
    if (end === lines.length) break;
  }

  return chunks;
}

// --- File fingerprint cache for skip-unchanged ---

function getFingerprintPath(rootDir) {
  const hash = createHash('sha256').update(rootDir).digest('hex').slice(0, 12);
  const dataDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'data');
  return path.join(dataDir, `fingerprints-${hash}.json`);
}

function loadFingerprints(rootDir) {
  const fp = getFingerprintPath(rootDir);
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return {};
  }
}

function saveFingerprints(rootDir, fingerprints) {
  const fp = getFingerprintPath(rootDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(fingerprints));
}

function fileFingerprint(filePath) {
  const stat = fs.statSync(filePath);
  return `${stat.mtimeMs}:${stat.size}`;
}

// --- Concurrency limiter ---

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// --- MCP Server ---

const server = new McpServer({
  name: 'memory-code',
  version: '1.0.0',
});

async function indexCode({ extensions, directory }) {
    const rootDir = path.isAbsolute(directory) ? directory : path.resolve(directory);

    if (!fs.existsSync(rootDir)) {
      return { content: [{ type: 'text', text: `Directory not found: ${rootDir}` }] };
    }

    // Find matching files
    const files = walkFiles(rootDir, extensions);

    if (files.length === 0) {
      return {
        content: [{ type: 'text', text: `No files matched patterns: ${extensions.join(', ')} in ${rootDir}` }],
      };
    }

    // Load cached fingerprints to skip unchanged files
    const oldFingerprints = loadFingerprints(rootDir);
    const newFingerprints = {};

    // Determine which files need indexing
    const filesToIndex = [];
    let unchangedFiles = 0;

    for (const filePath of files) {
      const relPath = path.relative(rootDir, filePath);
      let fp;
      try {
        fp = fileFingerprint(filePath);
      } catch {
        continue;
      }
      newFingerprints[relPath] = fp;

      if (oldFingerprints[relPath] === fp) {
        unchangedFiles++;
      } else {
        filesToIndex.push(filePath);
      }
    }

    if (filesToIndex.length === 0) {
      // Save fingerprints (handles removed files)
      saveFingerprints(rootDir, newFingerprints);
      return {
        content: [{
          type: 'text',
          text: `All ${files.length} files unchanged — nothing to re-index.\nPatterns: ${extensions.join(', ')}\nRoot: ${rootDir}`,
        }],
      };
    }

    const totalFiles = filesToIndex.length;
    let indexedFiles = 0;
    let totalChunks = 0;
    let skippedFiles = 0;
    const errors = [];
    const startTime = Date.now();

    // Batch accumulator for DB writes
    let pendingRecords = [];
    let pendingDeletePaths = [];

    async function flushRecords() {
      if (pendingRecords.length === 0) return;
      // Delete old entries for all pending files, then insert
      if (pendingDeletePaths.length > 0) {
        await deleteByFilePaths(pendingDeletePaths);
        pendingDeletePaths = [];
      }
      await addChunks(pendingRecords);
      pendingRecords = [];
    }

    // Phase 1: Read and chunk all files (parallel I/O with concurrency limit)
    const fileDataList = await mapWithConcurrency(filesToIndex, CONCURRENCY, (filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.length === 0) return null;
        const relPath = path.relative(rootDir, filePath);
        const language = detectLanguage(filePath);
        const chunks = chunkFile(content, filePath);
        return { relPath, language, chunks };
      } catch (err) {
        errors.push(`${filePath}: ${err.message}`);
        return null;
      }
    });

    // Collect all texts for batch embedding
    const allTexts = [];
    const textToFileIndex = []; // maps each text index to fileDataList index

    for (let i = 0; i < fileDataList.length; i++) {
      const fd = fileDataList[i];
      if (!fd) continue;
      for (const chunk of fd.chunks) {
        allTexts.push(`${fd.relPath}\n${chunk.text}`);
        textToFileIndex.push(i);
      }
    }

    // Phase 2: Embed all chunks in batches with progress
    console.error(`Embedding ${allTexts.length} chunks from ${totalFiles} files...`);
    const allVectors = await embedBatch(allTexts, (done, total) => {
      const pct = ((done / total) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`Embedded ${done}/${total} chunks (${pct}%) — ${elapsed}s`);
    });

    // Phase 3: Build records and flush to DB in batches
    let textIdx = 0;
    for (let i = 0; i < fileDataList.length; i++) {
      const fd = fileDataList[i];
      if (!fd) {
        skippedFiles++;
        continue;
      }

      pendingDeletePaths.push(fd.relPath);

      for (const chunk of fd.chunks) {
        const id = createHash('sha256')
          .update(`${fd.relPath}:${chunk.start_line}:${chunk.end_line}`)
          .digest('hex')
          .slice(0, 16);

        pendingRecords.push({
          id: `cc_${id}`,
          file_path: fd.relPath,
          start_line: chunk.start_line,
          end_line: chunk.end_line,
          language: fd.language,
          text: chunk.text.slice(0, 30000),
          vector: allVectors[textIdx],
        });
        textIdx++;
      }

      totalChunks += fd.chunks.length;
      indexedFiles++;

      // Flush to DB periodically
      if (pendingRecords.length >= DB_FLUSH_THRESHOLD) {
        await flushRecords();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`Progress: ${indexedFiles}/${totalFiles} files (${totalChunks} chunks) — ${elapsed}s`);
      }
    }

    // Final flush
    await flushRecords();

    // Save fingerprints for all files (including unchanged ones)
    saveFingerprints(rootDir, newFingerprints);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    let summary =
      `Indexed ${indexedFiles} file(s) into ${totalChunks} chunk(s) in ${elapsed}s.\n` +
      `Patterns: ${extensions.join(', ')}\n` +
      `Root: ${rootDir}`;

    if (unchangedFiles > 0) {
      summary += `\nSkipped ${unchangedFiles} unchanged file(s)`;
    }
    if (skippedFiles > 0) {
      summary += `\nSkipped: ${skippedFiles} empty/unreadable file(s)`;
    }
    if (errors.length > 0) {
      summary += `\n\nErrors:\n${errors.slice(0, 10).join('\n')}`;
    }

    return { content: [{ type: 'text', text: summary }] };
}

async function searchCode({ query, top_k, language, file_pattern }) {
    const count = await getCount();
    if (count === 0) {
      return {
        content: [{ type: 'text', text: 'No code indexed yet. Use index_code first to index your source files.' }],
      };
    }

    let filter = null;
    const filters = [];
    if (language) {
      const escaped = language.replace(/'/g, "''");
      filters.push(`language = '${escaped}'`);
    }
    if (file_pattern) {
      const escaped = file_pattern.replace(/'/g, "''");
      filters.push(`file_path LIKE '%${escaped}%'`);
    }
    if (filters.length > 0) {
      filter = filters.join(' AND ');
    }

    const queryVector = await embed(query);
    const results = await search(queryVector, top_k, filter);

    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No matching code found.' }] };
    }

    const entries = results.map((r, i) => {
      const relevance = r.distance != null ? (1 - r.distance).toFixed(2) : 'N/A';
      const lineRange = `L${r.start_line}-${r.end_line}`;
      const preview = r.text.length > 500 ? r.text.slice(0, 500) + '...' : r.text;

      return (
        `[${i + 1}] ${r.file_path}:${lineRange} (${r.language}) — relevance: ${relevance}\n` +
        `${'─'.repeat(60)}\n` +
        `${preview}\n`
      );
    });

    return { content: [{ type: 'text', text: entries.join('\n') }] };
}

async function listFiles() {
  const files = await getIndexedFiles();
  if (files.length === 0) {
    return {
      content: [{ type: 'text', text: 'No files indexed yet. Use index_code to index source files.' }],
    };
  }

  const count = await getCount();
  const text = `${files.length} file(s) indexed (${count} chunks total):\n\n${files.join('\n')}`;
  return { content: [{ type: 'text', text }] };
}

// --- MCP tool registrations ---

server.tool(
  'index_code',
  'Index source code files from the project directory into the vector database for semantic search. Walks the directory tree matching the given file extensions, chunks each file, and embeds the chunks. Re-indexes files that were previously indexed.',
  {
    extensions: z.array(z.string()).describe(
      'File patterns to index, e.g. ["*.c", "*.h", "*.py"]. Use *.ext format.'
    ),
    directory: z.string().default('.').describe(
      'Root directory to scan (absolute path, or relative to project). Defaults to current directory.'
    ),
  },
  ({ extensions, directory }) => indexCode({ extensions, directory }),
);

server.tool(
  'search_code',
  'Semantic search across indexed source code. Returns matching code chunks with file paths and line numbers. Use index_code first to index the codebase.',
  {
    query: z.string().describe('Search query — can be natural language or code patterns'),
    top_k: z.number().int().min(1).max(50).default(10).describe('Number of results to return'),
    language: z.string().optional().describe('Filter to a specific language (e.g. "python", "c", "javascript")'),
    file_pattern: z.string().optional().describe('Filter to files matching a substring (e.g. "src/", "test")'),
  },
  ({ query, top_k, language, file_pattern }) => searchCode({ query, top_k, language, file_pattern }),
);

server.tool(
  'list_indexed_files',
  'List all files currently indexed in the code search database.',
  {},
  () => listFiles(),
);

// --- CLI mode ---

async function runCli() {
  const args = process.argv.slice(2);

  if (args[0] === '--index') {
    if (args.length < 3) {
      console.error('Usage: node mcp-server.js --index <directory> <pattern> [pattern...]');
      console.error('Example: node mcp-server.js --index /home/user/project "*.c" "*.h"');
      process.exit(1);
    }

    const directory = args[1];
    const extensions = args.slice(2);

    // Reuse the index_code tool handler directly
    const rootDir = path.isAbsolute(directory) ? directory : path.resolve(directory);
    const result = await indexCode({ extensions, directory: rootDir });
    console.log(result.content[0].text);
    process.exit(0);
  }

  if (args[0] === '--search') {
    if (args.length < 2) {
      console.error('Usage: node mcp-server.js --search <query> [--top_k N] [--language lang] [--file pattern]');
      process.exit(1);
    }

    const query = args[1];
    let top_k = 10, language, file_pattern;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--top_k' && args[i + 1]) { top_k = parseInt(args[++i], 10); }
      else if (args[i] === '--language' && args[i + 1]) { language = args[++i]; }
      else if (args[i] === '--file' && args[i + 1]) { file_pattern = args[++i]; }
    }

    const result = await searchCode({ query, top_k, language, file_pattern });
    console.log(result.content[0].text);
    process.exit(0);
  }

  if (args[0] === '--list') {
    const result = await listFiles();
    console.log(result.content[0].text);
    process.exit(0);
  }

  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`memory-code — semantic code search

Commands:
  --index <dir> <pattern> [pattern...]   Index source files
  --search <query> [options]             Search indexed code
  --list                                 List indexed files
  (no args)                              Start MCP server on stdio

Search options:
  --top_k N          Number of results (default: 10)
  --language lang    Filter by language
  --file pattern     Filter by file path substring

Examples:
  node mcp-server.js --index /home/user/project "*.c" "*.h"
  node mcp-server.js --search "memory allocation" --language c
  node mcp-server.js --list`);
    process.exit(0);
  }
}

if (process.argv.length > 2) {
  await runCli();
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('memory-code MCP server running on stdio');
}

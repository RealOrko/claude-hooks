import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { embed, embedBatch } from './lib/embeddings.js';
import { search, addChunks, deleteByFilePath, getCount, getIndexedFiles } from './lib/db.js';

const CHUNK_LINES = 100;
const OVERLAP_LINES = 20;

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
      // Skip common non-source directories
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

const server = new McpServer({
  name: 'code-memory',
  version: '1.0.0',
});

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
  async ({ extensions, directory }) => {
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

    let totalChunks = 0;
    let indexedFiles = 0;
    let skippedFiles = 0;
    const errors = [];

    for (const filePath of files) {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        errors.push(`${filePath}: ${err.message}`);
        skippedFiles++;
        continue;
      }

      // Skip binary / empty files
      if (content.length === 0) {
        skippedFiles++;
        continue;
      }

      const relPath = path.relative(rootDir, filePath);
      const language = detectLanguage(filePath);
      const chunks = chunkFile(content, filePath);

      // Remove old entries for this file before re-indexing
      await deleteByFilePath(relPath);

      // Build records
      const records = [];
      const texts = chunks.map(c => `${relPath}\n${c.text}`);
      const vectors = await embedBatch(texts);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const id = createHash('sha256')
          .update(`${relPath}:${chunk.start_line}:${chunk.end_line}`)
          .digest('hex')
          .slice(0, 16);

        records.push({
          id: `cc_${id}`,
          file_path: relPath,
          start_line: chunk.start_line,
          end_line: chunk.end_line,
          language,
          text: chunk.text.slice(0, 30000),
          vector: vectors[i],
        });
      }

      await addChunks(records);
      totalChunks += records.length;
      indexedFiles++;
    }

    let summary =
      `Indexed ${indexedFiles} file(s) into ${totalChunks} chunk(s).\n` +
      `Patterns: ${extensions.join(', ')}\n` +
      `Root: ${rootDir}`;

    if (skippedFiles > 0) {
      summary += `\nSkipped: ${skippedFiles} file(s)`;
    }
    if (errors.length > 0) {
      summary += `\n\nErrors:\n${errors.slice(0, 10).join('\n')}`;
    }

    return { content: [{ type: 'text', text: summary }] };
  },
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
  async ({ query, top_k, language, file_pattern }) => {
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
  },
);

server.tool(
  'list_indexed_files',
  'List all files currently indexed in the code search database.',
  {},
  async () => {
    const files = await getIndexedFiles();
    if (files.length === 0) {
      return {
        content: [{ type: 'text', text: 'No files indexed yet. Use index_code to index source files.' }],
      };
    }

    const count = await getCount();
    const text = `${files.length} file(s) indexed (${count} chunks total):\n\n${files.join('\n')}`;
    return { content: [{ type: 'text', text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('code-memory MCP server running on stdio');

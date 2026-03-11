import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { get, getProjectKey } from './lib/vkv.js';

function wrapText(str, width = 120, indent = '') {
  if (!str) return str;
  const lines = str.split('\n');
  const wrapped = [];
  for (const line of lines) {
    if (line.length <= width) {
      wrapped.push(line);
      continue;
    }
    let remaining = line;
    let first = true;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(' ', width);
      if (breakAt <= 0) breakAt = width;
      wrapped.push((first ? '' : indent) + remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt + (remaining[breakAt] === ' ' ? 1 : 0));
      first = false;
    }
    if (remaining) wrapped.push((first ? '' : indent) + remaining);
  }
  return wrapped.join('\n');
}

function parseMeta(metaStr) {
  try {
    return JSON.parse(metaStr);
  } catch {
    return {};
  }
}

function stripChunkPrefix(content) {
  return content.replace(/^\[#\d+\]\s*/, '');
}

const server = new McpServer({
  name: 'vector-kv-conversation',
  version: '1.0.0',
});

server.tool(
  'search_past_conversations',
  'Semantic search across past conversation exchanges. Returns summaries with session IDs, dates, and relevance scores. Use this when the keyword hints from context suggest relevant past conversations.',
  {
    query: z.string().describe('The search query'),
    top_k: z.number().int().min(1).max(20).default(5).describe('Number of results to return'),
  },
  async ({ query, top_k }) => {
    const key = getProjectKey();
    let results;
    try {
      results = get(key, { query, k: top_k });
    } catch (err) {
      return { content: [{ type: 'text', text: `Search failed: ${err.message}` }] };
    }

    if (!results || results.length === 0) {
      return { content: [{ type: 'text', text: 'No past conversations indexed yet.' }] };
    }

    const lines = results.map((r, i) => {
      const meta = parseMeta(r.metadata);
      const score = r.distance != null ? (1 - r.distance).toFixed(2) : 'N/A';
      return (
        `[${i + 1}] Session: ${meta.session_id ?? 'unknown'}\n` +
        `    Date: ${meta.ts ?? 'unknown'}\n` +
        `    Relevance: ${score}\n` +
        `    Summary: ${wrapText(meta.summary ?? 'No summary', 108, '    ')}\n` +
        `    Content: ${wrapText(stripChunkPrefix(r.content).slice(0, 300), 108, '    ')}\n`
      );
    });

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'get_conversation_detail',
  'Search for conversation exchanges within a specific session. Use the session ID from search_past_conversations results to drill into a conversation.',
  {
    session_id: z.string().describe('The session ID to search within'),
    query: z.string().default('').describe('Optional search query to find relevant exchanges within the session'),
    top_k: z.number().int().min(1).max(50).default(10).describe('Number of results to return'),
  },
  async ({ session_id, query, top_k }) => {
    const key = getProjectKey();
    let results;
    try {
      const opts = { meta: session_id, k: top_k };
      if (query) opts.query = query;
      results = get(key, opts);
    } catch (err) {
      return { content: [{ type: 'text', text: `Search failed: ${err.message}` }] };
    }

    if (!results || results.length === 0) {
      return {
        content: [{ type: 'text', text: `No exchanges found for session: ${session_id}` }],
      };
    }

    const lines = [`Session: ${session_id} (${results.length} chunks)\n`];
    for (const r of results) {
      const meta = parseMeta(r.metadata);
      const relevance = r.distance != null && r.distance > 0 ? ` (relevance: ${(1 - r.distance).toFixed(2)})` : '';
      lines.push(
        `--- Exchange idx:${meta.idx ?? '?'}${relevance} ---\n` +
        `Date: ${meta.ts ?? 'unknown'}\n` +
        `${wrapText(stripChunkPrefix(r.content))}\n`,
      );
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'get_session_exchanges',
  'Retrieve all exchanges from a specific conversation session, ordered by chunk. Use the session ID from search_past_conversations results.',
  {
    session_id: z.string().describe('The session ID to retrieve'),
  },
  async ({ session_id }) => {
    const key = getProjectKey();
    let results;
    try {
      results = get(key, { meta: session_id });
    } catch (err) {
      return { content: [{ type: 'text', text: `Retrieval failed: ${err.message}` }] };
    }

    if (!results || results.length === 0) {
      return {
        content: [{ type: 'text', text: `No exchanges found for session: ${session_id}` }],
      };
    }

    const lines = [`Session: ${session_id} (${results.length} chunks)\n`];
    for (const r of results) {
      const meta = parseMeta(r.metadata);
      lines.push(
        `--- Exchange idx:${meta.idx ?? '?'} (chunk ${r.chunk ?? '?'}) ---\n` +
        `Date: ${meta.ts ?? 'unknown'}\n` +
        `${wrapText(stripChunkPrefix(r.content))}\n`,
      );
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('vector-kv-conversation MCP server running on stdio');

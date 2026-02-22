import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { embed } from './lib/embeddings.js';
import { search, getById, getCount } from './lib/db.js';

const server = new McpServer({
  name: 'conversation-memory',
  version: '1.0.0',
});

server.tool(
  'search_past_conversations',
  'Semantic search across past conversation exchanges. Returns summaries with IDs, dates, and relevance scores. Use this when the keyword hints from context suggest relevant past conversations.',
  {
    query: z.string().describe('The search query'),
    top_k: z.number().int().min(1).max(20).default(5).describe('Number of results to return'),
  },
  async ({ query, top_k }) => {
    const count = await getCount();
    if (count === 0) {
      return { content: [{ type: 'text', text: 'No past conversations indexed yet.' }] };
    }

    const queryVector = await embed(query);
    const results = await search(queryVector, top_k);

    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No results found.' }] };
    }

    const lines = results.map((r, i) => {
      const score = r.distance != null ? (1 - r.distance).toFixed(2) : 'N/A';
      return (
        `[${i + 1}] ID: ${r.id}\n` +
        `    Date: ${r.timestamp ?? 'unknown'}\n` +
        `    Session: ${r.session_id ?? 'unknown'}\n` +
        `    Relevance: ${score}\n` +
        `    Summary: ${r.summary ?? 'No summary'}\n` +
        `    Prompt: ${r.prompt_preview ?? ''}\n`
      );
    });

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'get_conversation_detail',
  'Retrieve the full prompt + response for a specific past exchange. Use the ID from search_past_conversations results.',
  {
    conversation_id: z.string().describe('The exchange ID to retrieve'),
  },
  async ({ conversation_id }) => {
    const record = await getById(conversation_id);
    if (!record) {
      return {
        content: [{ type: 'text', text: `No conversation found with ID: ${conversation_id}` }],
      };
    }

    const text =
      `Date: ${record.timestamp ?? 'unknown'}\n` +
      `Session: ${record.session_id ?? 'unknown'}\n` +
      `Summary: ${record.summary ?? 'N/A'}\n\n` +
      `--- Full Exchange ---\n${record.text}`;

    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'get_session_exchanges',
  'Retrieve relevant exchanges from a specific conversation session. Searches within a single session for exchanges matching the query, returned in chronological order. Use the session ID from search_past_conversations results to drill into a conversation.',
  {
    session_id: z.string().describe('The session ID to search within'),
    query: z.string().describe('Search query to find relevant exchanges'),
    top_k: z.number().int().min(1).max(50).default(10).describe('Number of results to return'),
  },
  async ({ session_id, query, top_k }) => {
    const count = await getCount();
    if (count === 0) {
      return { content: [{ type: 'text', text: 'No past conversations indexed yet.' }] };
    }

    const escaped = session_id.replace(/'/g, "''");
    const queryVector = await embed(query);
    const results = await search(queryVector, 100, `session_id = '${escaped}'`);

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: `No matching exchanges found in session: ${session_id}` }],
      };
    }

    const sorted = results
      .sort((a, b) => (a.exchange_index ?? 0) - (b.exchange_index ?? 0))
      .slice(0, top_k);

    const lines = [`Session: ${session_id} (${sorted.length} relevant exchanges)\n`];
    for (const m of sorted) {
      const relevance = m.distance != null ? (1 - m.distance).toFixed(2) : '0.00';
      lines.push(
        `--- Exchange ${(m.exchange_index ?? 0) + 1} (ID: ${m.id}, relevance: ${relevance}) ---\n` +
        `Date: ${m.timestamp ?? 'unknown'}\n` +
        `${m.text}\n`,
      );
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('conversation-memory MCP server running on stdio');

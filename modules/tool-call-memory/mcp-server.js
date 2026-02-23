import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { embed } from './lib/embeddings.js';
import { search, getById, getCount, queryByToolName } from './lib/db.js';

const server = new McpServer({
  name: 'tool-call-memory',
  version: '1.0.0',
});

server.tool(
  'search_tool_calls',
  'Semantic search across past tool call executions. Returns summaries with success/failure status, scores, and parameters. Use this to find patterns in past tool usage.',
  {
    query: z.string().describe('Search query describing the tool call pattern to find'),
    top_k: z.number().int().min(1).max(50).default(10).describe('Number of results to return'),
    success_only: z.boolean().default(false).describe('If true, only return successful tool calls'),
    failure_only: z.boolean().default(false).describe('If true, only return failed tool calls'),
  },
  async ({ query, top_k, success_only, failure_only }) => {
    const count = await getCount();
    if (count === 0) {
      return { content: [{ type: 'text', text: 'No tool calls recorded yet.' }] };
    }

    let filter = null;
    if (success_only) filter = "success = 'true'";
    else if (failure_only) filter = "success = 'false'";

    const queryVector = await embed(query);
    const results = await search(queryVector, top_k, filter);

    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No matching tool calls found.' }] };
    }

    const lines = results.map((r, i) => {
      const relevance = r.distance != null ? (1 - r.distance).toFixed(2) : 'N/A';
      const status = r.success === 'true' ? 'SUCCESS (+10)' : 'FAILURE (-10)';
      let entry =
        `[${i + 1}] ID: ${r.id}\n` +
        `    Tool: ${r.tool_name}\n` +
        `    Status: ${status}\n` +
        `    Date: ${r.timestamp ?? 'unknown'}\n` +
        `    Session: ${r.session_id ?? 'unknown'}\n` +
        `    Relevance: ${relevance}\n` +
        `    Summary: ${r.summary ?? 'No summary'}\n`;
      if (r.error) {
        entry += `    Error: ${r.error.slice(0, 200)}\n`;
      }
      return entry;
    });

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'get_tool_call_detail',
  'Retrieve the full details of a specific tool call including complete input parameters and error messages. Use the ID from search_tool_calls results.',
  {
    tool_call_id: z.string().describe('The tool call ID to retrieve'),
  },
  async ({ tool_call_id }) => {
    const record = await getById(tool_call_id);
    if (!record) {
      return {
        content: [{ type: 'text', text: `No tool call found with ID: ${tool_call_id}` }],
      };
    }

    const status = record.success === 'true' ? 'SUCCESS (+10)' : 'FAILURE (-10)';
    let text =
      `Tool: ${record.tool_name}\n` +
      `Status: ${status}\n` +
      `Date: ${record.timestamp ?? 'unknown'}\n` +
      `Session: ${record.session_id ?? 'unknown'}\n` +
      `Summary: ${record.summary ?? 'N/A'}\n\n` +
      `--- Input Parameters ---\n${record.tool_input}\n`;

    if (record.error) {
      text += `\n--- Error ---\n${record.error}\n`;
    }

    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'get_tool_stats',
  'Get aggregate success/failure statistics for a specific tool or all tools. Shows total calls, success rate, and cumulative score.',
  {
    tool_name: z.string().optional().describe('Filter to a specific tool name (e.g. "Bash", "Edit"). Omit for all tools.'),
  },
  async ({ tool_name }) => {
    const count = await getCount();
    if (count === 0) {
      return { content: [{ type: 'text', text: 'No tool calls recorded yet.' }] };
    }

    let results;
    if (tool_name) {
      results = await queryByToolName(tool_name);
    } else {
      const { getTable } = await import('./lib/db.js');
      const table = await getTable();
      results = await table.query().toArray();
    }

    if (results.length === 0) {
      const msg = tool_name ? `No calls recorded for tool: ${tool_name}` : 'No tool calls recorded.';
      return { content: [{ type: 'text', text: msg }] };
    }

    const stats = {};
    for (const r of results) {
      const name = r.tool_name ?? 'unknown';
      if (!stats[name]) {
        stats[name] = { total: 0, success: 0, failure: 0, totalScore: 0 };
      }
      stats[name].total++;
      if (r.success === 'true') stats[name].success++;
      else stats[name].failure++;
      stats[name].totalScore += r.score ?? 0;
    }

    const lines = Object.entries(stats)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, s]) => {
        const rate = s.total > 0 ? ((s.success / s.total) * 100).toFixed(1) : '0.0';
        return (
          `${name}:\n` +
          `  Total: ${s.total} | Success: ${s.success} | Failure: ${s.failure}\n` +
          `  Success Rate: ${rate}%\n` +
          `  Cumulative Score: ${s.totalScore}\n`
        );
      });

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('tool-call-memory MCP server running on stdio');

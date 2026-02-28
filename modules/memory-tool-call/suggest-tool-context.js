import { embed } from './lib/embeddings.js';
import { search, getCount } from './lib/db.js';
import { topFailedTools } from './lib/scoring.js';

async function main() {
  let hookInput;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    hookInput = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0);
  }

  const prompt = hookInput.prompt ?? '';
  if (!prompt || prompt.trim().length < 15) process.exit(0);

  const count = await getCount();
  if (count === 0) process.exit(0);

  let results;
  try {
    const queryVector = await embed(prompt);
    // Cast a wide net to get enough data for scoring
    results = await search(queryVector, 50);
  } catch {
    process.exit(0);
  }

  if (!results || results.length === 0) process.exit(0);

  // Filter to reasonably relevant results only
  const relevant = results.filter(r => r.distance != null && r.distance < 0.8);
  if (relevant.length === 0) process.exit(0);

  // Get top 5 most failed tools from relevant results, time-weighted
  const failed = topFailedTools(relevant, 5);
  if (failed.length === 0) process.exit(0);

  const hints = failed.map(f => {
    const rate = f.total_count > 0
      ? Math.round((f.failure_count / f.total_count) * 100)
      : 0;
    let hint = `${f.tool_name} (score: ${f.weighted_score}, ${f.failure_count}/${f.total_count} failed, ${rate}% failure rate)`;
    if (f.last_error) {
      hint += ` — last error: ${f.last_error.slice(0, 120)}`;
    }
    return hint;
  });

  const contextMsg =
    `Past tool call issues relevant to this task:\n` +
    hints.map(h => `  - ${h}`).join('\n') +
    `\nUse search_tool_calls and get_tool_call_detail MCP tools to review failure patterns and find successful approaches before proceeding.`;

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: contextMsg,
    },
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch(err => {
  console.error('suggest-tool-context error:', err.message);
  process.exit(1);
});

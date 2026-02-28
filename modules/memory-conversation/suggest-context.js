import { embed } from './lib/embeddings.js';
import { search, getCount } from './lib/db.js';

function formatTimeAgo(isoTimestamp) {
  try {
    const then = new Date(isoTimestamp);
    const now = new Date();
    const deltaMs = now - then;
    const days = Math.floor(deltaMs / 86400000);
    const hours = Math.floor(deltaMs / 3600000);
    const minutes = Math.max(1, Math.floor(deltaMs / 60000));

    if (days > 30) {
      const months = Math.floor(days / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } catch {
    return 'recently';
  }
}

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
    results = await search(queryVector, 3);
  } catch {
    process.exit(0);
  }

  if (!results || results.length === 0) process.exit(0);

  const hints = [];
  for (const r of results) {
    if (r.distance > 0.7) continue;

    let shortSummary = (r.summary ?? 'unknown topic').slice(0, 80).trim();
    if ((r.summary ?? '').length > 80) shortSummary += '...';

    const timeAgo = formatTimeAgo(r.timestamp ?? '');
    hints.push(`${shortSummary} (${timeAgo})`);
  }

  if (hints.length === 0) process.exit(0);

  const hintList = hints.map(h => `[${h}]`).join(', ');
  const contextMsg =
    `Potentially relevant past conversations: ${hintList}. ` +
    'Use the search_past_conversations MCP tool to retrieve details if needed.';

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: contextMsg,
    },
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch(err => {
  console.error('suggest-context error:', err.message);
  process.exit(1);
});

import { createHash } from 'crypto';
import { embed } from './lib/embeddings.js';
import { upsertToolCalls } from './lib/db.js';
import { summarizeToolCall, serializeToolInput, buildEmbeddingText } from './lib/formatting.js';

async function main() {
  let hookInput;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    hookInput = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0);
  }

  const toolName = hookInput.tool_name ?? '';
  const toolInput = hookInput.tool_input ?? {};
  const sessionId = hookInput.session_id ?? '';
  const toolUseId = hookInput.tool_use_id ?? '';
  const error = hookInput.error ?? '';

  if (!toolName) process.exit(0);

  const contentHash = createHash('sha256')
    .update(`${sessionId}:${toolUseId}:${toolName}`)
    .digest('hex')
    .slice(0, 12);
  const docId = `tc_${contentHash}`;

  const summary = summarizeToolCall(toolName, toolInput);
  const embeddingText = buildEmbeddingText(toolName, toolInput, error);
  const vector = await embed(embeddingText);

  const record = {
    id: docId,
    tool_name: toolName,
    tool_input: serializeToolInput(toolInput),
    success: 'false',
    score: -10,
    error: (error || '').slice(0, 5000),
    session_id: sessionId || 'unknown',
    timestamp: new Date().toISOString(),
    summary,
    vector,
  };

  await upsertToolCalls([record]);
  console.error(`Recorded failed ${toolName} call (${docId}): ${error.slice(0, 100)}`);
}

main().catch(err => {
  console.error('record-tool-failure error:', err.message);
  process.exit(1);
});

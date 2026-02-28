import { createHash } from 'crypto';
import { extractExchanges, loadBookmarks, saveBookmarks } from './lib/transcript.js';
import { embed } from './lib/embeddings.js';
import { upsertExchanges } from './lib/db.js';

const MAX_DOC_LEN = 40000;

async function main() {
  let hookInput;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    hookInput = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0);
  }

  const transcriptPath = hookInput.transcript_path ?? '';
  const sessionId = hookInput.session_id ?? '';
  if (!transcriptPath) process.exit(0);

  const bookmarks = loadBookmarks();
  const afterUuid = bookmarks[sessionId] ?? null;

  const exchanges = extractExchanges(transcriptPath, afterUuid);
  if (exchanges.length === 0) process.exit(0);

  let indexedCount = 0;

  for (let i = 0; i < exchanges.length; i++) {
    const ex = exchanges[i];
    const contentHash = createHash('sha256')
      .update(`${sessionId}:${ex.user_uuid}`)
      .digest('hex')
      .slice(0, 12);
    const docId = `ex_${contentHash}`;

    let fullText = `USER: ${ex.user_text}\n\nASSISTANT: ${ex.assistant_text}`;
    if (fullText.length > MAX_DOC_LEN) {
      fullText = fullText.slice(0, MAX_DOC_LEN) + '\n... [truncated]';
    }

    let summary = ex.user_text.slice(0, 200).replace(/\n/g, ' ').trim();
    if (ex.user_text.length > 200) summary += '...';

    const promptPreview = ex.user_text.slice(0, 150).replace(/\n/g, ' ').trim();

    const vector = await embed(fullText);

    const record = {
      id: docId,
      text: fullText,
      timestamp: ex.timestamp || new Date().toISOString(),
      session_id: sessionId || 'unknown',
      exchange_index: i,
      summary,
      prompt_preview: promptPreview,
      user_uuid: ex.user_uuid,
      assistant_uuid: ex.assistant_uuid,
      vector,
    };

    await upsertExchanges([record]);
    indexedCount++;
  }

  if (exchanges.length > 0) {
    bookmarks[sessionId] = exchanges[exchanges.length - 1].assistant_uuid;
    saveBookmarks(bookmarks);
  }

  console.error(`Indexed ${indexedCount} exchanges from session ${sessionId}`);
}

main().catch(err => {
  console.error('index-conversation error:', err.message);
  process.exit(1);
});

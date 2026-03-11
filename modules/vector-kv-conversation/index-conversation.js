import { extractExchanges, loadBookmarks, saveBookmarks } from './lib/transcript.js';
import { set, getProjectKey } from './lib/vkv.js';

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

  const key = getProjectKey();
  let indexedCount = 0;

  for (let i = 0; i < exchanges.length; i++) {
    const ex = exchanges[i];

    const fullText = `USER: ${ex.user_text}\n\nASSISTANT: ${ex.assistant_text}`;

    let summary = ex.user_text.slice(0, 200).replace(/\n/g, ' ').trim();
    if (ex.user_text.length > 200) summary += '...';

    const meta = {
      session_id: sessionId || 'unknown',
      ts: ex.timestamp || new Date().toISOString(),
      idx: i,
      summary,
    };

    try {
      set(key, fullText, meta);
      indexedCount++;
    } catch (err) {
      console.error(`Failed to index exchange ${i}: ${err.message}`);
    }
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

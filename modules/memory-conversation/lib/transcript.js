import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKMARK_FILE = path.resolve(__dirname, '..', 'data', 'last_indexed.json');

export function loadBookmarks() {
  try {
    const raw = fs.readFileSync(BOOKMARK_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveBookmarks(bookmarks) {
  const dir = path.dirname(BOOKMARK_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BOOKMARK_FILE, JSON.stringify(bookmarks, null, 2));
}

function extractText(msg) {
  const content = msg.content ?? '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (typeof block === 'string') {
        parts.push(block);
      } else if (block && block.type === 'text') {
        parts.push(block.text ?? '');
      }
    }
    return parts.join('\n');
  }

  return String(content);
}

function hasRealText(envelope) {
  const content = envelope.message?.content ?? '';
  if (typeof content === 'string') return content.trim().length > 0;

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'string' && block.trim()) return true;
      if (block && block.type === 'text' && (block.text ?? '').trim()) return true;
    }
    return false;
  }

  return false;
}

export function extractExchanges(transcriptPath, afterUuid = null) {
  if (!fs.existsSync(transcriptPath)) return [];

  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  const messages = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }

  let startIdx = 0;
  if (afterUuid) {
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].uuid === afterUuid) {
        startIdx = i + 1;
        break;
      }
    }
  }

  const exchanges = [];
  let currentUser = null;
  let assistantTexts = [];
  let lastAssistantUuid = null;

  for (let i = startIdx; i < messages.length; i++) {
    const msg = messages[i];
    const msgType = msg.type ?? '';

    if (msgType === 'user' && hasRealText(msg)) {
      if (currentUser && assistantTexts.length > 0) {
        exchanges.push({
          user_text: extractText(currentUser.message ?? {}),
          assistant_text: assistantTexts.join('\n'),
          user_uuid: currentUser.uuid ?? '',
          assistant_uuid: lastAssistantUuid ?? '',
          timestamp: currentUser.timestamp ?? '',
        });
      }
      currentUser = msg;
      assistantTexts = [];
      lastAssistantUuid = null;
    } else if (msgType === 'assistant' && currentUser && hasRealText(msg)) {
      const text = extractText(msg.message ?? {});
      if (text.trim()) {
        assistantTexts.push(text);
        lastAssistantUuid = msg.uuid ?? '';
      }
    }
  }

  if (currentUser && assistantTexts.length > 0) {
    exchanges.push({
      user_text: extractText(currentUser.message ?? {}),
      assistant_text: assistantTexts.join('\n'),
      user_uuid: currentUser.uuid ?? '',
      assistant_uuid: lastAssistantUuid ?? '',
      timestamp: currentUser.timestamp ?? '',
    });
  }

  return exchanges;
}

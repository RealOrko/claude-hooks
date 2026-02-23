const MAX_INPUT_LEN = 20000;

export function summarizeToolCall(toolName, toolInput) {
  switch (toolName) {
    case 'Bash':
      return `Bash: ${toolInput.command ?? ''}`.slice(0, 500);

    case 'Edit':
      return `Edit: ${toolInput.file_path ?? ''} [${(toolInput.old_string ?? '').slice(0, 80)} → ${(toolInput.new_string ?? '').slice(0, 80)}]`;

    case 'Write':
      return `Write: ${toolInput.file_path ?? ''} (${(toolInput.content ?? '').length} chars)`;

    case 'Read':
      return `Read: ${toolInput.file_path ?? ''}${toolInput.offset ? ` offset=${toolInput.offset}` : ''}${toolInput.limit ? ` limit=${toolInput.limit}` : ''}`;

    case 'Glob':
      return `Glob: ${toolInput.pattern ?? ''}${toolInput.path ? ` in ${toolInput.path}` : ''}`;

    case 'Grep':
      return `Grep: ${toolInput.pattern ?? ''}${toolInput.path ? ` in ${toolInput.path}` : ''}${toolInput.glob ? ` (${toolInput.glob})` : ''}`;

    case 'WebFetch':
      return `WebFetch: ${toolInput.url ?? ''}`;

    case 'WebSearch':
      return `WebSearch: ${toolInput.query ?? ''}`;

    case 'Task':
      return `Task: [${toolInput.subagent_type ?? ''}] ${toolInput.description ?? ''}`;

    default:
      return `${toolName}: ${JSON.stringify(toolInput).slice(0, 300)}`;
  }
}

export function serializeToolInput(toolInput) {
  const raw = JSON.stringify(toolInput ?? {});
  if (raw.length > MAX_INPUT_LEN) {
    return raw.slice(0, MAX_INPUT_LEN) + '... [truncated]';
  }
  return raw;
}

export function buildEmbeddingText(toolName, toolInput, error) {
  let text = summarizeToolCall(toolName, toolInput);
  if (error) {
    text += `\nError: ${error}`.slice(0, 500);
  }
  return text;
}

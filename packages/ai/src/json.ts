/**
 * JSON that a token limit cut short. Reasoning models spend part of `max_tokens` on thinking, so a
 * reply can stop in the middle of a list. The complete values are kept and the rest is closed, so a
 * reply with four whole questions and half a fifth still yields four.
 */

const CLOSER: Record<string, string> = { '{': '}', '[': ']' };

/** Parses `text` as JSON, or as much of it as is complete. Throws when nothing can be read. */
export function parseJsonLoosely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(completeJson(text));
  }
}

/**
 * Cuts `text` after its last complete value in the shallowest container that has one, drops the
 * dangling comma and closes every open array and object. Text after a complete top-level value is
 * dropped. Throws when the text holds no complete value at all.
 */
export function completeJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  // The best place to cut: the latest point in the shallowest container where a value ended.
  let cut = -1;
  let cutStack: string[] = [];
  const mark = (at: number): void => {
    if (cut < 0 || stack.length <= cutStack.length) {
      cut = at;
      cutStack = [...stack];
    }
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        // A closed string is a whole value inside a list; inside an object it may be a key.
        if (stack[stack.length - 1] === '[') mark(i + 1);
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 0) return text.slice(0, i + 1);
      mark(i + 1);
    } else if (ch === ',') mark(i);
  }
  if (cut < 0) throw new Error('The text holds no complete JSON value.');
  const head = text.slice(0, cut).replace(/,\s*$/, '');
  const closers = cutStack
    .map((open) => CLOSER[open] ?? '')
    .reverse()
    .join('');
  return head + closers;
}

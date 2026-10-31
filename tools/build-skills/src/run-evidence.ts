// Reading evidence from a Claude Code transcript (.jsonl): which files of a project a run opened,
// in what order, whether any twice, whether the README came first, and how long the run took.
// This is how the Reading row of plan section 10 is checked on a real run of a skill.
import { existsSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';

export interface ToolCall {
  at: string;
  name: string;
  input: Record<string, unknown>;
}

interface Transcript {
  calls: ToolCall[];
  first: string | null;
  last: string | null;
}

interface RunEvidence {
  /** Wall-clock seconds from the first to the last event, or null for an empty transcript. */
  seconds: number | null;
  toolCalls: number;
  /** Project files opened, in order, as posix paths relative to the project. A repeat appears again. */
  reads: string[];
  readTwice: string[];
  /** True when the project's README was opened before any code; null when the project has none. */
  readmeFirst: boolean | null;
  /** Distinct files opened that are code, not Markdown or text. */
  codeFiles: number;
  /** Files opened outside the project, as the run named them. */
  outsideProject: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The tool calls of a Claude Code transcript, in order, with the time of its first and last event. */
export function parseTranscript(jsonl: string): Transcript {
  const calls: ToolCall[] = [];
  let first: string | null = null;
  let last: string | null = null;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(event)) continue;
    const at = typeof event.timestamp === 'string' ? event.timestamp : '';
    if (at) {
      first ??= at;
      last = at;
    }
    const content = isRecord(event.message) ? event.message.content : undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (isRecord(block) && block.type === 'tool_use' && typeof block.name === 'string') {
        calls.push({ at, name: block.name, input: isRecord(block.input) ? block.input : {} });
      }
    }
  }
  return { calls, first, last };
}

/** Shell programs that print a file. A search (grep, rg) or a listing opens nothing. */
const READER = /(?:^|[\s;&|(])(?:cat|sed|head|tail|awk|less|more|type|Get-Content|gc)\b/;
const EXT = '(?:[cm]?[jt]sx?|py|rb|go|java|cs|php|md|mmd|markdown|json|ya?ml|toml|txt|html|css|sql|env|sh|ps1)';
/** A path ending in a source or text extension: quoted (it may hold spaces) or bare. */
const FILE_TOKEN = new RegExp(
  `"([^"\\n]+?\\.${EXT})"|'([^'\\n]+?\\.${EXT})'|((?:[A-Za-z]:)?[\\w./\\\\-]+\\.${EXT})\\b`,
  'g',
);
const CD = /(?:^|[\s;&|(])cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/;
const DOC = /\.(md|mmd|markdown|txt)$/i;
const isReadme = (file: string): boolean => /^readme(\.|$)/i.test(basename(file));

/** The files one tool call opened: the Read tool's file, or the files a shell reader printed. */
export function filesRead(call: ToolCall): string[] {
  if (call.name === 'Read') {
    return typeof call.input.file_path === 'string' ? [call.input.file_path] : [];
  }
  if (call.name !== 'Bash' && call.name !== 'PowerShell') return [];
  const command = typeof call.input.command === 'string' ? call.input.command : '';
  if (!READER.test(command)) return [];
  const cd = CD.exec(command);
  const dir = cd?.[1] ?? cd?.[2] ?? cd?.[3] ?? '';
  const files: string[] = [];
  for (const match of command.matchAll(FILE_TOKEN)) {
    const file = match[1] ?? match[2] ?? match[3] ?? '';
    if (file && !files.includes(file)) files.push(file);
  }
  return files.map((file) =>
    isAbsolute(file) || /^[A-Za-z]:/.test(file) ? file : resolve(dir, file),
  );
}

/** What a transcript shows about the reading of one project. */
export function evidenceFrom(transcript: Transcript, root: string): RunEvidence {
  const base = resolve(root);
  const reads: string[] = [];
  const outsideProject: string[] = [];
  for (const call of transcript.calls) {
    for (const file of filesRead(call)) {
      const rel = relative(base, resolve(file)).replaceAll('\\', '/');
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) outsideProject.push(file);
      else reads.push(rel);
    }
  }
  const seen = new Map<string, number>();
  for (const file of reads) seen.set(file, (seen.get(file) ?? 0) + 1);
  const readTwice = [...seen].filter(([, count]) => count > 1).map(([file]) => file);
  const hasReadme = existsSync(base) && readdirSync(base).some(isReadme);
  const readmeAt = reads.findIndex(isReadme);
  const codeAt = reads.findIndex((file) => !DOC.test(file));
  const readmeFirst = hasReadme ? readmeAt >= 0 && (codeAt < 0 || readmeAt < codeAt) : null;
  const seconds =
    transcript.first && transcript.last
      ? (Date.parse(transcript.last) - Date.parse(transcript.first)) / 1000
      : null;
  return {
    seconds,
    toolCalls: transcript.calls.length,
    reads,
    readTwice,
    readmeFirst,
    codeFiles: new Set(reads.filter((file) => !DOC.test(file))).size,
    outsideProject,
  };
}

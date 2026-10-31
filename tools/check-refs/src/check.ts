// The checks behind `npm run check:refs`, apart from the command line so they can be tested.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export interface Problem {
  line: number;
  link: string;
  reason: string;
}

interface Link {
  text: string;
  file: string;
  /** Absent when the link names only the file. */
  from?: number;
  to?: number;
}

// A mention in a sentence is `path/to/file.ext:line`. Only source-file extensions count there, so
// `api.example.com:443` is not read as a link. What follows `@ref` or `@uses` is always a link.
const SOURCE_EXTENSIONS =
  'ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|kt|rb|php|cs|swift|dart|scala|ex|exs|' +
  'css|scss|html|json|ya?ml|toml|env|sql|prisma|graphql|proto|md|txt|sh|ps1';
const MENTION = new RegExp(
  String.raw`(?<![\w/.:-])((?:[\w.-]+/)*[\w.-]+\.(?:${SOURCE_EXTENSIONS})):(\d+)(?:-(\d+))?(?![\w/])`,
  'g',
);
const REF_TAG = /^%%\s*@ref\s+(\S+)/;
const USES_TAG = /^%%\s*@uses\s+\S+\s+\S+\s+(\S+:\d+(?:-\d+)?)(?:\s|$)/;
const URL_LINK = /^https?:\/\//i;
const WITH_LINE = /^(.+?):(\d+)(?:-(\d+))?$/;

function toLink(text: string, file: string, from?: string, to?: string): Link {
  return {
    text,
    file,
    ...(from === undefined ? {} : { from: Number(from) }),
    ...(to === undefined ? {} : { to: Number(to) }),
  };
}

function linksOn(comment: string): Link[] {
  const tagged = REF_TAG.exec(comment)?.[1] ?? USES_TAG.exec(comment)?.[1];
  if (tagged !== undefined) {
    if (URL_LINK.test(tagged)) return [];
    const [, file, from, to] = WITH_LINE.exec(tagged) ?? [];
    return [toLink(tagged, file ?? tagged, from, to)];
  }
  return [...comment.matchAll(MENTION)].map(([text, file = '', from, to]) =>
    toLink(text, file, from, to),
  );
}

/** True when `target` is inside `root` (both absolute), without the prefix trap of startsWith. */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Why this link is broken, or null. A blank line is broken too: the code it named has moved. */
function linkProblem(link: Link, projectRoot: string): string | null {
  const target = resolve(projectRoot, link.file);
  if (!isInside(projectRoot, target)) return 'points outside the project';
  if (!existsSync(target) || !statSync(target).isFile()) return 'file does not exist';
  if (link.from === undefined) return null;
  const last = link.to ?? link.from;
  const text = readFileSync(target, 'utf8');
  const lines = text.split('\n');
  const total = text.endsWith('\n') ? lines.length - 1 : lines.length;
  if (link.from < 1 || last < link.from || last > total) return `file has ${total} lines`;
  const named = lines.slice(link.from - 1, last).join('');
  return named.trim() === '' ? 'points at a blank line' : null;
}

/** Checks every code link in the `%%` comments of one flow, against the project it describes. */
export function checkFlow(
  flowText: string,
  projectRoot: string,
): { links: number; problems: Problem[] } {
  const problems: Problem[] = [];
  let links = 0;
  flowText.split('\n').forEach((text, index) => {
    const comment = text.trim();
    if (!comment.startsWith('%%')) return;
    for (const link of linksOn(comment)) {
      links += 1;
      const reason = linkProblem(link, projectRoot);
      if (reason !== null) problems.push({ line: index + 1, link: link.text, reason });
    }
  });
  return { links, problems };
}

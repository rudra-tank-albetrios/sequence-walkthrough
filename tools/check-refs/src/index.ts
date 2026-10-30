// Checks that every code link in the configured flows points at a file and line that exist
// (plan section 8.12). Run from the repository root:
//   node tools/check-refs/src/index.ts
// refs.json lists each flow file and the project root its links are relative to.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readJsonList, repoRoot } from '@swv/tool-kit';

interface FlowConfig {
  file: string;
  root: string;
}

interface Problem {
  flow: string;
  line: number;
  link: string;
  reason: string;
}

// A code link is `path/to/file.ext:line` or `path/to/file.ext:from-to`, anywhere in a `%%` comment.
const CODE_LINK = /(?<![\w/.:-])((?:[\w.-]+\/)*[\w.-]+\.[a-z]{1,5}):(\d+)(?:-(\d+))?(?![\w/])/g;

const root = repoRoot;

function readConfig(): FlowConfig[] {
  return readJsonList<FlowConfig>(resolve(root, 'tools/check-refs/refs.json'), 'flows');
}

const lineCounts = new Map<string, number>();
function countLines(path: string): number {
  const cached = lineCounts.get(path);
  if (cached !== undefined) return cached;
  const text = readFileSync(path, 'utf8');
  const count = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  lineCounts.set(path, count);
  return count;
}

function checkFlow(flow: FlowConfig): { links: number; problems: Problem[] } {
  const flowPath = resolve(root, flow.file);
  const projectRoot = resolve(root, flow.root);
  const problems: Problem[] = [];
  let links = 0;
  if (!existsSync(flowPath)) {
    return { links, problems: [{ flow: flow.file, line: 0, link: '', reason: 'flow file is missing' }] };
  }
  const lines = readFileSync(flowPath, 'utf8').split('\n');
  lines.forEach((text, index) => {
    if (!text.trimStart().startsWith('%%')) return;
    for (const match of text.matchAll(CODE_LINK)) {
      const [link, file = '', from = '0', to] = match;
      links += 1;
      const target = resolve(projectRoot, file);
      if (!target.startsWith(projectRoot)) {
        problems.push({ flow: flow.file, line: index + 1, link, reason: 'points outside the project' });
        continue;
      }
      if (!existsSync(target)) {
        problems.push({ flow: flow.file, line: index + 1, link, reason: 'file does not exist' });
        continue;
      }
      const total = countLines(target);
      const last = Number(to ?? from);
      if (Number(from) < 1 || last > total) {
        problems.push({ flow: flow.file, line: index + 1, link, reason: `file has ${total} lines` });
      }
    }
  });
  return { links, problems };
}

const flows = readConfig();
if (flows.length === 0) {
  console.log('check-refs: no flows configured in tools/check-refs/refs.json (0 links checked)');
  process.exit(0);
}

let totalLinks = 0;
const allProblems: Problem[] = [];
for (const flow of flows) {
  const { links, problems } = checkFlow(flow);
  totalLinks += links;
  allProblems.push(...problems);
  console.log(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${flow.file}: ${links} link(s)`);
}
for (const problem of allProblems) {
  console.error(`  ${problem.flow}:${problem.line}  ${problem.link}  ${problem.reason}`);
}
if (allProblems.length > 0) {
  console.error(`\ncheck-refs: ${allProblems.length} broken link(s)`);
  process.exit(1);
}
console.log(`\ncheck-refs: ${totalLinks} link(s) in ${flows.length} flow(s) all resolve`);

// Checks that every code link in the configured flows points at a file and line that exist
// (plan section 8.12). Run from the repository root:
//   node tools/check-refs/src/index.ts
// refs.json lists each flow file and the project root its links are relative to.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readJsonList, repoRoot } from '@swv/tool-kit';

import { checkFlow, type Problem } from './check.ts';

interface FlowConfig {
  file: string;
  root: string;
}

const flows = readJsonList<FlowConfig>(resolve(repoRoot, 'tools/check-refs/refs.json'), 'flows');
if (flows.length === 0) {
  console.log('check-refs: no flows configured in tools/check-refs/refs.json (0 links checked)');
  process.exit(0);
}

let totalLinks = 0;
const allProblems: (Problem & { flow: string })[] = [];
for (const flow of flows) {
  const flowPath = resolve(repoRoot, flow.file);
  const { links, problems } = existsSync(flowPath)
    ? checkFlow(readFileSync(flowPath, 'utf8'), resolve(repoRoot, flow.root))
    : { links: 0, problems: [{ line: 0, link: '', reason: 'flow file is missing' }] };
  totalLinks += links;
  allProblems.push(...problems.map((problem) => ({ ...problem, flow: flow.file })));
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

// Prints the reading evidence of one Claude Code transcript. Run from the repository root:
//   node tools/build-skills/src/run-evidence-cli.ts <transcript.jsonl> <project root>
// Claude Code keeps transcripts under ~/.claude/projects/<folder>/, sub agents in its subagents/.
import { readFileSync } from 'node:fs';

import { evidenceFrom, parseTranscript } from './run-evidence.ts';

const [transcript, root] = process.argv.slice(2);
if (!transcript || !root) {
  console.error('Usage: node run-evidence-cli.ts <transcript.jsonl> <project root>');
  process.exit(2);
}
const evidence = evidenceFrom(parseTranscript(readFileSync(transcript, 'utf8')), root);
const readme =
  evidence.readmeFirst === null ? 'no README in the project' : evidence.readmeFirst ? 'yes' : 'no';
const list = (files: string[]) => (files.length > 0 ? files.join(', ') : 'none');
console.log(`wall clock: ${evidence.seconds ?? '?'} s over ${evidence.toolCalls} tool calls`);
console.log(
  `files opened: ${evidence.reads.length} (${new Set(evidence.reads).size} distinct, ${evidence.codeFiles} code)`,
);
console.log(`read twice: ${list(evidence.readTwice)}`);
console.log(`README first: ${readme}`);
console.log(`outside the project: ${list(evidence.outsideProject)}`);
for (const file of evidence.reads) console.log(`  ${file}`);

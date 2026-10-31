import { saveFile } from '../../../shared/lib/files.ts';
import { rasterize } from '../../../shared/lib/raster.ts';
import { diagramSvgString } from '../../../shared/lib/svgExport.ts';
import { fileName } from '../../../shared/lib/util.ts';
import { useDiagramStore } from '../../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../../shared/state/flowStore.ts';
import { useQuizStore } from '../quizStore.ts';
import { flowBlocks, quizBlocks, resultBlocks, type DiagramImage, type DocBlock } from './blocks.ts';
import { blocksToMarkdown } from './markdown.ts';

/** The three downloads of plan section 8.9. */
export type QuizFile = 'quiz' | 'result' | 'flow';
export type QuizFormat = 'md' | 'pdf';

const DIAGRAM_SCALE = 2;

async function diagramImage(): Promise<DiagramImage | null> {
  const svg = await diagramSvgString();
  if (!svg) return null;
  const { width, height, themeBg } = useDiagramStore.getState();
  const { canvas } = await rasterize(svg, width, height, DIAGRAM_SCALE, themeBg);
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** Builds the file from the quiz as it is now, and saves it. */
export async function saveQuizFile(file: QuizFile, format: QuizFormat, withAnswers: boolean): Promise<void> {
  const state = useQuizStore.getState();
  const { flow, questions, phase } = state;
  if (!flow) return;
  const doc = { flow, questions };
  const result = (): DocBlock[] =>
    resultBlocks({
      ...doc,
      answers: state.answers,
      marks: state.marks,
      time: state.config.time,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      autoSubmitted: state.autoSubmitted,
    });
  let blocks: DocBlock[];
  let name: string;
  if (file === 'result') {
    blocks = result();
    name = 'result';
  } else if (file === 'quiz') {
    blocks = quizBlocks(doc, withAnswers);
    name = withAnswers ? 'quiz with answers' : 'quiz';
  } else {
    blocks = [
      ...(phase === 'result' ? result() : quizBlocks(doc, withAnswers)),
      ...flowBlocks(flow.title, useFlowStore.getState().code, await diagramImage()),
    ];
    name = 'quiz with flow';
  }
  const title = `${flow.title} - ${name}`;
  if (format === 'md') {
    await saveFile(fileName(title, 'md'), blocksToMarkdown(blocks), 'text/markdown');
    return;
  }
  const { blocksToPdf } = await import('./pdf.ts');
  await saveFile(fileName(title, 'pdf'), await blocksToPdf(title, blocks), 'application/pdf');
}

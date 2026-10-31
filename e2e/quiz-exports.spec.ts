import { expect, test, type Locator, type Page } from '@playwright/test';
import { extractText, getDocumentProxy } from 'unpdf';

import { mdText as md } from '../apps/web/src/shared/lib/markdown.ts';
import { DEMO_TITLE, demoFlow, download, open, type SavedFile } from './helpers.ts';
import {
  answerAllWrong,
  EASY_CHOICE,
  freezeClock,
  openQuiz,
  questionItems,
  questionText,
  sampleFor,
  startQuiz,
  submitQuiz,
  watchErrors,
} from './support/quiz.ts';

// The Exports row of plan section 10 for the quiz's downloads (plan 8.9): the quiz with or
// without answers, the result, and either with the flow, in Markdown and PDF. Each file opens
// and holds what it should. The built-in sample needs no model.

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});

test.afterEach(() => {
  expect(errors, 'console errors or uncaught exceptions').toEqual([]);
});

interface PdfText {
  pages: number;
  text: string;
}

/** Opens the PDF for real and reads its text and page count. */
async function readPdf(file: SavedFile): Promise<PdfText> {
  expect(file.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { pages: totalPages, text: text.replace(/\s+/g, ' ') };
}

/** Opens the Downloads panel and saves one file. */
async function save(page: Page, dialog: Locator, name: string): Promise<SavedFile> {
  const details = dialog.locator('details').filter({ hasText: 'Downloads' });
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  return download(page, () => dialog.getByRole('button', { name, exact: true }).click());
}

/** The sample's text for every question on screen, in order. */
async function shown(dialog: Locator) {
  const texts: string[] = [];
  for (const item of await questionItems(dialog).all()) texts.push(await questionText(item));
  return texts.map((text) => sampleFor(text));
}

test.describe('Quiz downloads', () => {
  test('X1 the quiz, without and with answers, as Markdown and PDF', async ({ page }) => {
    await open(page);
    const dialog = await openQuiz(page);
    await startQuiz(dialog, EASY_CHOICE);
    const samples = await shown(dialog);

    const plain = await save(page, dialog, 'Quiz as Markdown');
    expect(plain.name).toBe(`${DEMO_TITLE} - quiz.md`);
    expect(plain.text.startsWith(`# ${DEMO_TITLE}: quiz\n\n5 questions, without answers.`)).toBe(
      true,
    );
    samples.forEach((sample, i) => {
      expect(plain.text).toContain(`### ${i + 1}. ${md(sample.question)}`);
      for (const option of sample.options ?? [])
        expect(plain.text).toContain(`- [ ] ${md(option)}`);
    });
    expect(plain.text).toMatch(/\*Step \d+: .*\. Multiple choice\. Easy\*/);
    expect(plain.text).not.toContain('Correct answer');
    expect(plain.text).not.toContain('- [x]');

    await dialog.getByRole('checkbox', { name: 'Include the answers in the quiz' }).check();
    const answered = await save(page, dialog, 'Quiz as Markdown');
    expect(answered.name).toBe(`${DEMO_TITLE} - quiz with answers.md`);
    expect(answered.text).toContain('5 questions, with answers.');
    for (const sample of samples) {
      expect(answered.text).toContain(`- [x] ${md(sample.answer)}`);
      expect(answered.text).toContain(`**Correct answer:** ${md(sample.answer)}`);
      expect(answered.text).toContain(`**Reason:** ${md(sample.why)}`);
    }

    const pdf = await readPdf(await save(page, dialog, 'Quiz as PDF'));
    expect(pdf.pages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain(`${DEMO_TITLE}: quiz`);
    expect(pdf.text).toContain('5 questions, with answers');
    for (const sample of samples) {
      expect(pdf.text).toContain(sample.question);
      expect(pdf.text).toContain(`Correct answer: ${sample.answer}`);
    }
  });

  test('X2 the result, as Markdown and PDF, with score, time, marks and feedback', async ({
    page,
  }) => {
    await page.clock.install();
    await open(page);
    const dialog = await openQuiz(page);
    await freezeClock(page);
    await expect(dialog.getByRole('button', { name: 'Result as Markdown' })).toHaveCount(0);
    await startQuiz(dialog, EASY_CHOICE);
    await expect(dialog.getByRole('button', { name: 'Result as Markdown' })).toHaveCount(0);
    const samples = await shown(dialog);
    await answerAllWrong(dialog);
    await page.clock.fastForward(72_000);
    await submitQuiz(dialog);

    const file = await save(page, dialog, 'Result as Markdown');
    expect(file.name).toBe(`${DEMO_TITLE} - result.md`);
    expect(
      file.text.startsWith(
        `# ${DEMO_TITLE}: quiz result\n\n${md('Score: 0 of 5 (0%)')}\n\nTime: 1:12.`,
      ),
    ).toBe(true);
    expect(file.text).toContain('## Score per chapter\n\n| Chapter | Score |');
    expect(file.text).toContain(
      `## Score per difficulty\n\n| Difficulty | Score |\n| --- | --- |\n| Easy | ${md('0 of 5 (0%)')} |`,
    );
    expect(file.text).toContain('## Weak points found\n\n| Topic | Answers that fell short |');
    expect(file.text).toContain('## Questions and answers');
    for (const sample of samples) {
      const wrong = (sample.options ?? []).find((option) => option !== sample.answer);
      expect(file.text).toContain(`**Your answer:** ${md(wrong ?? '')}`);
      expect(file.text).toContain(`**Correct answer:** ${md(sample.answer)}`);
    }
    expect(file.text).toContain('**Mark:** Wrong');
    expect(file.text).not.toContain('AI marked');

    const pdf = await readPdf(await save(page, dialog, 'Result as PDF'));
    expect(pdf.pages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain(`${DEMO_TITLE}: quiz result`);
    expect(pdf.text).toContain('Score: 0 of 5 (0%)');
    expect(pdf.text).toContain('Time: 1:12.');
    expect(pdf.text).toContain('Score per chapter');
    expect(pdf.text).toContain('Mark: Wrong');
  });

  test('X3 the quiz with the flow carries the diagram image and the Mermaid code', async ({
    page,
  }) => {
    await open(page);
    const dialog = await openQuiz(page);
    await startQuiz(dialog, EASY_CHOICE);

    const file = await save(page, dialog, 'Quiz with flow as Markdown');
    expect(file.name).toBe(`${DEMO_TITLE} - quiz with flow.md`);
    expect(file.text.startsWith(`# ${DEMO_TITLE}: quiz\n`)).toBe(true);
    expect(file.text).toContain(
      '## The flow\n\nThe diagram and its Mermaid code, as they were on screen.',
    );
    expect(file.text).toContain(`![Diagram of ${DEMO_TITLE}](data:image/png;base64,`);
    expect(file.text).toContain('## Mermaid code\n\n```mermaid\n');
    expect(file.text).toContain(demoFlow().trim());

    const pdf = await readPdf(await save(page, dialog, 'Quiz with flow as PDF'));
    // The questions, then a page for the diagram, then the code.
    expect(pdf.pages).toBeGreaterThanOrEqual(3);
    expect(pdf.text).toContain(`${DEMO_TITLE}: quiz`);
    expect(pdf.text).toContain('The flow');
    expect(pdf.text).toContain('Mermaid code');
    expect(pdf.text).toContain('sequenceDiagram');
    expect(pdf.text).toContain('%% @title Place an order');

    await answerAllWrong(dialog);
    await submitQuiz(dialog);
    const result = await save(page, dialog, 'Quiz with flow as Markdown');
    expect(result.text.startsWith(`# ${DEMO_TITLE}: quiz result\n`)).toBe(true);
    expect(result.text).toContain('## Mermaid code');
  });
});

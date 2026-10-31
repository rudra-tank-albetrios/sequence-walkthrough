import { DEFAULT_TITLE, type Flow } from '@swv/core';

import { liveLink } from '../../shared/lib/codec.ts';
import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { allTerms, useGlossaryStore } from '../../shared/state/glossaryStore.ts';
import { toast } from '../../shared/ui/toast.ts';
import { copyWithFallback, exportName, inArtifact, saveFile } from './files.ts';
import { makePdf, type PdfOptions } from './pdf.ts';
import { canvasBlob, rasterize } from './raster.ts';
import { liveLinkText, openInNewTab, viewerLink } from './share.ts';
import { cropRaster, pinnedHeader, visibleCrop } from './stepImage.ts';
import { diagramSvgString } from './svgExport.ts';
import { csvText, markdownText } from './table.ts';

/** What each item of the Export menu does. Every action reads the stores when it runs. */

export const SKILL_KIT_FILE = 'sequence-walkthrough-skill-kit.zip';

const title = (): string => useFlowStore.getState().flow?.title ?? DEFAULT_TITLE;

const nothingYet = (): void => {
  toast('Nothing to export yet');
};

/** The flow when it is a sequence diagram, else a toast and null. */
function sequenceFlow(): Flow | null {
  const { flow } = useFlowStore.getState();
  if (!flow?.isSequence) {
    toast('The step table works with sequence diagrams');
    return null;
  }
  return flow;
}

/** Runs an export; a failure becomes a toast instead of an unhandled rejection. */
export function run(action: () => Promise<void>): void {
  action().catch((error: unknown) => {
    toast(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

export async function exportSvg(): Promise<void> {
  const svg = await diagramSvgString();
  if (!svg) {
    nothingYet();
    return;
  }
  await saveFile(exportName(title(), 'svg'), svg, 'image/svg+xml');
}

export async function exportPng(scale: 1 | 2 | 4): Promise<void> {
  const svg = await diagramSvgString();
  if (!svg) {
    nothingYet();
    return;
  }
  const { width, height, themeBg } = useDiagramStore.getState();
  const raster = await rasterize(svg, width, height, scale, themeBg);
  if (raster.scale < scale) toast(`The diagram is large, so the PNG uses ${raster.scale.toFixed(1)}×`);
  await saveFile(exportName(title(), 'png'), await canvasBlob(raster.canvas), 'image/png');
}

/** The visible part of the live diagram with the current step's highlights; the whole diagram on the overview. */
export async function exportStepImage(): Promise<void> {
  const { width, height, themeBg, commands } = useDiagramStore.getState();
  const { cur } = useFlowStore.getState();
  const live = commands.svgElement();
  const svg = await diagramSvgString(live);
  if (!svg) {
    nothingYet();
    return;
  }
  const crop = live && cur >= 0 ? visibleCrop(live, width, height) : null;
  const raster = await rasterize(svg, width, height, Math.max(1, Math.min(4, (crop?.k ?? 0.5) * 2)), themeBg);
  const canvas = crop && live ? cropRaster(raster, crop, pinnedHeader(live), themeBg) : raster.canvas;
  const suffix = cur >= 0 ? `step ${cur + 1}` : 'overview';
  await saveFile(exportName(`${title()} - ${suffix}`, 'png'), await canvasBlob(canvas), 'image/png');
}

export async function exportCode(): Promise<void> {
  const { code } = useFlowStore.getState();
  await saveFile(exportName(title(), 'mmd'), code, 'text/plain');
}

export async function exportCsv(): Promise<void> {
  const flow = sequenceFlow();
  if (!flow) return;
  await saveFile(exportName(title(), 'csv'), csvText(flow), 'text/csv');
}

export async function copyMarkdown(): Promise<void> {
  const flow = sequenceFlow();
  if (!flow) return;
  const terms = allTerms(flow, useGlossaryStore.getState().saved);
  await copyWithFallback(markdownText(flow, { terms }), 'Copied the step table as Markdown');
}

export async function exportPdf(options: PdfOptions): Promise<void> {
  toast('Making the PDF…');
  const result = await makePdf(options);
  if (!result) {
    nothingYet();
    return;
  }
  await saveFile(exportName(title(), 'pdf'), result.blob, 'application/pdf');
}

export async function openLive(): Promise<void> {
  const { code, settings } = useFlowStore.getState();
  openInNewTab(await liveLink(code, settings.theme, settings.grid));
}

export async function copyLiveLink(): Promise<void> {
  const { code, settings } = useFlowStore.getState();
  const share = await liveLinkText(code, settings.theme, settings.grid);
  await copyWithFallback(share.text, share.message);
}

export async function copyViewerLink(withStep: boolean): Promise<void> {
  const { code, cur } = useFlowStore.getState();
  const share = await viewerLink(code, withStep ? cur : null, window.location.href, inArtifact());
  await copyWithFallback(share.text, share.message);
}

/** The skill kit zip built next to the page by the Vite plugin. */
export async function downloadSkillKit(): Promise<void> {
  try {
    const response = await fetch(`./${SKILL_KIT_FILE}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('the server did not send a zip file');
    await saveFile(SKILL_KIT_FILE, bytes, 'application/zip');
  } catch (error) {
    toast(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

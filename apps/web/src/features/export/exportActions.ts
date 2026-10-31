import { DEFAULT_TITLE } from '@swv/core';

import { liveLink } from '../../shared/lib/codec.ts';
import { copyWithFallback, inArtifact, saveFile } from '../../shared/lib/files.ts';
import { fileName } from '../../shared/lib/util.ts';
import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';
import { makePdf, type PdfOptions } from './pdf.ts';
import { canvasBlob, rasterize } from './raster.ts';
import { liveLinkText, openInNewTab, viewerLink } from './share.ts';
import { cropRaster, pinnedHeader, visibleCrop } from './stepImage.ts';
import { diagramSvgString } from './svgExport.ts';

/** What each item of the Export menu does. Every action reads the stores when it runs. */

const title = (): string => useFlowStore.getState().flow?.title ?? DEFAULT_TITLE;

const nothingYet = (): void => {
  toast('Nothing to export yet');
};

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
  await saveFile(fileName(title(), 'svg'), svg, 'image/svg+xml');
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
  await saveFile(fileName(title(), 'png'), await canvasBlob(raster.canvas), 'image/png');
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
  await saveFile(fileName(`${title()} - ${suffix}`, 'png'), await canvasBlob(canvas), 'image/png');
}

export async function exportCode(): Promise<void> {
  const { code } = useFlowStore.getState();
  await saveFile(fileName(title(), 'mmd'), code, 'text/plain');
}

export async function exportPdf(options: PdfOptions): Promise<void> {
  toast('Making the PDF…');
  const result = await makePdf(options);
  if (!result) {
    nothingYet();
    return;
  }
  await saveFile(fileName(title(), 'pdf'), result.blob, 'application/pdf');
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

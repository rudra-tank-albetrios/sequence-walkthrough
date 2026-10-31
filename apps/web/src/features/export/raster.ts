/** Drawing an SVG string on a canvas, within the sizes browsers accept. */

export const MAX_SIDE = 16000;
export const MAX_AREA = 120e6;

/** Lowers the scale by 0.8 steps while the canvas would be too large, down to 0.25. */
export function fitScale(width: number, height: number, scale: number): number {
  let s = scale;
  while (s > 0.25 && (width * s > MAX_SIDE || height * s > MAX_SIDE || width * height * s * s > MAX_AREA)) {
    s *= 0.8;
  }
  return s;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The browser gave no drawing context');
  return ctx;
}

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export interface Raster {
  canvas: HTMLCanvasElement;
  /** The scale actually used, after the size limits. */
  scale: number;
}

export async function rasterize(
  svgText: string,
  width: number,
  height: number,
  scale: number,
  background: string,
): Promise<Raster> {
  const s = fitScale(width, height, scale);
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = makeCanvas(width * s, height * s);
    const ctx = context2d(canvas);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, scale: s };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The image could not be encoded'));
    }, type);
  });
}

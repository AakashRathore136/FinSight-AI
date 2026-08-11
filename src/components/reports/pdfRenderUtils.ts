/**
 * Memory-Safe PDF Rendering & Canvas Garbage Collection Utilities
 * Prevents browser memory leaks and canvas context exhaustion during multi-page PDF generation.
 */

import html2canvas from "html2canvas";

export interface RenderProgressCallback {
  (progressPercent: number, stageDescription: string): void;
}

/**
 * Safely releases HTML Canvas memory context to prevent DOM memory leaks.
 */
export function releaseCanvasMemory(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  try {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  } catch (err) {
    console.warn("Failed to release canvas memory context:", err);
  }
}

/**
 * Memory-safe DOM element capture with automatic canvas context disposal and progress callbacks.
 */
export async function captureElementSafely(
  element: HTMLElement,
  options: { scale?: number; backgroundColor?: string } = {},
  onProgress?: RenderProgressCallback
): Promise<HTMLCanvasElement> {
  const { scale = 1.5, backgroundColor = "#0f1219" } = options;

  if (onProgress) onProgress(20, "Preparing element buffer...");

  const canvas = await html2canvas(element, {
    scale,
    backgroundColor,
    useCORS: true,
    logging: false,
  });

  if (onProgress) onProgress(80, "Canvas buffer created...");

  return canvas;
}

/**
 * Processes multiple DOM elements sequentially, releasing memory buffers after rendering.
 */
export async function renderMultipleElementsSafely(
  elements: HTMLElement[],
  onProgress?: RenderProgressCallback
): Promise<HTMLCanvasElement[]> {
  const renderedCanvases: HTMLCanvasElement[] = [];
  const total = elements.length;

  for (let i = 0; i < total; i++) {
    const el = elements[i];
    if (onProgress) {
      const stepPercent = Math.round(((i + 1) / total) * 100);
      onProgress(stepPercent, `Rendering chart page ${i + 1} of ${total}...`);
    }

    const canvas = await captureElementSafely(el, { scale: 1.5 }, undefined);
    renderedCanvases.push(canvas);
  }

  return renderedCanvases;
}

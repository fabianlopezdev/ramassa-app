import { AppError } from '../errors';
import { getUploadKindForContentType } from '../schemas/upload';
import { tokens } from '../tokens';
import type { UploadFileContent } from './upload-client';

const IMAGE_COMPRESSION_QUALITIES = [0.82, 0.68, 0.54] as const;

export interface ImageBitmapLike {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface CanvasContextLike {
  drawImage(image: ImageBitmapLike, x: number, y: number, width: number, height: number): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: '2d'): CanvasContextLike | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

export interface BrowserImageCompressionDependencies {
  readonly createBitmap: (source: Blob) => Promise<ImageBitmapLike>;
  readonly createCanvas: () => CanvasLike;
}

interface BrowserCompressionGlobals {
  readonly createImageBitmap?: (source: Blob) => Promise<ImageBitmapLike>;
  readonly document?: {
    createElement(name: 'canvas'): CanvasLike;
  };
}

function browserDependencies(): BrowserImageCompressionDependencies {
  const browser = globalThis as unknown as BrowserCompressionGlobals;
  if (browser.createImageBitmap === undefined || browser.document === undefined) {
    throw new AppError('UPLOAD-1', { message: 'Browser image APIs are unavailable' });
  }
  return {
    createBitmap: browser.createImageBitmap.bind(globalThis),
    createCanvas: () => browser.document!.createElement('canvas'),
  };
}

function sourceBlob(file: UploadFileContent): Blob {
  if (file.data instanceof Blob) return file.data;
  if (file.data instanceof ArrayBuffer) {
    return new Blob([file.data], { type: file.contentType });
  }
  return new Blob([file.data.slice().buffer], { type: file.contentType });
}

function scaledDimensions(width: number, height: number): { width: number; height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= tokens.upload.maxImageDimension) return { width, height };
  const ratio = tokens.upload.maxImageDimension / longestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function encodeCanvas(canvas: CanvasLike, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new AppError('UPLOAD-1', { message: 'Browser could not encode the image' }));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export async function compressBrowserImage(
  file: UploadFileContent,
  dependencies: BrowserImageCompressionDependencies = browserDependencies(),
): Promise<UploadFileContent> {
  if (getUploadKindForContentType(file.contentType) !== 'image') return file;

  const original = sourceBlob(file);
  const bitmap = await dependencies.createBitmap(original);
  try {
    const dimensions = scaledDimensions(bitmap.width, bitmap.height);
    const canvas = dependencies.createCanvas();
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new AppError('UPLOAD-1', { message: 'Browser canvas is unavailable' });
    }
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

    const candidates = await Promise.all(
      IMAGE_COMPRESSION_QUALITIES.map((quality) => encodeCanvas(canvas, file.contentType, quality)),
    );
    const smallest = candidates.reduce((best, candidate) =>
      candidate.size < best.size ? candidate : best,
    );
    const chosen = smallest.size < original.size ? smallest : original;

    if (chosen.size > tokens.upload.maxImageBytes) {
      throw new AppError('UPLOAD-3');
    }
    return {
      data: chosen,
      contentType: file.contentType,
      byteLength: chosen.size,
    };
  } finally {
    bitmap.close();
  }
}

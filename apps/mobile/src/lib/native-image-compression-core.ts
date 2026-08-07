import { AppError } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';
import type { UploadFileContent } from '@ramassa/shared/upload-client';

const NATIVE_IMAGE_QUALITIES = [0.82, 0.68, 0.54] as const;
const MIN_IMAGE_DIMENSION_PIXELS = 1;

export interface NativeStoryImageSource {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

interface NativeImageResult {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

interface NativeImageRefLike {
  saveAsync(options: { readonly compress: number }): Promise<NativeImageResult>;
}

interface NativeImageContextLike {
  resize(dimensions: { readonly width: number; readonly height: number }): unknown;
  renderAsync(): Promise<NativeImageRefLike>;
}

export interface NativeImageCompressionDependencies {
  readonly manipulate: (uri: string) => NativeImageContextLike;
  readonly readBytes: (uri: string) => Promise<Uint8Array>;
}

export interface CompressedNativeStoryImage extends UploadFileContent {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export function scaledStoryImageDimensions(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= tokens.upload.maxImageDimension) return { width, height };
  const scale = tokens.upload.maxImageDimension / longestEdge;
  return {
    width: Math.max(MIN_IMAGE_DIMENSION_PIXELS, Math.round(width * scale)),
    height: Math.max(MIN_IMAGE_DIMENSION_PIXELS, Math.round(height * scale)),
  };
}

export async function compressNativeStoryImageWithDependencies(
  source: NativeStoryImageSource,
  dependencies: NativeImageCompressionDependencies,
): Promise<CompressedNativeStoryImage> {
  const context = dependencies.manipulate(source.uri);
  const dimensions = scaledStoryImageDimensions(source.width, source.height);
  context.resize(dimensions);
  const image = await context.renderAsync();

  for (const quality of NATIVE_IMAGE_QUALITIES) {
    const saved = await image.saveAsync({ compress: quality });
    const bytes = await dependencies.readBytes(saved.uri);
    if (bytes.byteLength <= tokens.upload.maxImageBytes) {
      return {
        uri: saved.uri,
        width: saved.width,
        height: saved.height,
        data: bytes,
        contentType: 'image/jpeg',
        byteLength: bytes.byteLength,
      };
    }
  }

  throw new AppError('UPLOAD-3');
}

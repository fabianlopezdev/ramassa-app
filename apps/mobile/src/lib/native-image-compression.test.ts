import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';
import {
  compressNativeStoryImageWithDependencies,
  type NativeImageCompressionDependencies,
} from './native-image-compression-core';

describe('native story image compression', () => {
  test('scales to 1200 px and retries JPEG quality until the file fits the media cap', async () => {
    const qualities: number[] = [];
    const dependencies: NativeImageCompressionDependencies = {
      manipulate: () => ({
        resize: (dimensions) => {
          expect(dimensions).toEqual({ width: 1200, height: 600 });
        },
        renderAsync: async () => ({
          saveAsync: async ({ compress }) => {
            qualities.push(compress);
            return { uri: `file:///compressed-${compress}.jpg`, width: 1200, height: 600 };
          },
        }),
      }),
      readBytes: async (uri) =>
        new Uint8Array(uri.includes('0.82') ? tokens.upload.maxImageBytes + 1 : 640_000),
    };

    const result = await compressNativeStoryImageWithDependencies(
      { uri: 'file:///original.heic', width: 2400, height: 1200 },
      dependencies,
    );

    expect(qualities).toEqual([0.82, 0.68]);
    expect(result.contentType).toBe('image/jpeg');
    expect(result.byteLength).toBe(640_000);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(600);
  });

  test('fails with the upload size code when every compressed candidate is too large', async () => {
    const dependencies: NativeImageCompressionDependencies = {
      manipulate: () => ({
        resize: () => undefined,
        renderAsync: async () => ({
          saveAsync: async () => ({ uri: 'file:///large.jpg', width: 1200, height: 1200 }),
        }),
      }),
      readBytes: async () => new Uint8Array(tokens.upload.maxImageBytes + 1),
    };

    await expect(
      compressNativeStoryImageWithDependencies(
        { uri: 'file:///original.jpg', width: 2400, height: 2400 },
        dependencies,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'UPLOAD-3' }) as AppError);
  });
});

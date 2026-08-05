import { describe, expect, test } from 'bun:test';
import {
  compressBrowserImage,
  type BrowserImageCompressionDependencies,
} from './image-compression';

describe('browser image compression', () => {
  test('scales the longest edge, produces fewer bytes, and preserves the MIME type', async () => {
    const source = new Blob([new Uint8Array(4_096)], { type: 'image/jpeg' });
    const output = new Blob([new Uint8Array(512)], { type: 'image/jpeg' });
    const drawn: number[] = [];
    let closed = false;

    const dependencies: BrowserImageCompressionDependencies = {
      createBitmap: async () => ({
        width: 2_400,
        height: 1_200,
        close: () => {
          closed = true;
        },
      }),
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (_image, _x, _y, width, height) => drawn.push(width, height),
        }),
        toBlob: (callback, type) => {
          expect(type).toBe('image/jpeg');
          callback(output);
        },
      }),
    };

    const compressed = await compressBrowserImage(
      {
        data: source,
        contentType: 'image/jpeg',
        byteLength: source.size,
      },
      dependencies,
    );

    expect(compressed.byteLength).toBeLessThan(source.size);
    expect(compressed.contentType).toBe('image/jpeg');
    expect((compressed.data as Blob).type).toBe('image/jpeg');
    expect(drawn).toEqual([1_200, 600]);
    expect(closed).toBe(true);
  });

  test('keeps a smaller original when canvas encoding would make it larger', async () => {
    const source = new Blob([new Uint8Array(256)], { type: 'image/png' });
    const dependencies: BrowserImageCompressionDependencies = {
      createBitmap: async () => ({ width: 100, height: 100, close: () => undefined }),
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback) => callback(new Blob([new Uint8Array(512)], { type: 'image/png' })),
      }),
    };

    const compressed = await compressBrowserImage(
      { data: source, contentType: 'image/png', byteLength: source.size },
      dependencies,
    );

    expect(compressed.data).toBe(source);
    expect(compressed.byteLength).toBe(source.size);
  });
});

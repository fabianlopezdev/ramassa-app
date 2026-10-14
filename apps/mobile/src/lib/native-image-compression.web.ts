/**
 * The web build's photo compression (RAPP-344): the same steps as the phone,
 * with the bytes read through `fetch`, because expo-file-system has no web
 * support. The web build exists for the browser specs, so they can cover
 * every photo upload path.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  compressNativeStoryImageWithDependencies,
  type NativeStoryImageSource,
} from './native-image-compression-core';

export * from './native-image-compression-core';

const webImageCompressionDependencies = {
  manipulate: (uri: string) => {
    const context = ImageManipulator.manipulate(uri);
    return {
      resize: (dimensions: { readonly width: number; readonly height: number }) =>
        context.resize(dimensions),
      renderAsync: async () => {
        const image = await context.renderAsync();
        return {
          saveAsync: ({ compress }: { readonly compress: number }) =>
            image.saveAsync({ compress, format: SaveFormat.JPEG }),
        };
      },
    };
  },
  readBytes: async (uri: string) => new Uint8Array(await (await fetch(uri)).arrayBuffer()),
};

export async function compressNativeStoryImage(
  source: NativeStoryImageSource,
  dependencies = webImageCompressionDependencies,
) {
  return compressNativeStoryImageWithDependencies(source, dependencies);
}

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  compressNativeStoryImageWithDependencies,
  type NativeStoryImageSource,
} from './native-image-compression-core';

export * from './native-image-compression-core';

export async function compressNativeStoryImage(
  source: NativeStoryImageSource,
  dependencies = {
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
    readBytes: (uri: string) => new File(uri).bytes(),
  },
) {
  return compressNativeStoryImageWithDependencies(source, dependencies);
}

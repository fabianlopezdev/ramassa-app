// An imported image file is an image source the bundler resolves (RAPP-835).
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const source: ImageSourcePropType;
  export default source;
}

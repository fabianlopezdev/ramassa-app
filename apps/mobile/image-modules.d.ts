// An imported image file is an image source the bundler resolves (RAPP-835).
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const source: ImageSourcePropType;
  export default source;
}

// An imported video file is a bundled asset the player resolves (RAPP-955).
declare module '*.mp4' {
  const source: number;
  export default source;
}

/** Metro bundles SVGs as image assets, consumed by expo-image. */
declare module '*.svg' {
  const asset: number;
  export default asset;
}

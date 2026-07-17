const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// expo/metro-config detects the bun workspace root automatically (SDK 52+),
// so watchFolders and nodeModulesPaths cover the whole monorepo without
// manual configuration.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css' });

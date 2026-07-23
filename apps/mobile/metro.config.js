const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

// getSentryExpoConfig wraps expo/metro-config's defaults (workspace root
// detection included) and additionally stamps Debug IDs on bundles and source
// maps so Sentry can symbolicate release stack traces (RAPP-12).
const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css' });

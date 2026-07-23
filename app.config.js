// GUARD (RAPP-13) — this file exists only to fail fast.
//
// This is the bun-workspaces MONOREPO ROOT, not an Expo app. The Expo app is
// `apps/mobile`. Expo reads its config from the current working directory, so
// if someone runs `bunx expo start|run:ios|prebuild` here, this throws before
// Expo can do any damage.
//
// Without this guard, Expo treats the root as the app and silently:
//   - writes a stray root `app.json`,
//   - prebuilds a duplicate ~1.2 GB `ios/` project that has NONE of the mobile
//     app's autolinked native modules (runtime: "Cannot find native module
//     'ExpoLinking'"),
//   - adds `expo` / `react-native` to the root package.json and rewrites
//     bun.lock,
//   - and bundles `expo/AppEntry.js` instead of `expo-router/entry`, failing
//     with "Unable to resolve module ../../App".
//
// Run one of these instead:
//   bun run mobile:start   /  bun run mobile:ios   /  bun run mobile:android
//   (or: cd apps/mobile && bunx expo run:ios)

throw new Error(
  'Do not run Expo from the monorepo root. The Expo app is apps/mobile.\n' +
    'Use: bun run mobile:ios  |  bun run mobile:start  |  bun run mobile:android\n' +
    '(or cd apps/mobile first).',
);

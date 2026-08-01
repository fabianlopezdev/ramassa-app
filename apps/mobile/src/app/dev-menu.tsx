import { Redirect } from 'expo-router';

/**
 * The developer menu route (RAPP-19), and the gate that keeps it out of release
 * builds.
 *
 * The gate is the `require` INSIDE the `__DEV__` branch, not the branch itself.
 * A plain `import` at the top of this file would put the dev screen, the seeded
 * account roster, and the seed password into every production bundle no matter
 * what the component then decided to render, because Metro collects
 * dependencies from the module graph, not from what runs. Written this way,
 * Metro inlines `__DEV__` to `false`, folds the dead branch away, and never
 * reaches the require, so nothing under `components/dev` or `lib/dev` is
 * bundled at all.
 *
 * Guarded by `tests/dev-menu-production-gate.test.ts` on every commit, and
 * proved end to end by `scripts/verify-dev-menu-excluded.sh`, which exports a
 * real production bundle and greps it.
 *
 * The route PATH still exists in a release build (Expo Router enumerates
 * `src/app` with `require.context`), so it is answered here with a redirect
 * rather than left to render an empty screen.
 */

// A crash inside a dev section (the error triggers throw on purpose) shows the
// translated fallback here instead of taking the whole app down.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

export default function DevMenuRoute() {
  if (__DEV__) {
    const { DevMenuScreen } =
      require('@/components/dev/dev-menu-screen') as typeof import('@/components/dev/dev-menu-screen');
    return <DevMenuScreen />;
  }
  return <Redirect href="/" />;
}

/**
 * EAS Build's `eas-build-pre-install` hook (RAPP-616): a native production
 * build never carries the staging test sign-in flag.
 *
 * `bun run deploy:check-env` guards the web deploys only. A phone build reads
 * `EXPO_PUBLIC_TEST_SIGN_IN` from its EAS profile or environment and inlines
 * it, so the check runs on the build server too, before anything is installed.
 * A hook that exits non-zero stops the build.
 *
 * Sources: https://docs.expo.dev/build-reference/npm-hooks/ (the hook names,
 * set in package.json `scripts`) and
 * https://docs.expo.dev/eas/environment-variables/usage/ (`EAS_BUILD_PROFILE`,
 * "the build profile name from eas.json", set on every build job).
 *
 * No imports: it runs before the dependencies are installed.
 */

/** The build's environment: `EAS_BUILD_PROFILE` and `EXPO_PUBLIC_TEST_SIGN_IN` are read. */
export type EasBuildEnv = Readonly<Record<string, string | undefined>>;

/** Throws when a production profile carries the flag with any value but off. */
export function checkEasBuildEnv(env: EasBuildEnv): void {
  const profile = env['EAS_BUILD_PROFILE']?.trim() ?? '';
  const flag = env['EXPO_PUBLIC_TEST_SIGN_IN']?.trim() ?? '';
  if (profile.startsWith('production') && flag !== '' && flag !== 'false') {
    throw new Error(
      `EXPO_PUBLIC_TEST_SIGN_IN must never be set for a production build (profile "${profile}")`,
    );
  }
}

if (import.meta.main) {
  try {
    checkEasBuildEnv(process.env);
    console.log('EAS build environment is valid.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid EAS build environment');
    process.exit(1);
  }
}

/**
 * Dynamic app config (RAPP-620). `app.json` stays the single base config;
 * Expo reads it first and passes it here as `config`
 * (https://docs.expo.dev/workflow/configuration/, "Dynamic configuration").
 *
 * Variants follow https://docs.expo.dev/tutorial/eas/multiple-app-variants/:
 * the build profile sets `APP_VARIANT` in its `env`, and this file switches the
 * identity on it.
 *
 * - `APP_VARIANT` unset: the normal app. The config is returned untouched, so
 *   production, development and preview resolve exactly as from app.json.
 * - `APP_VARIANT=staging`: "Ramassà Staging", Android `com.ramassa.app.staging`,
 *   installed next to the real app and pointed at staging by the EAS "preview"
 *   environment. Only this variant takes over-the-air updates.
 *
 * iOS staging waits for Fabián's choice between Ramassà's Apple enrolment and a
 * temporary Fabulous Apps identifier (RAPP-83). Until `STAGING_IOS_BUNDLE_ID`
 * is set, the staging config has no iOS bundle identifier, so EAS CLI stops an
 * iOS build before it creates credentials, and any iOS native step (prebuild,
 * run:ios, the build worker) throws the reason below.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withInfoPlist } from 'expo/config-plugins';

/** The variant's environment: `APP_VARIANT`, `STAGING_IOS_BUNDLE_ID`, `STAGING_APPLE_TEAM_ID`. */
export type AppVariantEnv = Readonly<Record<string, string | undefined>>;

export const STAGING_VARIANT = 'staging';
export const STAGING_APP_NAME = 'Ramassà Staging';
export const STAGING_ANDROID_PACKAGE = 'com.ramassa.app.staging';

/** Created only under Ramassà's own Apple and Google accounts (RAPP-83). */
const PRODUCTION_IDENTIFIER = 'com.ramassa.app';

/** Apple allows letters, digits, hyphens and periods, in at least two segments. */
const IOS_BUNDLE_IDENTIFIER_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export const IOS_STAGING_BLOCKED_MESSAGE =
  'iOS staging builds are blocked (RAPP-620): STAGING_IOS_BUNDLE_ID is not set. ' +
  "Fabián first chooses between Ramassà's Apple enrolment and a temporary Fabulous Apps " +
  'identifier. Then set STAGING_IOS_BUNDLE_ID (and STAGING_APPLE_TEAM_ID if the team ' +
  'changes) in the staging build profile or the EAS preview environment. ' +
  'The identifier com.ramassa.app is never used for staging.';

/** The EAS Update endpoint for a project (https://docs.expo.dev/eas-update/getting-started/). */
export function easUpdateUrl(projectId: string): string {
  return `https://u.expo.dev/${projectId}`;
}

function isStagingVariant(env: AppVariantEnv): boolean {
  const variant = env['APP_VARIANT']?.trim() ?? '';
  if (variant === '') return false;
  if (variant === STAGING_VARIANT) return true;
  throw new Error(
    `Unknown APP_VARIANT "${variant}". Leave it unset for the normal app, or set it to "${STAGING_VARIANT}".`,
  );
}

function readStagingIosBundleIdentifier(env: AppVariantEnv): string | undefined {
  const identifier = env['STAGING_IOS_BUNDLE_ID']?.trim() ?? '';
  if (identifier === '') return undefined;
  if (identifier === PRODUCTION_IDENTIFIER) {
    throw new Error(
      `STAGING_IOS_BUNDLE_ID must differ from ${PRODUCTION_IDENTIFIER}, which belongs to the real app.`,
    );
  }
  if (!IOS_BUNDLE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(
      `STAGING_IOS_BUNDLE_ID "${identifier}" is not a valid bundle identifier (letters, digits, hyphens, periods).`,
    );
  }
  return identifier;
}

function readEasProjectId(config: ExpoConfig): string {
  const projectId: unknown = config.extra?.['eas']?.projectId;
  if (typeof projectId !== 'string' || projectId === '') {
    throw new Error('The staging variant needs extra.eas.projectId in app.json for EAS Update.');
  }
  return projectId;
}

/** Any iOS native step on a staging config without an iOS identifier stops here. */
function withIosStagingBlocked(config: ExpoConfig): ExpoConfig {
  return withInfoPlist(config, () => {
    throw new Error(IOS_STAGING_BLOCKED_MESSAGE);
  });
}

export function resolveAppConfig(config: ExpoConfig, env: AppVariantEnv): ExpoConfig {
  if (!isStagingVariant(env)) return config;

  const iosBundleIdentifier = readStagingIosBundleIdentifier(env);
  const android = { ...config.android, package: STAGING_ANDROID_PACKAGE };
  // google-services.json has one Android client, `com.ramassa.app`, and the
  // Google Services Gradle plugin throws when no client matches the package
  // (https://firebase.google.com/docs/android/google-services-plugin-and-file).
  // Staging therefore builds without Firebase: push registration fails quietly.
  delete android.googleServicesFile;
  const ios = { ...config.ios };
  delete ios.bundleIdentifier;
  if (iosBundleIdentifier !== undefined) {
    ios.bundleIdentifier = iosBundleIdentifier;
    ios.appleTeamId = env['STAGING_APPLE_TEAM_ID']?.trim() || config.ios?.appleTeamId;
  }

  const staging: ExpoConfig = {
    ...config,
    name: STAGING_APP_NAME,
    android,
    ios,
    // https://docs.expo.dev/versions/latest/sdk/updates/ (Configuration):
    // `updates.url` turns expo-updates on for this variant only.
    updates: { ...config.updates, url: easUpdateUrl(readEasProjectId(config)) },
    // https://docs.expo.dev/eas-update/runtime-versions/: the fingerprint
    // changes whenever native code changes, so an update never reaches a build
    // it cannot run on.
    runtimeVersion: { policy: 'fingerprint' },
  };
  return iosBundleIdentifier === undefined ? withIosStagingBlocked(staging) : staging;
}

export default ({ config }: ConfigContext): ExpoConfig =>
  resolveAppConfig(config as ExpoConfig, process.env);

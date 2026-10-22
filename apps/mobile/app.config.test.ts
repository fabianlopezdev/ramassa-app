import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { ExpoConfig } from 'expo/config';
import resolveDynamicConfig, {
  IOS_STAGING_BLOCKED_MESSAGE,
  resolveAppConfig,
  STAGING_ANDROID_PACKAGE,
  STAGING_APP_NAME,
} from './app.config';

const PROJECT_ID = '8c8deaa4-cc83-42e4-9572-6f0f0d933969';

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(import.meta.dir, name), 'utf8')) as T;
}

/** A fresh copy of app.json's `expo` object: what Expo passes the dynamic config. */
function baseConfig(): ExpoConfig {
  return readJson<{ expo: ExpoConfig }>('app.json').expo;
}

describe('the normal app keeps exactly the app.json config (RAPP-620)', () => {
  test('without APP_VARIANT the config is returned untouched', () => {
    const base = baseConfig();
    expect(resolveAppConfig(base, {})).toBe(base);
    expect(resolveAppConfig(base, { APP_VARIANT: '' })).toBe(base);
    expect(resolveAppConfig(base, {})).toEqual(baseConfig());
  });

  test('the normal app has no update URL, so expo-updates stays off', () => {
    const resolved = resolveAppConfig(baseConfig(), {});
    expect(resolved.updates).toBeUndefined();
    expect(resolved.runtimeVersion).toBeUndefined();
  });

  test('the default export reads the variant from the process environment', () => {
    const previous = process.env.APP_VARIANT;
    delete process.env.APP_VARIANT;
    try {
      const base = baseConfig();
      const context = {
        config: base,
        projectRoot: import.meta.dir,
        staticConfigPath: join(import.meta.dir, 'app.json'),
        packageJsonPath: join(import.meta.dir, 'package.json'),
      };
      expect(resolveDynamicConfig(context)).toBe(base);
    } finally {
      if (previous !== undefined) process.env.APP_VARIANT = previous;
    }
  });

  test('an unknown variant is refused, so a typo never builds the real identity', () => {
    expect(() => resolveAppConfig(baseConfig(), { APP_VARIANT: 'stagign' })).toThrow(
      'Unknown APP_VARIANT "stagign"',
    );
  });
});

describe('the staging variant is a separate app that takes over-the-air updates', () => {
  const staging = () => resolveAppConfig(baseConfig(), { APP_VARIANT: 'staging' });

  test('it has its own name and Android package', () => {
    expect(STAGING_APP_NAME).toBe('Ramassà Staging');
    expect(STAGING_ANDROID_PACKAGE).toBe('com.ramassa.app.staging');
    expect(staging().name).toBe('Ramassà Staging');
    expect(staging().android?.package).toBe('com.ramassa.app.staging');
  });

  test('it drops the Firebase file, whose only Android client is the real package', () => {
    const firebase = readJson<{
      client: { client_info: { android_client_info: { package_name: string } } }[];
    }>('google-services.json');
    const packages = firebase.client.map(
      (client) => client.client_info.android_client_info.package_name,
    );
    expect(packages).not.toContain(STAGING_ANDROID_PACKAGE);
    expect(staging().android?.googleServicesFile).toBeUndefined();
  });

  test('everything else on Android and the shared settings stay as in app.json', () => {
    const base = baseConfig();
    const resolved = staging();
    const { googleServicesFile, package: basePackage, ...baseAndroid } = base.android ?? {};
    const { package: stagingPackage, ...stagingAndroid } = resolved.android ?? {};
    expect(googleServicesFile).toBe('./google-services.json');
    expect(basePackage).toBe('com.ramassa.app');
    expect(stagingPackage).toBe(STAGING_ANDROID_PACKAGE);
    expect(stagingAndroid).toEqual(baseAndroid);
    expect(resolved.plugins).toEqual(base.plugins);
    expect(resolved.slug).toBe(base.slug);
    expect(resolved.owner).toBe(base.owner);
    expect(resolved.version).toBe(base.version);
    expect(resolved.extra).toEqual(base.extra);
  });

  test('it fetches updates from the EAS project, on a fingerprint runtime version', () => {
    expect(staging().updates).toEqual({ url: `https://u.expo.dev/${PROJECT_ID}` });
    expect(staging().runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  test('it never reuses the real iOS bundle identifier', () => {
    expect(staging().ios?.bundleIdentifier).toBeUndefined();
  });

  test('the base config object is not modified', () => {
    const base = baseConfig();
    resolveAppConfig(base, { APP_VARIANT: 'staging' });
    expect(base).toEqual(baseConfig());
  });

  test('a config without the EAS project id is refused', () => {
    const base = { ...baseConfig(), extra: {} };
    expect(() => resolveAppConfig(base, { APP_VARIANT: 'staging' })).toThrow('projectId');
  });
});

describe('iOS staging waits for the Apple account decision', () => {
  test('without STAGING_IOS_BUNDLE_ID an iOS native step stops with the reason', () => {
    const resolved = resolveAppConfig(baseConfig(), { APP_VARIANT: 'staging' });
    const iosMods = (resolved as { mods?: { ios?: Record<string, unknown> } }).mods?.ios;
    expect(typeof iosMods?.infoPlist).toBe('function');
    expect(IOS_STAGING_BLOCKED_MESSAGE).toContain('STAGING_IOS_BUNDLE_ID');
    expect(IOS_STAGING_BLOCKED_MESSAGE).toContain('RAPP-620');
  });

  test('without STAGING_IOS_BUNDLE_ID the Android side has no iOS guard to trip on', () => {
    const resolved = resolveAppConfig(baseConfig(), { APP_VARIANT: 'staging' });
    const mods = (resolved as { mods?: Record<string, unknown> }).mods;
    expect(mods?.android).toBeUndefined();
  });

  test('with STAGING_IOS_BUNDLE_ID set, iOS builds with that identifier and no guard', () => {
    const resolved = resolveAppConfig(baseConfig(), {
      APP_VARIANT: 'staging',
      STAGING_IOS_BUNDLE_ID: ' dev.fabapps.ramassa.staging ',
    });
    expect(resolved.ios?.bundleIdentifier).toBe('dev.fabapps.ramassa.staging');
    expect(resolved.ios?.appleTeamId).toBe(baseConfig().ios?.appleTeamId);
    expect((resolved as { mods?: unknown }).mods).toBeUndefined();
  });

  test('STAGING_APPLE_TEAM_ID replaces the Apple team for the staging identifier', () => {
    const resolved = resolveAppConfig(baseConfig(), {
      APP_VARIANT: 'staging',
      STAGING_IOS_BUNDLE_ID: 'com.ramassa.app.staging',
      STAGING_APPLE_TEAM_ID: 'ABCDE12345',
    });
    expect(resolved.ios?.appleTeamId).toBe('ABCDE12345');
  });

  test('the real identifier and malformed identifiers are refused', () => {
    expect(() =>
      resolveAppConfig(baseConfig(), {
        APP_VARIANT: 'staging',
        STAGING_IOS_BUNDLE_ID: 'com.ramassa.app',
      }),
    ).toThrow('com.ramassa.app');
    for (const malformed of ['ramassa', 'com.ramassa_app.staging', 'com..ramassa']) {
      expect(() =>
        resolveAppConfig(baseConfig(), {
          APP_VARIANT: 'staging',
          STAGING_IOS_BUNDLE_ID: malformed,
        }),
      ).toThrow('STAGING_IOS_BUNDLE_ID');
    }
  });
});

describe('EAS has a staging profile for an internal Android build (RAPP-620)', () => {
  interface EasJson {
    readonly build: Record<string, Record<string, unknown>>;
  }
  const eas = readJson<EasJson>('eas.json');

  test('the staging profile installs from a link, reads the preview environment and the staging channel', () => {
    expect(eas.build.staging).toEqual({
      distribution: 'internal',
      environment: 'preview',
      channel: 'staging',
      autoIncrement: true,
      env: { APP_VARIANT: 'staging' },
      android: { buildType: 'apk' },
    });
  });

  test('the other profiles are unchanged and never pick the staging variant', () => {
    expect(eas.build.development).toEqual({ developmentClient: true, distribution: 'internal' });
    expect(eas.build.preview).toEqual({ distribution: 'internal' });
    expect(eas.build.production).toEqual({ autoIncrement: true });
  });

  test('the package scripts run the staging build and the staging update', () => {
    const manifest = readJson<{ scripts: Record<string, string> }>('package.json');
    expect(manifest.scripts['build:staging:android']).toBe(
      'bunx eas-cli build --platform android --profile staging',
    );
    expect(manifest.scripts['update:staging:android']).toBe(
      'APP_VARIANT=staging bunx eas-cli update --channel staging --environment preview --platform android',
    );
  });

  test('expo-updates is pinned to the SDK 58 line', () => {
    const manifest = readJson<{ dependencies: Record<string, string> }>('package.json');
    expect(manifest.dependencies['expo-updates']).toMatch(/^~58\.0\.\d+$/);
  });
});

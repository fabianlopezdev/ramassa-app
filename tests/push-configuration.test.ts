import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

interface AppConfig {
  readonly expo: {
    readonly ios: { readonly bundleIdentifier: string };
    readonly android: { readonly package: string; readonly googleServicesFile: string };
    readonly extra: { readonly eas: { readonly projectId: string } };
  };
}

interface FirebaseConfig {
  readonly project_info: { readonly project_id: string };
  readonly client: readonly [
    { readonly client_info: { readonly android_client_info: { readonly package_name: string } } },
  ];
}

interface EasConfig {
  readonly build: {
    readonly development: {
      readonly developmentClient: boolean;
      readonly distribution: string;
    };
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

test('native push identifiers and Firebase client config stay aligned', () => {
  const appConfig = readJson<AppConfig>('../apps/mobile/app.json');
  const firebaseConfig = readJson<FirebaseConfig>('../apps/mobile/google-services.json');

  expect(appConfig.expo.ios.bundleIdentifier).toBe('com.ramassa.app');
  expect(appConfig.expo.android.package).toBe('com.ramassa.app');
  expect(appConfig.expo.android.googleServicesFile).toBe('./google-services.json');
  expect(appConfig.expo.extra.eas.projectId).toBe('8c8deaa4-cc83-42e4-9572-6f0f0d933969');
  expect(firebaseConfig.project_info.project_id).toBe('ramassa-app');
  expect(firebaseConfig.client[0].client_info.android_client_info.package_name).toBe(
    'com.ramassa.app',
  );
});

test('EAS has a development-client profile for real push verification', () => {
  const easConfig = readJson<EasConfig>('../apps/mobile/eas.json');

  expect(easConfig.build.development).toEqual({
    developmentClient: true,
    distribution: 'internal',
  });
});

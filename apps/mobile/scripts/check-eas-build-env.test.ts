import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { checkEasBuildEnv } from './check-eas-build-env';

const SCRIPT = join(import.meta.dir, 'check-eas-build-env.ts');

function runHook(env: Record<string, string>): number {
  const result = Bun.spawnSync(['bun', SCRIPT], {
    env: { PATH: process.env.PATH ?? '', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return result.exitCode;
}

describe('a native production build never carries the test sign-in flag (RAPP-616)', () => {
  test('the production profile with the flag on is refused', () => {
    expect(() =>
      checkEasBuildEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_TEST_SIGN_IN: 'true' }),
    ).toThrow('EXPO_PUBLIC_TEST_SIGN_IN');
    expect(() =>
      checkEasBuildEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_TEST_SIGN_IN: ' true ' }),
    ).toThrow('EXPO_PUBLIC_TEST_SIGN_IN');
  });

  test('the production profile without the flag, or with it off, builds', () => {
    for (const flag of [undefined, '', 'false']) {
      expect(() =>
        checkEasBuildEnv({
          EAS_BUILD_PROFILE: 'production',
          ...(flag === undefined ? {} : { EXPO_PUBLIC_TEST_SIGN_IN: flag }),
        }),
      ).not.toThrow();
    }
  });

  test('a production profile with any other flag value is refused too', () => {
    expect(() =>
      checkEasBuildEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_TEST_SIGN_IN: '1' }),
    ).toThrow('EXPO_PUBLIC_TEST_SIGN_IN');
  });

  test('staging and development profiles may carry the flag', () => {
    for (const profile of ['preview', 'development']) {
      expect(() =>
        checkEasBuildEnv({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_TEST_SIGN_IN: 'true' }),
      ).not.toThrow();
    }
  });

  test('the hook script exits non-zero for a production build with the flag', () => {
    expect(runHook({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_TEST_SIGN_IN: 'true' })).toBe(1);
    expect(runHook({ EAS_BUILD_PROFILE: 'production' })).toBe(0);
    expect(runHook({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_TEST_SIGN_IN: 'true' })).toBe(0);
  });

  test('EAS runs the check before installing anything', () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts['eas-build-pre-install']).toBe('bun scripts/check-eas-build-env.ts');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';
import { describe, expect, test } from 'bun:test';

// The player login was redesigned to email only (RAPP-115..119, RAPP-140). These
// names and words belong to the removed design, so they must not come back in
// the player app or the shared code (RAPP-120). The web admin keeps its own
// password login on purpose, so apps/admin is out of scope.

const root = resolve(import.meta.dir, '..');

const read = (patterns: readonly string[]): Array<readonly [string, string]> =>
  patterns
    .flatMap((pattern) => [...new Glob(pattern).scanSync({ cwd: root })])
    // Build output (web exports, native projects) is generated and gitignored.
    .filter((path) => !/(^|\/)(node_modules|dist|\.expo|ios|android)\//.test(path))
    .map((path) => [path, readFileSync(resolve(root, path), 'utf8')] as const);

const PLAYER_CODE = ['apps/mobile/src/**/*.{ts,tsx}', 'packages/shared/**/*.{ts,tsx}'];

const offenders = (files: Array<readonly [string, string]>, pattern: RegExp): string[] =>
  files.filter(([, text]) => pattern.test(text)).map(([path]) => path);

describe('the removed player login design stays removed', () => {
  test('no component, type or hook from the old login exists in player code', () => {
    const files = read(PLAYER_CODE);
    expect(
      offenders(files, /\b(PasswordLoginForm|LoginMode|usePasswordInstead|useEmailOtpInstead)\b/),
    ).toEqual([]);
  });

  test('no player-facing text asks for a password', () => {
    // Namespaces the mobile app renders. `auth` stays out: the web admin login
    // shares it and still offers a password.
    const playerCatalogs = read(['packages/shared/i18n/locales/ca/*.json']).filter(
      ([path]) =>
        !/\/(auth|admin|announcements|entity-management|entity-services|notifications|participants|referrals|services|settings)\.json$/.test(
          path,
        ),
    );
    expect(offenders(playerCatalogs, /contrasenya/i)).toEqual([]);
  });

  test('the internal account domain appears only in shared constants, SQL and tests', () => {
    const files = read([
      'apps/**/*.{ts,tsx,js,cjs,json}',
      'workers/**/*.ts',
      'supabase/functions/**/*.ts',
    ]).filter(([path]) => !/\.(test|case)\.tsx?$/.test(path));
    expect(offenders(files, /ramassa\.invalid/)).toEqual([]);
  });
});

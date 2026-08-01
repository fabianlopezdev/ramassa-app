/**
 * The production gate for the developer menu (RAPP-19).
 *
 * A `__DEV__` check at the top of a component does NOT keep code out of a
 * release bundle: the module is still in Metro's dependency graph and still
 * ships. What DOES remove it is a `require` that sits inside a `__DEV__`
 * branch. Metro inlines `__DEV__` to `false` and folds the dead branch away
 * BEFORE it collects dependencies, so the whole subtree, the dev screen, the
 * seeded account roster, and the seed password, never enters the bundle.
 *
 * That property is invisible in review and easy to undo with an innocent-looking
 * `import`, which is why it is asserted here rather than trusted. The end-to-end
 * proof is `scripts/verify-dev-menu-excluded.sh`, which exports a real
 * production bundle and greps it; that takes minutes, so it is not a pre-commit
 * gate. This test is the fast guard that catches the regression that would make
 * the export fail.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

const MOBILE_SOURCE_ROOT = join(import.meta.dir, '..', 'apps', 'mobile', 'src');
const DEV_ONLY_DIRECTORIES = ['components/dev', 'lib/dev'];
const DEV_MODULE_PATTERN = /@\/(?:components|lib)\/dev\//;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return listSourceFiles(absolutePath);
    }
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [absolutePath] : [];
  });
}

function toPosixRelativePath(absolutePath: string): string {
  return relative(MOBILE_SOURCE_ROOT, absolutePath).split(/[\\/]/).join('/');
}

const nonDevSourceFiles = listSourceFiles(MOBILE_SOURCE_ROOT).filter((absolutePath) => {
  const relativePath = toPosixRelativePath(absolutePath);
  return !DEV_ONLY_DIRECTORIES.some((directory) => relativePath.startsWith(`${directory}/`));
});

describe('the dev menu cannot be pulled into a production bundle', () => {
  test('there is production code to check, so a bad glob cannot make this vacuous', () => {
    expect(nonDevSourceFiles.length).toBeGreaterThan(10);
    expect(nonDevSourceFiles.map(toPosixRelativePath)).toContain('app/dev-menu.tsx');
  });

  test('no production module statically imports a dev module', () => {
    const offenders = nonDevSourceFiles.filter((absolutePath) =>
      readFileSync(absolutePath, 'utf8')
        .split('\n')
        .some((line) => /^\s*import\b/.test(line) && DEV_MODULE_PATTERN.test(line)),
    );
    expect(offenders.map(toPosixRelativePath)).toEqual([]);
  });

  test('every reference to a dev module is a require inside a __DEV__ branch', () => {
    const offenders: string[] = [];

    for (const absolutePath of nonDevSourceFiles) {
      const lines = readFileSync(absolutePath, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!DEV_MODULE_PATTERN.test(line)) {
          return;
        }
        // The guard may sit on the same line (a ternary) or open the statement
        // one or two lines above (an `if` block, or a wrapped ternary).
        const guardWindow = lines.slice(Math.max(0, index - 2), index + 1).join('\n');
        const isGuardedRequire = line.includes('require(') && guardWindow.includes('__DEV__');
        if (!isGuardedRequire) {
          offenders.push(`${toPosixRelativePath(absolutePath)}:${index + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  test('the seeded account password appears nowhere in production code', () => {
    const offenders = nonDevSourceFiles.filter((absolutePath) =>
      readFileSync(absolutePath, 'utf8').includes('ramassa-dev-password'),
    );
    expect(offenders.map(toPosixRelativePath)).toEqual([]);
  });

  test('the route renders a redirect when __DEV__ is false, so /dev-menu is not reachable', () => {
    const routeSource = readFileSync(join(MOBILE_SOURCE_ROOT, 'app', 'dev-menu.tsx'), 'utf8');
    expect(routeSource).toContain('__DEV__');
    expect(routeSource).toContain('Redirect');
  });
});

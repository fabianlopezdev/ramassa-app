import { Glob } from 'bun';
import { describe, expect, test } from 'bun:test';

/**
 * A native Modal is drawn above every view, the app lock's cover included
 * (RAPP-236, seen on the simulator: the push question stayed on top of the lock
 * screen). So every Modal in the app hides while the lock covers the app.
 */
describe('app lock and native modals', () => {
  test('every Modal hides while the app lock covers the app', async () => {
    const offenders: string[] = [];
    let modalFiles = 0;
    for await (const path of new Glob('src/**/*.tsx').scan({ cwd: `${import.meta.dir}/../..` })) {
      if (path.includes('.test.') || path.includes('.case.')) continue;
      const source = await Bun.file(`${import.meta.dir}/../../${path}`).text();
      if (!/<Modal\b/.test(source)) continue;
      modalFiles += 1;
      if (!source.includes('!isCovered')) offenders.push(path);
    }
    expect(modalFiles).toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });

  test('the sheets added by the restructure use the one shared sheet frame (RAPP-812)', async () => {
    const root = `${import.meta.dir}/..`;
    for (const path of [
      'components/community/community-share-sheet.tsx',
      'components/entity/entity-account-menu.tsx',
      'components/entity/entity-event-sheet.tsx',
    ]) {
      const source = await Bun.file(`${root}/${path}`).text();
      expect(source, path).toContain("from '@/components/layout/app-sheet'");
      expect(source, path).not.toMatch(/<Modal\b/);
    }
    const frame = await Bun.file(`${root}/components/layout/app-sheet.tsx`).text();
    expect(frame).toContain('!isCovered');
    expect(frame).toContain('<NativeModalScope>');
  });
});

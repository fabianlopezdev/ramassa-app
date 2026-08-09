/** Static enforcement for workflow contract rule 18 (RAPP-100). */

import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { repoRoot } from '../scripts/flow-capture/config';

const screens: string[] = [
  'apps/mobile/src/app/(app)/onboarding/logistics.tsx',
  'apps/mobile/src/app/(app)/profile-edit.tsx',
];

describe('municipality picker integration', () => {
  test.each(screens)(
    '%s collects city through MunicipalityPicker, never AuthTextField',
    async (file) => {
      const source = await Bun.file(path.join(repoRoot, file)).text();
      const cityControllerStart = source.indexOf('name="city"');

      expect(cityControllerStart).toBeGreaterThan(-1);
      const nextControllerStart = source.indexOf('name="postalCode"', cityControllerStart);
      expect(nextControllerStart).toBeGreaterThan(cityControllerStart);
      const cityController = source.slice(cityControllerStart, nextControllerStart);
      expect(cityController).toContain('<MunicipalityPicker');
      expect(cityController).not.toContain('<AuthTextField');
    },
  );

  test('a result tap is never consumed only to dismiss the search keyboard', async () => {
    const source = await Bun.file(
      path.join(repoRoot, 'apps/mobile/src/components/onboarding/municipality-picker.tsx'),
    ).text();

    expect(source).toContain('keyboardShouldPersistTaps="always"');
    expect(source).toContain('submitBehavior="blurAndSubmit"');
    const row = source.slice(
      source.indexOf('const MunicipalityRow'),
      source.indexOf('export interface MunicipalityPickerProps'),
    );
    expect(row).toContain('<Pressable');
    expect(row).not.toContain('<PressableScale');
  });
});

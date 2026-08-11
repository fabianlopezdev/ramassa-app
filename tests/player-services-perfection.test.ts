import path from 'node:path';
import { expect, test } from 'bun:test';
import { repoRoot } from '../scripts/flow-capture/config';

const supportedLanguages = ['ca', 'es', 'en', 'ar', 'fa'] as const;

test('the service image carousel has a translated accessible name', async () => {
  const detailSource = await Bun.file(
    path.join(repoRoot, 'apps/mobile/src/app/(app)/service/[id].tsx'),
  ).text();

  expect(detailSource).toContain("accessibilityLabel={t('playerServices:images')}");

  for (const language of supportedLanguages) {
    const catalog = (await Bun.file(
      path.join(repoRoot, `packages/shared/i18n/locales/${language}/player-services.json`),
    ).json()) as Record<string, unknown>;
    expect(typeof catalog.images).toBe('string');
    expect(String(catalog.images).trim().length).toBeGreaterThan(0);
  }
});

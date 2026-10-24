import { expect, test } from 'bun:test';

// The invitation screen is often used on a phone at an onboarding session
// (RAPP-118), so it keeps an explicit narrow viewport layout. Its padding comes
// from the shared page frame since RAPP-636.

const appRoot = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return Bun.file(new URL(path, appRoot)).text();
}

test('the participant invitation screen carries an explicit narrow viewport layout', async () => {
  const newParticipant = await source('apps/admin/src/components/participants/new-participant.tsx');
  const pageFrame = await source('apps/admin/src/components/layout/page.tsx');

  expect(newParticipant).toContain('<Page>');
  expect(pageFrame).toContain('p-4 sm:p-6');
  expect(newParticipant).toContain('grid grid-cols-1 gap-3 sm:flex sm:flex-wrap');
  expect(newParticipant).toContain('w-full sm:w-auto');
});

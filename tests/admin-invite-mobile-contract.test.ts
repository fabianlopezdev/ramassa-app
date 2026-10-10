import { expect, test } from 'bun:test';

// The invitation screen is often used on a phone at an onboarding session
// (RAPP-118), so it keeps an explicit narrow viewport layout.

const appRoot = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return Bun.file(new URL(path, appRoot)).text();
}

test('the participant invitation screen carries an explicit narrow viewport layout', async () => {
  const newParticipant = await source('apps/admin/src/components/participants/new-participant.tsx');

  expect(newParticipant).toContain('px-4 py-5 sm:p-6');
  expect(newParticipant).toContain('grid grid-cols-1 gap-3 sm:flex sm:flex-wrap');
  expect(newParticipant).toContain('w-full sm:w-auto');
});

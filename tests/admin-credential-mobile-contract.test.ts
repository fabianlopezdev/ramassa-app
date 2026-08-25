import { expect, test } from 'bun:test';

const appRoot = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return Bun.file(new URL(path, appRoot)).text();
}

test('the three credential workflow surfaces carry an explicit narrow viewport layout', async () => {
  const [newParticipant, copyableCredential, resetCredential] = await Promise.all([
    source('apps/admin/src/components/participants/new-participant.tsx'),
    source('apps/admin/src/components/participants/copyable-credential.tsx'),
    source('apps/admin/src/components/participants/reset-password.tsx'),
  ]);

  expect(newParticipant).toContain('px-4 py-5 sm:p-6');
  expect(newParticipant).toContain('grid grid-cols-1 gap-3 sm:flex sm:flex-wrap');
  expect(newParticipant).toContain('w-full sm:w-auto');
  expect(copyableCredential).toContain('w-full min-w-0');
  expect(copyableCredential).toContain('text-[clamp(1.25rem,7vw,2.25rem)]');
  expect(resetCredential).toContain('p-4 sm:p-6');
});

test('creation and reset show only the grouped access code with one-time handoff guidance', async () => {
  const [newParticipant, copyableCredential, resetCredential] = await Promise.all([
    source('apps/admin/src/components/participants/new-participant.tsx'),
    source('apps/admin/src/components/participants/copyable-credential.tsx'),
    source('apps/admin/src/components/participants/reset-password.tsx'),
  ]);

  expect(newParticipant).not.toContain('value={account.email}');
  expect(newParticipant).toContain("label={t('credentialsCodeLabel')} value={account.password}");
  expect(newParticipant).toContain("t('credentialsHandoffGuidance')");
  expect(resetCredential).toContain("label={t('credentialsCodeLabel')} value={state.accessCode}");
  expect(resetCredential).toContain("t('credentialsHandoffGuidance')");
  expect(copyableCredential).toContain('data-testid="one-time-access-code"');
  expect(copyableCredential).toContain('tracking-[0.08em]');
});

test('the credential result components do not fetch or reload their one-time value', async () => {
  const [newParticipant, copyableCredential, resetCredential] = await Promise.all([
    source('apps/admin/src/components/participants/new-participant.tsx'),
    source('apps/admin/src/components/participants/copyable-credential.tsx'),
    source('apps/admin/src/components/participants/reset-password.tsx'),
  ]);

  const credentialPanel = newParticipant.slice(newParticipant.indexOf('function CredentialsPanel'));
  const resetDonePanel = resetCredential.slice(
    resetCredential.indexOf("if (state.kind === 'done')"),
  );
  for (const resultSurface of [credentialPanel, copyableCredential, resetDonePanel]) {
    expect(resultSurface).not.toContain('fetch(');
    expect(resultSurface).not.toContain('useQuery');
    expect(resultSurface).not.toContain('supabase.');
  }
});

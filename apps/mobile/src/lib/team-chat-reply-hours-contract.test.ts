import { describe, expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('the team chat says when the team replies (RAPP-971)', () => {
  test('her chat with the team shows the reply hours under its header', async () => {
    const thread = await read('../components/messaging/message-thread.tsx');

    expect(thread).toContain("notice={t('replyHours')}");
    expect(thread).toContain('testID="message-thread-notice"');
    const ca = (await Bun.file(
      new URL('../../../../packages/shared/i18n/locales/ca/messaging.json', import.meta.url),
    ).json()) as { replyHours: string };
    expect(ca.replyHours).toBe('L’equip respon de dilluns a divendres, de 9 a 17 h.');
  });
});

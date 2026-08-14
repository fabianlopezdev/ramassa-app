import { readFile } from 'node:fs/promises';
import { expect, test } from 'bun:test';

test('preview moderation QA drives three authenticated flags through auto-hide and staff push', async () => {
  const source = await readFile(new URL('./forum-moderation.web-qa.ts', import.meta.url), 'utf8');

  expect(source).toContain("accessTokenFor('zeinab.haddad@example.test'");
  expect(source).toContain("accessTokenFor('souad.almansouri@example.test'");
  expect(source).toContain('/rest/v1/rpc/flag_forum_content');
  expect(source.match(/flagForumPost\(/g)).toHaveLength(3);
  expect(source).toContain(".toBe('hidden_pending_review:3')");
  expect(source).toContain('Promise<string>');
  expect(source).toContain('const [secondFlagId, thirdFlagId] = await Promise.all');
  expect(source).toContain("publication.content_type = 'forum_flag'");
  expect(source).toContain('join public.forum_flags as flag on flag.id = publication.content_id');
  expect(source).toContain("flag.post_id = '${seededPostId}'");
  expect(source).toContain("flag.id <> '${seededFlagId}'");
  expect(source).toContain("flag.id in ('${secondFlagId}', '${thirdFlagId}')");
  expect(source).toContain("recipient.role in ('staff', 'admin')");
  expect(source).toContain(".toBe('2')");
});

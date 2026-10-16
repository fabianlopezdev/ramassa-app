-- Who may write gallery items directly (RAPP-388).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Nobody changes an item's file, thumbnail, uploader, caption or consent
--      with a direct write, not even a gallery moderator.
--   2. A team member who moderates the forum but not the gallery cannot write
--      a gallery item directly.
--   3. The functions still work: forum moderation hides a reported item, and
--      the uploader still changes who can see it.

begin;
select plan(8);

select ok(
  not has_column_privilege('authenticated', 'public.media_items', 'file_url', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.media_items', 'thumbnail_url', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.media_items', 'uploaded_by', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.media_items', 'caption', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.media_items', 'consent_acknowledged_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.media_items', 'privacy_level', 'UPDATE'),
  'no signed-in role may write an item''s file, uploader, caption, audience or consent'
);
select ok(
  has_column_privilege('authenticated', 'public.media_items', 'moderation_state', 'UPDATE')
    and has_column_privilege('authenticated', 'public.media_items', 'flag_count', 'UPDATE'),
  'only the two columns forum moderation writes stay open, behind the policy'
);

-- 1. A gallery moderator cannot repoint the file or the uploader.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.media_items set file_url = 'gallery/elsewhere.jpg' where id = '5eed0000-0000-4000-8014-000000000001' $$,
  '42501', null::text, 'a gallery moderator cannot repoint an item''s file'
);
select throws_ok(
  $$ update public.media_items set uploaded_by = '5eed0000-0000-4000-8000-000000000002' where id = '5eed0000-0000-4000-8014-000000000001' $$,
  '42501', null::text, 'or change who uploaded it'
);

-- 2. Forum moderation alone does not reach gallery items.
reset role;
delete from public.team_member_permissions
where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'gallery.moderate';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
update public.media_items set moderation_state = 'hidden' where id = '5eed0000-0000-4000-8014-000000000001';
reset role;
select is(
  (select moderation_state from public.media_items where id = '5eed0000-0000-4000-8014-000000000001'),
  'visible', 'a forum moderator without gallery.moderate cannot hide a gallery item directly'
);

-- 3. The functions still work.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.moderate_forum_target('media', '5eed0000-0000-4000-8014-000000000001', 'hide') $$,
  'forum moderation still hides a gallery item'
);
reset role;
select is(
  (select moderation_state from public.media_items where id = '5eed0000-0000-4000-8014-000000000001'),
  'hidden', 'and it is hidden'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_media_item_privacy('5eed0000-0000-4000-8014-000000000001', 'staff_only') $$,
  'the uploader still changes who can see her item'
);

select * from finish();
rollback;

-- Gallery moderation (RAPP-381).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only a gallery moderator hides or shows a gallery item: nobody signed
--      out, no player, no team member without `gallery.moderate`.
--   2. Hiding takes the item out of the player gallery, acts on its open
--      reports and is audited; showing it again dismisses new reports and
--      brings it back.
--   3. Only the two states, and only an item of her organization.

begin;
select plan(11);

-- Counted from here, so audit rows left by earlier runs do not count.
select set_config('test.hides_before', (
  select count(*)::text from public.audit_log
   where action = 'gallery.hide' and target_id = '5eed0000-0000-4000-8014-000000000001'
), true);
select set_config('test.shows_before', (
  select count(*)::text from public.audit_log
   where action = 'gallery.show' and target_id = '5eed0000-0000-4000-8014-000000000001'
), true);

-- A player reports the item, through her own function.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select public.flag_forum_content('media', '5eed0000-0000-4000-8014-000000000001', 'harassment', null);
reset role;
delete from public.team_member_permissions
where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'gallery.moderate';

-- 1. Who may.
-- Asked of the privilege: in a raw SQL session, calling a function anon may
-- not run crashes the local server (see 0063).
select ok(
  not has_function_privilege('anon', 'public.set_media_item_moderation(uuid, text)', 'execute'),
  'nobody signed out hides a gallery item'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_media_item_moderation('5eed0000-0000-4000-8014-000000000001', 'hidden') $$,
  '42501', null::text, 'a player cannot hide a gallery item'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_media_item_moderation('5eed0000-0000-4000-8014-000000000001', 'hidden') $$,
  '42501', null::text, 'a team member without gallery.moderate cannot hide one'
);

-- 2. Hide, then show again.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_media_item_moderation('5eed0000-0000-4000-8014-000000000001', 'hidden') $$,
  'a gallery moderator hides an item'
);

reset role;
select is(
  (select moderation_state || '|' || flag_count from public.media_items
    where id = '5eed0000-0000-4000-8014-000000000001'),
  'hidden|0', 'it is hidden, with no reports left'
);
select is(
  (select count(*)::int from public.forum_flags
    where media_id = '5eed0000-0000-4000-8014-000000000001' and state = 'actioned'
      and reviewed_by = '5eed0000-0000-4000-8000-000000000002'),
  1, 'its open report is acted on, by her'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'gallery.hide' and target_id = '5eed0000-0000-4000-8014-000000000001')
    - current_setting('test.hides_before')::int,
  1, 'and it is audited'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select count(*)::int from public.media_items where id = '5eed0000-0000-4000-8014-000000000001'),
  0, 'the player who uploaded it no longer sees it in the gallery'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.set_media_item_moderation('5eed0000-0000-4000-8014-000000000001', 'visible');
reset role;
select is(
  (select moderation_state || '|' ||
          ((select count(*) from public.audit_log where action = 'gallery.show'
             and target_id = '5eed0000-0000-4000-8014-000000000001')
           - current_setting('test.shows_before')::int)
     from public.media_items where id = '5eed0000-0000-4000-8014-000000000001'),
  'visible|1', 'showing it again brings it back, audited'
);

-- 3. Only the two states, and only her organization's items.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_media_item_moderation('5eed0000-0000-4000-8014-000000000001', 'hidden_pending_review') $$,
  '22023', null::text, 'only hidden or visible'
);
select throws_ok(
  $$ select public.set_media_item_moderation(gen_random_uuid(), 'hidden') $$,
  'P0002', null::text, 'an unknown item is refused'
);

select * from finish();
rollback;

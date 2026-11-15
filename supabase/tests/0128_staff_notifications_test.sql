-- The Control Center bell's stored notifications (RAPP-640).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A player's message notifies the team members who hold messages.inbox,
--      never the player, and a second message bumps the open notification
--      (count 2) instead of adding a row.
--   2. A team member's own message notifies nobody; once read, the next
--      player message adds a new row.
--   3. A deletion request notifies the holders of rgpd.erase.
--   4. Row security: she reads her own rows only, through the table and the
--      list function, which shows the player's first name.
--   5. She marks read and deletes only her own rows; delete returns the count.
--   6. No client writes the table, and anon calls nothing.
--
-- Seed: admin ...001, staff ...002, player ...011 with conversation
-- ...800c-...001 (assigned to ...002).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

-- Both team members hold the inbox and erasure permissions for this test.
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select '5eed0000-0000-4000-8000-000000000000', person, code
  from unnest(array['5eed0000-0000-4000-8000-000000000001',
                    '5eed0000-0000-4000-8000-000000000002']::uuid[]) as person
 cross join unnest(array['messages.inbox', 'rgpd.erase']) as code
on conflict do nothing;
update public.profiles set first_name = 'Fatima', anonymized_at = null, is_active = true
 where id = '5eed0000-0000-4000-8000-000000000011';
delete from public.staff_notifications;

-- 1. A player's messages -----------------------------------------------------------------------------

insert into public.messages (id, org_id, conversation_id, sender_id, content)
values ('12800000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-800c-000000000001',
        '5eed0000-0000-4000-8000-000000000011', 'Hola');

select is(
  (select count(*)::integer from public.staff_notifications
    where recipient_id = '5eed0000-0000-4000-8000-000000000002' and event = 'message'
      and source_id = '5eed0000-0000-4000-800c-000000000001'),
  1, 'a player''s message notifies a team member with the inbox');

select is(
  (select count(*)::integer from public.staff_notifications
    where recipient_id = '5eed0000-0000-4000-8000-000000000011'),
  0, 'the player who wrote is never notified');

insert into public.messages (id, org_id, conversation_id, sender_id, content)
values ('12800000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-800c-000000000001',
        '5eed0000-0000-4000-8000-000000000011', 'Hi ha algú?');

select results_eq(
  $$ select count(*)::integer, max((params ->> 'count')::integer)
       from public.staff_notifications
      where recipient_id = '5eed0000-0000-4000-8000-000000000002' and event = 'message' $$,
  $$ values (1, 2) $$,
  'a second message bumps the open notification to a count of 2');

-- 2. A team member's message, then a read notification ----------------------------------------------

insert into public.messages (id, org_id, conversation_id, sender_id, content)
values ('12800000-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-800c-000000000001',
        '5eed0000-0000-4000-8000-000000000002', 'Hola, Fatima');

select is(
  (select count(*)::integer from public.staff_notifications
    where recipient_id = '5eed0000-0000-4000-8000-000000000001' and event = 'message'),
  1, 'a team member''s reply notifies nobody');

update public.staff_notifications set read_at = now()
 where recipient_id = '5eed0000-0000-4000-8000-000000000002';
insert into public.messages (id, org_id, conversation_id, sender_id, content)
values ('12800000-0000-4000-8000-000000000004', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-800c-000000000001',
        '5eed0000-0000-4000-8000-000000000011', 'Gràcies');

select is(
  (select count(*)::integer from public.staff_notifications
    where recipient_id = '5eed0000-0000-4000-8000-000000000002' and event = 'message'),
  2, 'after she read it, the next message adds a new notification');

-- 3. A deletion request --------------------------------------------------------------------------------

insert into public.deletion_requests (profile_id, state)
values ('5eed0000-0000-4000-8000-000000000011', 'open');

select is(
  (select count(*)::integer from public.staff_notifications
    where recipient_id = '5eed0000-0000-4000-8000-000000000002' and event = 'deletion_request'),
  1, 'an open deletion request notifies the holders of rgpd.erase');

-- 4. Row security, as the staff member ----------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select count(*)::integer from public.staff_notifications),
  3, 'she reads her own three notifications');

select is(
  (select count(*)::integer from public.staff_notifications
    where recipient_id <> '5eed0000-0000-4000-8000-000000000002'),
  0, 'she reads nobody else''s');

select is(
  (select name from public.list_staff_notifications(30)
    where event = 'message' and read_at is null),
  'Fatima', 'the list names the player, read from her profile now');

-- 5. Mark read and delete --------------------------------------------------------------------------------

select lives_ok(
  $$ select public.mark_staff_notification_read(
       (select id from public.staff_notifications where event = 'deletion_request')) $$,
  'she marks her own notification read');

select isnt(
  (select read_at from public.staff_notifications where event = 'deletion_request'),
  null, 'it is read');

select is(
  public.delete_staff_notifications(array(
    select id from public.staff_notifications where event = 'message')
    -- An id that is not hers changes nothing.
    || gen_random_uuid()),
  2, 'delete returns the number of her rows it cleared');

select is(
  (select count(*)::integer from public.staff_notifications),
  1, 'deleted rows leave her bell');

-- 6. No client writes, anon calls nothing --------------------------------------------------------------

select throws_ok(
  $$ insert into public.staff_notifications (org_id, recipient_id, event, path)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000002', 'feedback', '/feedback') $$,
  '42501', null::text, 'a client cannot insert a notification');

reset role;
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select throws_ok(
  $$ select * from public.list_staff_notifications(30) $$,
  '42501', null::text, 'anon cannot list notifications');

select * from finish();
rollback;

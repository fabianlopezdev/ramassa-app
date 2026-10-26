-- Her names are fully editable, like every field (RAPP-693).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every profile has a stable number in her organization; a new one gets
--      the next; nobody changes it.
--   2. Her names are answers, written through the answer store; the D2
--      refusals are gone; a name written to her account becomes her answer,
--      and a writer who may not read it changes nothing.
--   3. The display rule per permission: herself, a team member with the
--      level's permission, a fellow player only at Normal; anyone else reads
--      "Jugadora 0042" in their language. The account copy never holds more
--      than the Normal level. The lists and `shown_names` follow it.
--   4. A type change on Nom goes through the change rules: what does not fit
--      is set aside, and she shows as her number.
--
-- Seed: organization ...000, admin ...001 (builder, every level), staff ...002
-- and ...003 (every level until trimmed below), players ...011 (Amina, ar)
-- and ...012 (Fàtima, ar).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

create function pg_temp.sys(p_key text) returns uuid language sql security definer as $$
  select id from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.label(p_field uuid) returns jsonb language sql security definer as $$
  select label from public.profile_fields where id = p_field;
$$;
create function pg_temp.first_name_answer(p_profile uuid) returns jsonb language sql security definer as $$
  select coalesce(a.value, public.decrypt_field(a.value_encrypted)::jsonb)
    from public.custom_answers a where a.profile_id = p_profile and a.question_id = pg_temp.sys('first_name');
$$;
create function pg_temp.account_first_name(p_profile uuid) returns text language sql security definer as $$
  select first_name from public.profiles where id = p_profile;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Her number -------------------------------------------------------------------------------------------------

select is(
  (select count(distinct member_number)::integer from public.profiles
    where org_id = '5eed0000-0000-4000-8000-000000000000'),
  (select count(*)::integer from public.profiles where org_id = '5eed0000-0000-4000-8000-000000000000'),
  'every profile of the organization has its own number');

update public.profiles set member_number = 1 where id = '5eed0000-0000-4000-8000-000000000011';
select isnt(
  (select member_number from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'), 1,
  'nobody changes her number');

-- Amina is number 42 for the rest of this test.
alter table public.profiles disable trigger profiles_assign_member_number;
update public.profiles set member_number = 42 where id = '5eed0000-0000-4000-8000-000000000011';
alter table public.profiles enable trigger profiles_assign_member_number;

-- 2. Her names are answers --------------------------------------------------------------------------------------

select is(pg_temp.first_name_answer('5eed0000-0000-4000-8000-000000000011'), to_jsonb('أمينة'::text),
  'her first name is an answer');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011',
       jsonb_build_object('answers', jsonb_build_object(pg_temp.sys('first_name')::text, 'Amina'))) $$,
  'staff write her first name as an answer');
select is(pg_temp.first_name_answer('5eed0000-0000-4000-8000-000000000011'), '"Amina"'::jsonb,
  'and it is stored there');
select is(pg_temp.account_first_name('5eed0000-0000-4000-8000-000000000011'), 'Amina',
  'the account copy follows while the name is Normal');
select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011', '{"first_name": "Aminah"}'::jsonb) $$,
  'an older path writes the name on her account');
select is(pg_temp.first_name_answer('5eed0000-0000-4000-8000-000000000011'), '"Aminah"'::jsonb,
  'and it becomes her answer');

-- 3. The display rule -------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_profile_field(pg_temp.sys('first_name'), null, 'short_text', pg_temp.label(pg_temp.sys('first_name')),
       null, 'personal', true, '[]'::jsonb, '{}'::jsonb) $$,
  'her first name becomes Personal');

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code in ('participants.view_personal', 'participants.view_sensitive');
update public.profiles set preferred_language = 'ca' where id = '5eed0000-0000-4000-8000-000000000003';
update public.profiles set preferred_language = 'en' where id = '5eed0000-0000-4000-8000-000000000002';
select is(pg_temp.account_first_name('5eed0000-0000-4000-8000-000000000011'), 'Jugadora 0042',
  'the account copy holds her number once the name is Personal');
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(private.display_name('5eed0000-0000-4000-8000-000000000011'),
  (select 'Jugadora 0042 ' || last_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'a team member without Personal reads "Jugadora 0042" and her Normal last name');
select is(
  (select first_name from public.list_participants() where id = '5eed0000-0000-4000-8000-000000000011'),
  'Jugadora 0042', 'the list shows her number');
select is(
  (select first_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'Jugadora 0042', 'her page shows her number');
select is(
  (select first_name from public.shown_names(array['5eed0000-0000-4000-8000-000000000011'::uuid])),
  'Jugadora 0042', 'the table readers get the same rule');
select is(
  (select count(*)::integer from public.list_participants(p_query => 'Aminah')),
  0, 'search does not find her by a name the reader may not read');
reset role;
select lives_ok(
  $$ update public.profiles set first_name = 'Someone' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  'a name written by someone who may not read it is taken');
select is(pg_temp.first_name_answer('5eed0000-0000-4000-8000-000000000011'), '"Aminah"'::jsonb,
  'but her name stays as it was');
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(private.shown_name('5eed0000-0000-4000-8000-000000000011', 'first_name'), 'Aminah',
  'a team member with Personal reads her name');
select is(
  (select count(*)::integer from public.list_participants(p_query => 'Aminah')),
  1, 'and finds her by it');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is((select first_name from public.get_own_profile()), 'Aminah', 'she reads her own name');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal1"}';
select is(private.shown_name('5eed0000-0000-4000-8000-000000000011', 'first_name'), 'اللاعبة 0042',
  'a fellow player reads her number, in Arabic');

reset role;
alter table public.profiles disable trigger profiles_assign_member_number;
update public.profiles set preferred_language = 'en' where id = '5eed0000-0000-4000-8000-000000000012';
alter table public.profiles enable trigger profiles_assign_member_number;
set local role authenticated;
select is(private.shown_name('5eed0000-0000-4000-8000-000000000011', 'first_name'), 'Player 0042',
  'and in English');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_profile_field(pg_temp.sys('first_name'), null, 'short_text', pg_temp.label(pg_temp.sys('first_name')),
       null, 'normal', true, '[]'::jsonb, '{}'::jsonb) $$,
  'back to Normal');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal1"}';
select is(private.shown_name('5eed0000-0000-4000-8000-000000000011', 'first_name'), 'Aminah',
  'a fellow player reads a Normal name');

-- 4. A type change on Nom ---------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select (p ->> 'not_converted')::integer > 0
     from public.preview_field_change(pg_temp.sys('first_name'), 'single_choice', 'normal',
            '[{"label": {"ca": "Anna"}}, {"label": {"ca": "Berta"}}]'::jsonb, '{}'::jsonb) p),
  true, 'the preview counts the names that do not fit a choice');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.sys('first_name'), null, 'single_choice', pg_temp.label(pg_temp.sys('first_name')),
       null, 'normal', true, '[{"label": {"ca": "Aminah"}}, {"label": {"ca": "Berta"}}]'::jsonb, '{}'::jsonb) $$,
  'Nom becomes a choice');
select is(private.shown_name('5eed0000-0000-4000-8000-000000000011', 'first_name'), 'Aminah',
  'a name that matches an option is kept, read as its label');
select is(private.shown_name('5eed0000-0000-4000-8000-000000000012', 'first_name'),
  'Jugadora ' || lpad((select member_number::text from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'), 4, '0'),
  'a name set aside leaves her number');

select * from finish();
rollback;

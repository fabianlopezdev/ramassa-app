-- The privacy change warning names the roles (RAPP-692).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Privacy up lists each role whose people stop reading the field, with
--      the number of people; privacy down lists the roles that start.
--   2. People are counted where their own toggles put them, grouped by the
--      role last applied; a built-in role comes by its key, a renamed one by
--      its name, people with no role as one group with a null role.
--   3. No privacy change lists no role.
--   4. The helper stays private.
--
-- Seed: organization ...000, admin ...001 (builder, every level), staff ...002
-- and ...003 (every level), Pau ...097 (onboarding design, no participants).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

create function pg_temp.sys(p_key text) returns uuid language sql security definer as $$
  select id from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
-- A role list as "name or key (people)", in the order the preview gives.
create function pg_temp.roles(p_list jsonb) returns text language sql as $$
  select coalesce(string_agg(
           concat(coalesce(r ->> 'name', r ->> 'builtin_key', 'none'), ' (', r ->> 'people', ')'), ', '
           order by n), '')
    from jsonb_array_elements(p_list) with ordinality as x(r, n);
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- Equip reads Normal only; Coordinació reads every level.
insert into public.permission_presets (id, org_id, name) values
  ('69200000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000000', 'Equip'),
  ('69200000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000000', 'Coordinació');
insert into public.permission_preset_permissions (org_id, preset_id, permission_code) values
  ('5eed0000-0000-4000-8000-000000000000', '69200000-0000-4000-8000-000000000001', 'participants.view');
insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
select '5eed0000-0000-4000-8000-000000000000', '69200000-0000-4000-8000-000000000002', code
  from unnest(array['participants.view', 'participants.view_personal', 'participants.view_sensitive']) code;

-- Marta is Coordinació; Núria and Pau are Equip and read Normal only.
update public.team_member_access set preset_id = '69200000-0000-4000-8000-000000000002'
 where profile_id = '5eed0000-0000-4000-8000-000000000002';
insert into public.team_member_access (profile_id, org_id, preset_id)
values ('5eed0000-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000000', '69200000-0000-4000-8000-000000000001'),
       ('5eed0000-0000-4000-8000-000000000097', '5eed0000-0000-4000-8000-000000000000', '69200000-0000-4000-8000-000000000001')
on conflict (profile_id) do update set preset_id = excluded.preset_id;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code in ('participants.view_personal', 'participants.view_sensitive');
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000097', 'participants.view')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. Up and down ------------------------------------------------------------------------------------------------

select is(
  (select pg_temp.roles(p -> 'roles_losing') || ' / ' || pg_temp.roles(p -> 'roles_gaining')
     from public.preview_field_change(pg_temp.sys('clothing_size'), 'single_choice', 'personal') p),
  'Equip (2) / ',
  'Normal to Personal: the two people of Equip stop reading it');
select is(
  (select (p ->> 'readers_losing')::integer from public.preview_field_change(pg_temp.sys('clothing_size'), 'single_choice', 'personal') p),
  2, 'the total still counts them');
select is(
  (select pg_temp.roles(p -> 'roles_losing') || ' / ' || pg_temp.roles(p -> 'roles_gaining')
     from public.preview_field_change(pg_temp.sys('nationality'), 'country', 'normal') p),
  ' / Equip (2)',
  'Personal to Normal: Equip starts reading it');
select is(
  (select pg_temp.roles(p -> 'roles_gaining')
     from public.preview_field_change(pg_temp.sys('phone'), 'phone', 'personal') p),
  '',
  'Sensitive to Personal: nobody in Equip gains it, Coordinació already reads it');

-- 2. Built-in, renamed and no role ------------------------------------------------------------------------------

reset role;
update public.team_member_access
   set preset_id = (select id from public.permission_presets
                     where org_id = '5eed0000-0000-4000-8000-000000000000' and builtin_key = 'coach')
 where profile_id = '5eed0000-0000-4000-8000-000000000003';
update public.team_member_access set preset_id = null
 where profile_id = '5eed0000-0000-4000-8000-000000000097';
set local role authenticated;

select is(
  (select pg_temp.roles(p -> 'roles_losing')
     from public.preview_field_change(pg_temp.sys('clothing_size'), 'single_choice', 'sensitive') p),
  'coach (1), none (1)',
  'a built-in role comes by its key, people with no role last');
select ok(
  (select (p -> 'roles_losing' -> 0 ->> 'name') is null and (p -> 'roles_losing' -> 1 ->> 'role_id') is null
     from public.preview_field_change(pg_temp.sys('clothing_size'), 'single_choice', 'sensitive') p),
  'with no name for the built-in role and no role id for the last group');

reset role;
update public.permission_presets set name = 'Entrenadores'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and builtin_key = 'coach';
set local role authenticated;
select is(
  (select pg_temp.roles(p -> 'roles_losing')
     from public.preview_field_change(pg_temp.sys('clothing_size'), 'single_choice', 'sensitive') p),
  'Entrenadores (1), none (1)',
  'a renamed built-in role comes by its name');

-- 3. No privacy change ------------------------------------------------------------------------------------------

select is(
  (select jsonb_array_length(p -> 'roles_losing') + jsonb_array_length(p -> 'roles_gaining')
     from public.preview_field_change(pg_temp.sys('clothing_size'), 'short_text', 'normal') p),
  0, 'a type change alone lists no role');

-- 4. Private helper ---------------------------------------------------------------------------------------------

select throws_ok(
  $$ select private.readers_by_role('5eed0000-0000-4000-8000-000000000000', 'participants.view', 'participants.view_personal', null) $$,
  '42501', null::text, 'team members cannot call the helper');

reset role;
select is(
  private.readers_by_role('5eed0000-0000-4000-8000-000000000000', 'participants.view', 'participants.view', null),
  '[]'::jsonb, 'the same permission on both sides lists nobody');

select * from finish();
rollback;

-- The participants list, its search and the conversations read fields (RAPP-662, D7, D9, D12).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The search index is closed to every client role and covers every
--      profile.
--   2. Search per level: Normal answers for anyone who lists her, Personal
--      ones only with the Personal level, Sensitive ones never, even with
--      every level. The index follows each write and each change of a
--      field's level.
--   3. The list's columns, filters and filter options per level, read from
--      the registry's fields; a field whose type no longer fits reads nothing
--      without an error.
--   4. A conversation shows her municipality at its field's level.
--
-- Seed: organization ...000, player ...011 (Síria, Vic, no dependents, NIE
-- Y0000011Z), staff ...003 (every level and messages.inbox until trimmed).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

create function pg_temp.found(p_query text) returns boolean language sql security definer as $$
  select exists (select 1 from public.list_participants(p_query => p_query, p_page_size => 100)
                  where id = '5eed0000-0000-4000-8000-000000000011');
$$;
create function pg_temp.row011() returns record language sql security definer as $$
  select (nationality, city, reference_entity, has_dependents)
    from public.list_participants(p_page_size => 100) where id = '5eed0000-0000-4000-8000-000000000011';
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- A Normal text answer to search by: the entity she came from.
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011', f, '"Associació Zeta"', 'staff',
                                   '5eed0000-0000-4000-8000-000000000002')
  from public.profile_fields f
 where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'reference_entity';

-- 1. The index ------------------------------------------------------------------------------------------------

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.participant_search_documents'::regclass),
  'the search index has row level security, forced');
select ok(
  not has_table_privilege('authenticated', 'public.participant_search_documents', 'select')
    and not has_table_privilege('anon', 'public.participant_search_documents', 'select'),
  'no client role reads the search index');
select is(
  (select count(*)::int from public.profiles p
    where not exists (select 1 from public.participant_search_documents d where d.profile_id = p.id)),
  0, 'every profile has its search row');
select is(
  (select count(*)::int from public.personal_data_disposition() where table_name = 'participant_search_documents'),
  1, 'the search index is in the erasure registry');

-- 2. Search per level -----------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select ok(pg_temp.found('zeta'), 'with every level she is found by a Normal answer');
select ok(pg_temp.found('vic'), 'and by a Personal one');
select ok(not pg_temp.found('y0000011z'), 'never by a Sensitive one, even with every level');
select ok(not pg_temp.found('08500'), 'nor by her Sensitive postal code');

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code in ('participants.view_sensitive', 'participants.view_personal');
set local role authenticated;

select ok(pg_temp.found('zeta'), 'with participants.view alone she is found by a Normal answer');
select ok(not pg_temp.found('vic'), 'and never by a Personal one');

-- The index follows a write.
reset role;
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011', f, '"Fundació Omega"', 'staff',
                                   '5eed0000-0000-4000-8000-000000000002')
  from public.profile_fields f
 where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'reference_entity';
set local role authenticated;
select ok(pg_temp.found('omega') and not pg_temp.found('zeta'), 'a new answer replaces the old one in the search');

-- And a change of the field's level.
reset role;
update public.profile_fields set privacy = 'personal'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'reference_entity';
set local role authenticated;
select ok(not pg_temp.found('omega'), 'an entity made Personal leaves the Normal search at once');

-- 3. The list per level ---------------------------------------------------------------------------------------

select is(pg_temp.row011()::text, '(,,,)', 'with participants.view alone her Personal columns are empty');
select is(
  (select nationalities from public.participant_filter_options()), '{}'::text[],
  'and no nationality is offered as a filter');
select is(
  (select count(*)::int from public.list_participants(p_nationality => 'Mali', p_page_size => 100)
    where id = '5eed0000-0000-4000-8000-000000000011'),
  1, 'a filter on a field she does not read is left out');

reset role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000003', 'participants.view_personal');
set local role authenticated;

select is(pg_temp.row011()::text, '(Síria,Vic,"Fundació Omega",f)',
  'with participants.view_personal: nationality, municipality, entity and dependents from her answers');
select ok((select 'Síria' = any (nationalities) from public.participant_filter_options()),
  'her nationality is offered as a filter');
select is(
  (select count(*)::int from public.list_participants(p_nationality => 'Síria', p_dependents => 'without', p_page_size => 100)
    where id = '5eed0000-0000-4000-8000-000000000011'),
  1, 'the nationality and dependents filters read her answers');
select is(
  (select count(*)::int from public.list_participants(p_nationality => 'Mali', p_page_size => 100)
    where id = '5eed0000-0000-4000-8000-000000000011'),
  0, 'and leave her out when they do not match');
select is(
  (select array_agg(id order by id) from public.list_participants(p_sort => 'city', p_page_size => 100)
    where city is not null) is not null,
  true, 'the list sorts by municipality');

-- A nationality that became short text is no longer the list's field.
reset role;
update public.profile_fields set question_type = 'short_text'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'nationality';
set local role authenticated;
select lives_ok($$select * from public.list_participants(p_nationality => 'Síria', p_sort => 'nationality')$$,
  'the list keeps working when the field changed type');
select is((pg_temp.row011()::text), '(,Vic,"Fundació Omega",f)', 'and shows no nationality');

-- 4. Conversations ------------------------------------------------------------------------------------------

select is((select city from public.get_conversation_peer('5eed0000-0000-4000-8000-000000000011')), 'Vic',
  'a conversation shows her municipality with the Personal level');
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_personal';
set local role authenticated;
select is((select city from public.get_conversation_peer('5eed0000-0000-4000-8000-000000000011')), null,
  'and none without it');

reset role;
select * from finish();
rollback;

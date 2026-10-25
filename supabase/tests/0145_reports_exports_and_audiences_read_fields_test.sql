-- The impact report, the exports and the notification audiences read fields (RAPP-662, D7, D9).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The participants export has one column per field; the default scope
--      holds Normal and Personal fields and never a Sensitive one, the full
--      scope every level; a field made Sensitive leaves the default scope.
--      Staff fields are columns too, and the custom answers dataset holds the
--      app's fields.
--   2. The impact report reads age and nationality from their fields, and a
--      field whose type no longer fits counts as unknown without an error.
--   3. Audiences match her entity from its field, at its level for the sender.
--
-- Seed: organization ...000, admin ...001 (every export permission), staff
-- ...003, player ...011 (Síria, born 1996).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

create temp table run (label text primary key, doc jsonb) on commit drop;
grant all on run to authenticated;

create function pg_temp.matches(p_entity text) returns boolean language sql security definer as $$
  select private.matches_notification_audience('5eed0000-0000-4000-8000-000000000011', 'entity',
                                               jsonb_build_object('entity_name', p_entity));
$$;
grant execute on all functions in schema pg_temp to authenticated;

select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011', f, '"Associació Zeta"', 'staff',
                                   '5eed0000-0000-4000-8000-000000000002')
  from public.profile_fields f
 where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'reference_entity';

-- 1. The participants export ---------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

insert into run values
  ('default', public.create_data_export('participants', 'default', 'csv', null, null, null, false)),
  ('full', public.create_data_export('participants', 'full', 'csv', null, null, 'Participant access request', true));

select ok(
  (select doc -> 'columns' from run where label = 'default') ?& array['id', 'first_name', 'last_name', 'date_of_birth', 'nationality', 'city', 'reference_entity', 'clothing_size'],
  'the default scope has a column for each Normal and Personal field');
select ok(
  not ((select doc -> 'columns' from run where label = 'default') ?| array['phone', 'address', 'postal_code', 'document_number', 'applicant_status', 'specific_needs']),
  'and no Sensitive one');
select ok(
  (select doc -> 'columns' from run where label = 'default') ? 'Vens amb transport públic?',
  'a field the team added is a column, by its Catalan name');
select ok(
  (select doc -> 'columns' from run where label = 'full') ?& array['phone', 'document_number', 'specific_needs'],
  'the full scope holds the Sensitive fields too');
select is(
  (select r ->> 'nationality' || '|' || (r ->> 'reference_entity')
     from run, jsonb_array_elements(doc -> 'rows') r
    where label = 'default' and r ->> 'id' = '5eed0000-0000-4000-8000-000000000011'),
  'Síria|Associació Zeta', 'each value is her answer as text');
select is(
  (select r ->> 'phone' from run, jsonb_array_elements(doc -> 'rows') r
    where label = 'full' and r ->> 'id' = '5eed0000-0000-4000-8000-000000000011'),
  '+34600000011', 'the full scope decrypts her Sensitive answers');
select is(
  (select count(*)::int from run, jsonb_array_elements(doc -> 'rows') r, jsonb_object_keys(r) k
    where label = 'default' and not (doc -> 'columns') ? k),
  0, 'no row carries a column the export does not declare');

reset role;
update public.profile_fields set privacy = 'sensitive'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'nationality';
set local role authenticated;
select ok(
  not (public.create_data_export('participants', 'default', 'csv', null, null, null, false) -> 'columns' ? 'nationality'),
  'a field made Sensitive leaves the default export');
select ok(
  (select count(*) from jsonb_array_elements(
     public.create_data_export('custom_answers', 'default', 'csv', null, null, null, false) -> 'rows') r
    where r ->> 'question' = 'Data de naixement') > 0,
  'the answers export holds the app''s fields too');

-- 2. The impact report ---------------------------------------------------------------------------------------

reset role;
update public.profile_fields set privacy = 'personal'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'nationality';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run values ('report', public.get_impact_report(current_date - 3650, current_date));
select ok(
  (select sum((b ->> 'count')::int) filter (where b ->> 'label' <> 'unknown') from run,
          jsonb_array_elements(doc #> '{demographics,age_bands}') b where label = 'report') > 0
    or (select bool_or((b ->> 'suppressed')::boolean) from run,
          jsonb_array_elements(doc #> '{demographics,age_bands}') b where label = 'report' and b ->> 'label' <> 'unknown'),
  'the report places players in age bands from their date of birth');
select ok(
  (select bool_or(b ->> 'label' = 'Síria') from run,
          jsonb_array_elements(doc #> '{demographics,nationalities}') b where label = 'report'),
  'and groups them by nationality from their answers');

reset role;
update public.profile_fields set question_type = 'short_text'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key in ('date_of_birth', 'nationality');
set local role authenticated;
select lives_ok(
  $$insert into run values ('changed', public.get_impact_report(current_date - 3650, current_date))$$,
  'the report keeps working when its fields changed type');
select is(
  (select array_agg(distinct b ->> 'label') from run,
          jsonb_array_elements(doc #> '{demographics,nationalities}') b where label = 'changed'),
  array['unknown'], 'and counts every nationality as unknown');
select is(
  (select array_agg(distinct b ->> 'label') from run,
          jsonb_array_elements(doc #> '{demographics,age_bands}') b where label = 'changed' and (b ->> 'count')::int > 0),
  array['unknown'], 'and every age as unknown');

-- 3. Audiences -----------------------------------------------------------------------------------------------

select ok((select 'Associació Zeta' = any (array(select public.notification_audience_entities()))),
  'a sender can target the entity she came from');

reset role;
update public.profile_fields set privacy = 'sensitive'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'reference_entity';
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_sensitive';
set local role authenticated;
select ok(not (select 'Associació Zeta' = any (array(select public.notification_audience_entities()))),
  'an entity made Sensitive is not offered to a sender without that level');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select ok(pg_temp.matches('associació zeta '), 'a survey for her entity still reaches her');

reset role;
select * from finish();
rollback;

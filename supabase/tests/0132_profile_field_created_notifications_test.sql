-- A new field rings the other designers' bells (RAPP-650).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A field the designer creates records her as its creator, also through
--      the old question writer (the compatibility view has no creator).
--   2. The admin's bell gets `field_created` with the field's name and the
--      Fitxa's path; the designer who created it gets nothing, nor does a
--      staff member without a design permission.
--   3. Built-in fields and rows written with nobody signed in ring nothing.
--   4. The answer count is for designers only, inside their organization.
--
-- Seed: admin ...001 (settings.organization), staff ...002 (no design
-- permission), designer ...097 (onboarding.design), player ...011 of
-- organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

-- 1. The creator ---------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run select 'gloves', public.save_profile_field(
  null, (select id from public.profile_sections where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'sizes'),
  'short_text', '{"ca": "Talla de guants"}'::jsonb, null, 'normal');
insert into run select 'legacy', public.save_custom_question(
  p_id => null,
  p_screen_id => (select id from public.intake_screens where org_id = '5eed0000-0000-4000-8000-000000000000' limit 1),
  p_type => 'short_text', p_label => '{"ca": "Pregunta antiga"}'::jsonb, p_help => null,
  p_privacy => 'personal', p_placements => array['wizard'], p_settings => '{}'::jsonb, p_options => '[]'::jsonb);
reset role;

select is(
  (select created_by from public.profile_fields where id = (select id from run where label = 'gloves')),
  '5eed0000-0000-4000-8000-000000000097'::uuid,
  'a new field records who created it'
);
select is(
  (select created_by from public.profile_fields where id = (select id from run where label = 'legacy')),
  '5eed0000-0000-4000-8000-000000000097'::uuid,
  'so does a question written through the old form'
);

-- 2. The bell ------------------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.staff_notifications
    where event = 'field_created' and source_id = (select id from run where label = 'gloves')
      and recipient_id = '5eed0000-0000-4000-8000-000000000001'),
  1,
  'the admin is told'
);
select is(
  (select count(*)::integer from public.staff_notifications
    where event = 'field_created' and recipient_id = '5eed0000-0000-4000-8000-000000000097'),
  0,
  'the designer who added it is not'
);
select is(
  (select count(*)::integer from public.staff_notifications
    where event = 'field_created' and recipient_id = '5eed0000-0000-4000-8000-000000000002'),
  0,
  'nor a staff member who does not design the layout'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select results_eq(
  format($$ select name, path from public.list_staff_notifications(30)
             where event = 'field_created' and id in (
               select n.id from public.staff_notifications n where n.source_id = '%s') $$,
         (select id from run where label = 'gloves')),
  $$ values ('Talla de guants'::text, '/settings?tab=profile-layout'::text) $$,
  'her bell names the field and opens the Fitxa'
);
reset role;

-- 3. Nothing for built-in fields or the seed ----------------------------------------------------------

select is(
  (select count(*)::integer from public.staff_notifications n
     join public.profile_fields f on f.id = n.source_id
    where n.event = 'field_created' and f.kind = 'builtin'),
  0,
  'built-in fields ring nothing'
);
with quiet as (
  insert into public.profile_fields (org_id, section_id, kind, question_type, label, privacy)
  select '5eed0000-0000-4000-8000-000000000000', id, 'custom', 'short_text', '{"ca": "Sense ningú"}'::jsonb, 'normal'
    from public.profile_sections where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'
  returning id
)
insert into run select 'quiet', id from quiet;
select is(
  (select count(*)::integer from public.staff_notifications
    where source_id = (select id from run where label = 'quiet')),
  0,
  'a row written with nobody signed in rings nothing'
);

-- 4. The answer count ----------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  public.profile_field_answer_count((select id from run where label = 'gloves')),
  0,
  'a new field keeps no answers'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.profile_field_answer_count('%s') $$, (select id from run where label = 'gloves')),
  '42501', null::text,
  'a staff member who does not design the layout cannot count answers'
);
reset role;
set local role anon;
select throws_ok(
  $$ select public.profile_field_answer_count('5eed0000-0000-4000-8045-000000000001') $$,
  '42501', null::text,
  'nor can anon'
);
reset role;

select * from finish();

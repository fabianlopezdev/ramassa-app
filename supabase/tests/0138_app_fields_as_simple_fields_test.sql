-- The app's fields become simple fields with system keys (RAPP-660, D1, D4, D5).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. `builtin_key` is now `system_key`: still one per organization, and only
--      the app's own keys.
--   2. The composite fields are split, each part with its type and level,
--      next to its first part in the section, on the surfaces the first part
--      is on (the entity form only where the referral form asks the part),
--      never required on a placement, shown on the answer that opens it.
--   3. Every app field takes the type of what it stores, and the app's choice
--      fields have options with stable keys, unique per field.
--   4. A new organization gets the same layout.
--   5. `private.write_custom_answer` takes every app field but her names, and a
--      Sensitive one is stored encrypted.
--   6. The catalog sends the system key and the option keys; an older setup
--      file that names `builtin_key` and the composite questions still
--      imports, and its organization ends with the same app placements.
--
-- Seed: organization ...000, admin ...001, player ...011.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

create temp table run (label text primary key, doc jsonb) on commit drop;
grant all on run to authenticated;

create function pg_temp.field(p_org uuid, p_key text) returns uuid language sql as $$
  select id from public.profile_fields where org_id = p_org and system_key = p_key;
$$;
create function pg_temp.app_placements(p_org uuid) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('key', f.system_key, 'surface', p.surface, 'screen', p.screen_key,
                                      'required', p.required)
                   order by f.system_key, p.surface)
    from public.field_placements p join public.profile_fields f on f.id = p.field_id
   where p.org_id = p_org and f.kind = 'builtin';
$$;

-- 1. One key name -------------------------------------------------------------------------------------------

select hasnt_column('public', 'profile_fields', 'builtin_key', 'builtin_key is gone');
select has_column('public', 'profile_fields', 'system_key', 'system_key names the app''s fields');
select throws_ok(
  $$ insert into public.profile_fields (org_id, section_id, kind, system_key, question_type, label, privacy)
     select org_id, section_id, 'builtin', 'phone', 'phone', '{"ca": "Telèfon 2"}', 'sensitive'
       from public.profile_fields where id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'phone') $$,
  '23505', null::text,
  'a system key is unique per organization'
);
select throws_ok(
  $$ insert into public.profile_fields (org_id, section_id, kind, system_key, question_type, label, privacy)
     select org_id, section_id, 'builtin', 'favourite_colour', 'short_text', '{"ca": "Color"}', 'normal'
       from public.profile_fields where id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'phone') $$,
  '23514', null::text,
  'and only the app''s own keys exist'
);

-- 2. The split fields ---------------------------------------------------------------------------------------

select results_eq(
  $$ select f.system_key, f.question_type, f.privacy, s.key
       from public.profile_fields f join public.profile_sections s on s.id = f.section_id
      where f.org_id = '5eed0000-0000-4000-8000-000000000000'
        and f.system_key in ('document_type', 'document_number', 'document_name', 'has_dependents',
                             'num_dependents', 'applicant_status', 'applicant_status_details',
                             'specific_needs', 'specific_needs_details')
      order by s.sort_order, f.sort_order $$,
  $$ values ('document_type', 'single_choice', 'personal', 'identity'),
            ('document_number', 'short_text', 'sensitive', 'identity'),
            ('document_name', 'short_text', 'personal', 'identity'),
            ('has_dependents', 'single_choice', 'personal', 'contact'),
            ('num_dependents', 'number', 'personal', 'contact'),
            ('applicant_status', 'single_choice', 'sensitive', 'situation'),
            ('applicant_status_details', 'long_text', 'sensitive', 'situation'),
            ('specific_needs', 'multiple_choice', 'sensitive', 'health_needs'),
            ('specific_needs_details', 'long_text', 'sensitive', 'health_needs') $$,
  'each composite field is split into simple fields, each with its type and level, next to its first part'
);
select hasnt_column('public', 'profile_fields', 'legacy_screen_id', 'no old column comes back');
select is(
  (select count(*)::integer from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key in ('document', 'dependents')),
  0,
  'the composite keys are gone'
);
select results_eq(
  $$ select f.system_key, p.sort_order from public.field_placements p
       join public.profile_fields f on f.id = p.field_id
      where p.org_id = '5eed0000-0000-4000-8000-000000000000' and p.surface = 'onboarding'
        and p.screen_key = 'documentation'
      order by p.sort_order $$,
  $$ values ('document_type', 0), ('document_number', 1), ('document_name', 2) $$,
  'the document parts are asked on the document screen, in order'
);
select results_eq(
  $$ select f.system_key from public.field_placements p
       join public.profile_fields f on f.id = p.field_id
      where p.org_id = '5eed0000-0000-4000-8000-000000000000' and p.surface = 'onboarding'
        and p.screen_key = 'logistics'
      order by p.sort_order $$,
  $$ values ('phone'), ('address'), ('city'), ('postal_code'), ('reference_entity'),
            ('reference_contact_name'), ('has_dependents'), ('num_dependents') $$,
  'the logistics screen asks what it asked, how many after the yes'
);
select results_eq(
  $$ select f.system_key from public.field_placements p
       join public.profile_fields f on f.id = p.field_id
      where p.org_id = '5eed0000-0000-4000-8000-000000000000' and p.surface = 'season' and f.kind = 'builtin'
      order by p.sort_order $$,
  $$ values ('applicant_status'), ('applicant_status_details'), ('supporting_entities'), ('childcare_need'),
            ('specific_needs'), ('specific_needs_details') $$,
  'every season asks the same, the details with their choice'
);
select results_eq(
  $$ select f.system_key from public.field_placements p
       join public.profile_fields f on f.id = p.field_id
      where p.org_id = '5eed0000-0000-4000-8000-000000000000' and p.surface = 'entity_form'
        and f.system_key in ('document_number', 'document_name', 'applicant_status_details', 'specific_needs_details')
      order by f.system_key $$,
  $$ values ('document_number'), ('specific_needs_details') $$,
  'the entity form takes the parts the referral form asks, and only those'
);
select is(
  (select count(*)::integer from public.field_placements p
     join public.profile_fields f on f.id = p.field_id
    where f.system_key in ('document_number', 'document_name', 'num_dependents',
                           'applicant_status_details', 'specific_needs_details')
      and p.required),
  0,
  'a part is never required on a placement'
);
select is(
  (select p.required from public.field_placements p
    where p.field_id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'has_dependents')
      and p.surface = 'onboarding'),
  true,
  'the first part keeps its question''s required flag'
);
select results_eq(
  $$ select child.system_key, gate.system_key, o.key
       from public.profile_fields child
       join public.profile_fields gate on gate.id = child.show_when_field_id
       join public.custom_question_options o on o.id = child.show_when_option_id
      where child.org_id = '5eed0000-0000-4000-8000-000000000000' and child.kind = 'builtin'
      order by child.system_key $$,
  $$ values ('applicant_status_details', 'applicant_status', 'other'),
            ('document_name', 'document_type', 'other'),
            ('num_dependents', 'has_dependents', 'yes') $$,
  'a part is shown on the answer that opens it'
);

-- 3. Types and option keys ------------------------------------------------------------------------------------

select results_eq(
  $$ select system_key, question_type, settings from public.profile_fields
      where org_id = '5eed0000-0000-4000-8000-000000000000'
        and system_key in ('nationality', 'city', 'place_of_birth', 'supporting_entities', 'num_dependents')
      order by system_key $$,
  $$ values ('city', 'municipality', '{}'::jsonb), ('nationality', 'country', '{}'::jsonb),
            ('num_dependents', 'number', '{"integer": true, "min": 1, "max": 15}'::jsonb),
            ('place_of_birth', 'short_text', '{}'::jsonb),
            ('supporting_entities', 'item_list', '{"max_items": 20}'::jsonb) $$,
  'each app field takes the type of what it stores'
);
select results_eq(
  $$ select o.key, o.label ->> 'ca' from public.custom_question_options o
      where o.question_id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'document_type')
      order by o.sort_order $$,
  $$ values ('nie', 'NIE'), ('passport', 'Passaport'), ('other', 'Un altre'), ('none', 'No en tinc') $$,
  'the document types are options keyed by the string the app stores, labelled as her phone says them'
);
select is(
  (select array_agg(o.key order by o.sort_order) from public.custom_question_options o
    where o.question_id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'shoe_size')),
  array['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  'the shoe sizes too'
);
select is(
  (select array_agg(o.key order by o.sort_order) from public.custom_question_options o
    where o.question_id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'specific_needs')),
  array['accessibility', 'health', 'communication', 'wellbeing', 'other', 'none'],
  'and the needs'
);
select throws_ok(
  $$ insert into public.custom_question_options (org_id, question_id, key, label)
     values ('5eed0000-0000-4000-8000-000000000000',
             pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'clothing_size'), 'S', '{"ca": "S bis"}') $$,
  '23505', null::text,
  'an option key is unique per field'
);
select throws_ok(
  $$ insert into public.custom_question_options (org_id, question_id, key, label)
     values ('5eed0000-0000-4000-8000-000000000000',
             pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'clothing_size'), 'no spaces', '{"ca": "X"}') $$,
  '23514', null::text,
  'and a plain name'
);
select is(
  (select count(*)::integer from public.custom_question_options o
     join public.profile_fields f on f.id = o.question_id
    where f.kind = 'custom' and o.key is not null),
  0,
  'options staff wrote have no key'
);

-- 4. A new organization ---------------------------------------------------------------------------------------

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000007f0', 'Organització nova', 'nova-660');
select is(
  (select count(*)::integer from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-0000000007f0' and kind = 'builtin'),
  cardinality(private.system_field_keys()),
  'a new organization gets every app field'
);
select is(
  pg_temp.app_placements('5eed0000-0000-4000-8000-0000000007f0'),
  pg_temp.app_placements('5eed0000-0000-4000-8000-000000000000'),
  'placed where the existing organization has them'
);
select is(
  (select count(*)::integer from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-0000000007f0' and show_when_field_id is not null),
  3,
  'with the same conditions'
);

-- 5. Answers --------------------------------------------------------------------------------------------------

select lives_ok(
  $$ select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
       (select f from public.profile_fields f where f.id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'city')),
       '"Manlleu"'::jsonb, 'staff', '5eed0000-0000-4000-8000-000000000001') $$,
  'an app field answers in the answer store'
);
select is(
  (select value from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and question_id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'city')),
  '"Manlleu"'::jsonb,
  'a Personal answer is stored as it is'
);
select lives_ok(
  $$ select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
       (select f from public.profile_fields f
         where f.id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'document_number')),
       '"Y7654321Z"'::jsonb, 'staff', '5eed0000-0000-4000-8000-000000000001') $$,
  'a Sensitive app field answers too'
);
select is(
  (select value is null and public.decrypt_field(value_encrypted) = '"Y7654321Z"'
     from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and question_id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'document_number')),
  true,
  'and is stored encrypted'
);
select throws_ok(
  $$ select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
       (select f from public.profile_fields f
         where f.id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'nationality')),
       '"Syria"'::jsonb, 'staff') $$,
  '23514', 'the answer does not fit the question',
  'an answer that does not fit the type is refused'
);
select lives_ok(
  $$ select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
       (select f from public.profile_fields f
         where f.id = pg_temp.field('5eed0000-0000-4000-8000-000000000000', 'last_name')),
       '"Puig"'::jsonb, 'staff') $$,
  'her names are answers (RAPP-693)'
);

-- 6. The catalog and the setup file ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, doc) values ('catalog', public.intake_catalog());
insert into run (label, doc) values ('export', public.export_onboarding_setup(null));
reset role;

select is(
  (select f -> 'options' -> 0 ->> 'key' from run, jsonb_array_elements(doc -> 'fields') f
    where label = 'catalog' and f ->> 'system_key' = 'document_type'),
  'nie',
  'the catalog names each app field by its system key and sends the option keys'
);
select is(
  (select count(*)::integer from run, jsonb_array_elements(doc -> 'fields') f
    where label = 'export' and f ? 'builtin_key'),
  0,
  'the setup file names system keys only'
);

-- A file exported before the split: builtin_key, the composite questions, no parts.
insert into run (label, doc)
select 'legacy', doc || jsonb_build_object(
  'fields', (select jsonb_agg(case when f ->> 'kind' = 'builtin'
                                   then (f - 'system_key') || jsonb_build_object(
                                          'builtin_key', case f ->> 'system_key'
                                                           when 'document_type' then 'document'
                                                           when 'has_dependents' then 'dependents'
                                                           else f ->> 'system_key' end,
                                          'options', '[]'::jsonb,
                                          'show_when_field_id', null, 'show_when_option_id', null)
                                   else f end)
               from jsonb_array_elements(doc -> 'fields') f
              where coalesce(f ->> 'system_key', '') not in
                    ('document_number', 'document_name', 'num_dependents', 'applicant_status_details',
                     'specific_needs_details')),
  'placements', (select jsonb_agg(p) from jsonb_array_elements(doc -> 'placements') p
                  where not exists (
                    select 1 from jsonb_array_elements(doc -> 'fields') f
                     where f ->> 'id' = p ->> 'field_id'
                       and f ->> 'system_key' in ('document_number', 'document_name', 'num_dependents',
                                                  'applicant_status_details', 'specific_needs_details'))))
  from run where label = 'export';

insert into auth.users (id, email) values ('5eed0000-0000-4000-8000-0000000007f1', 'admin-660@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('5eed0000-0000-4000-8000-0000000007f1', '5eed0000-0000-4000-8000-0000000007f0', 'admin', 'Admin', 'Nova')
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-0000000007f0', '5eed0000-0000-4000-8000-0000000007f1', 'settings.organization')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000007f1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'legacy')) $$,
  'a file that names builtin_key and the composite questions still imports'
);
reset role;
select is(
  pg_temp.app_placements('5eed0000-0000-4000-8000-0000000007f0'),
  pg_temp.app_placements('5eed0000-0000-4000-8000-000000000000'),
  'and its organization asks the app fields where the exporting one does, parts included'
);

select * from finish();
rollback;

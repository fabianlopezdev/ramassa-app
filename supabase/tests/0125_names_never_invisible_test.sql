-- A name of only invisible characters or only combining marks is blank on
-- every path that takes a person's name (RAPP-624, verifier round 2).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Each character class below, alone, is refused as a first or last name
--      on every path: her direct write, update_own_profile, staff's direct
--      write, update_participant_profile, the three invitations, the test
--      scenario's fill, the walk-in signing, the entity referral and a
--      required emergency contact.
--   2. A real letter with an invisible character is still a name: the edges
--      are trimmed, inner characters stay (a Persian zero-width non-joiner).
--   3. An optional contact's name of only invisible characters is saved as no
--      answer (null): the emergency contact and the reference contact.
--   4. Parity with the shared Zod schema: the single code points
--      private.name_trim treats as blank, in the planes that hold any (0, 1
--      and 14), are exactly the ranges between the markers below.
--      tests/person-name-parity.test.ts checks the same ranges against the
--      Unicode properties the schema uses.
--
-- Seed: admin ...001, staff ...002 (consents.collect), entity contact ...004,
-- design role ...097, real players ...011, ...012 and ...022 (not signed for
-- 2026/27), test player ...096; version 1 (...8041-...001) is current.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(351);

-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, private.app_answer_value(f, e.value)), '{}'::jsonb)
    from jsonb_each(p) e
    join public.profile_fields f on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = e.key;
$$;
create function pg_temp.field(p_key text) returns text language sql security definer as $$
  select id::text from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.stored(p_profile uuid, p_key text) returns jsonb language sql security definer as $$
  select private.system_field_answer(p_profile, p_key);
$$;
grant execute on all functions in schema pg_temp to authenticated;

create temp table blank (ordinal integer primary key, label text, value text) on commit drop;
grant all on blank to authenticated;
insert into blank (ordinal, label, value) values
  (1, 'a tab', E'\t'),
  (2, 'a no-break space U+00A0', U&'\00A0'),
  (3, 'an ideographic space U+3000', U&'\3000'),
  (4, 'a zero-width space U+200B', U&'\200B'),
  (5, 'a next line U+0085', U&'\0085'),
  (6, 'a left-to-right mark U+200E', U&'\200E'),
  (7, 'a right-to-left mark U+200F', U&'\200F'),
  (8, 'an Arabic letter mark U+061C', U&'\061C'),
  (9, 'a soft hyphen U+00AD', U&'\00AD'),
  (10, 'a combining grapheme joiner U+034F', U&'\034F'),
  (11, 'an invisible times U+2062', U&'\2062'),
  (12, 'a right-to-left override U+202E', U&'\202E'),
  (13, 'a left-to-right isolate U+2066', U&'\2066'),
  (14, 'a Hangul filler U+3164', U&'\3164'),
  (15, 'a halfwidth Hangul filler U+FFA0', U&'\FFA0'),
  (16, 'a Hangul choseong filler U+115F', U&'\115F'),
  (17, 'a Mongolian variation selector U+180B', U&'\180B'),
  (18, 'a variation selector U+FE0F', U&'\FE0F'),
  (19, 'a tag space U+E0020', U&'\+0E0020'),
  (20, 'a variation selector U+E0100', U&'\+0E0100'),
  (21, 'a combining acute accent U+0301', U&'\0301'),
  (22, 'two combining marks', U&'\0301\0308'),
  (23, 'an Arabic fatha U+064E', U&'\064E'),
  (24, 'a combining mark between invisible characters', U&'\200B\0301\200E'),
  (25, 'a Khmer inherent vowel U+17B4', U&'\17B4'),
  (26, 'a mix of them', U&'\00A0\200B\0009\3000\FEFF\200E\+0E0020');

-- A signing every version-1 path accepts, and version 1 with the contact required.
create temp table walk_in_payload (payload jsonb) on commit drop;
grant all on walk_in_payload to authenticated;
insert into walk_in_payload (payload) values (jsonb_build_object(
  'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                 'code_of_conduct', true, 'health_data', true),
  'health_info', 'No', 'signature', '[[[10,20],[30,40]]]'::jsonb, 'language', 'ca', 'device', 'iPad'));
create temp table contact_required_version (content jsonb) on commit drop;
insert into contact_required_version (content)
select jsonb_set(content, '{questions,emergency_contact,required}', 'true'::jsonb)
  from public.authorization_versions where id = '5eed0000-0000-4000-8041-000000000001';

set local role authenticated;

-- 1. Every path refuses each class ---------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  format($$ update public.profiles set first_name = %L where id = '5eed0000-0000-4000-8000-000000000011' $$, value),
  '23514', null::text, 'her direct write refuses a first name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select public.update_own_profile(jsonb_build_object('first_name', 'Amina', 'last_name', %L)) $$, value),
  '23514', null::text, 'update_own_profile refuses a last name of ' || label)
  from blank order by ordinal;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ update public.profiles set last_name = %L where id = '5eed0000-0000-4000-8000-000000000012' $$, value),
  '23514', null::text, 'staff''s direct write refuses a last name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select public.submit_walk_in_signing(gen_random_uuid(), %L, 'Haddad',
              '5eed0000-0000-4000-8041-000000000001', (select payload from walk_in_payload), now()) $$, value),
  '23514', null::text, 'a walk-in signing refuses a first name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select public.submit_walk_in_signing(gen_random_uuid(), 'Rim', %L,
              '5eed0000-0000-4000-8041-000000000001', (select payload from walk_in_payload), now()) $$, value),
  '23514', null::text, 'a walk-in signing refuses a last name of ' || label)
  from blank order by ordinal;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000012',
                     jsonb_build_object('first_name', %L, 'last_name', 'Haddad')) $$, value),
  '23514', null::text, 'update_participant_profile refuses a first name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select * from public.create_participant_invite(jsonb_build_object(
                     'email', 'invisible-name-%s@example.test', 'first_name', %L, 'last_name', 'Prova')) $$,
         ordinal, value),
  '22023', null::text, 'an invitation refuses a first name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select * from public.invite_staff_member('invisible-staff-%s@example.test', 'Prova', %L, 'staff') $$,
         ordinal, value),
  '23514', null::text, 'a staff invitation refuses a last name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select * from public.invite_entity_collaborator(gen_random_uuid(),
                     'invisible-collaborator-%s@example.test', %L, 'Prova') $$, ordinal, value),
  '23514', null::text, 'a collaborator invitation refuses a first name of ' || label)
  from blank order by ordinal;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
                     jsonb_build_object('kind', 'answers', 'fill', jsonb_build_object('last_name', %L))) $$, value),
  '23502', null::text, 'the scenario fill refuses a last name of ' || label)
  from blank order by ordinal;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.create_entity_referral(jsonb_build_object(
                     'firstName', %L, 'lastName', 'Sylla', 'documentationStatus', 'missing',
                     'consentConfirmed', true)) $$, value),
  '23514', null::text, 'a referral refuses a first name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select public.create_entity_referral(jsonb_build_object(
                     'firstName', 'Awa', 'lastName', %L, 'documentationStatus', 'missing',
                     'consentConfirmed', true)) $$, value),
  '23514', null::text, 'a referral refuses a last name of ' || label)
  from blank order by ordinal;

-- A required emergency contact (the check every signing path runs).
reset role;
select throws_ok(
  format($$ select private.validate_signing_payload(
              jsonb_set((select payload from walk_in_payload), '{emergency_contact}',
                        jsonb_build_object('name', %L, 'relation', 'Germana', 'phone', '+34600222333')),
              (select content from contact_required_version)) $$, value),
  '23514', null::text, 'a required emergency contact refuses a name of ' || label)
  from blank order by ordinal;

-- 2. A real letter with an invisible character is still a name -----------------------------------

select lives_ok(
  $$ select private.validate_signing_payload(
       jsonb_set((select payload from walk_in_payload), '{emergency_contact}',
                 jsonb_build_object('name', U&'Olena\200F', 'relation', 'Germana', 'phone', '+34600222333')),
       (select content from contact_required_version)) $$,
  'a required emergency contact accepts a name with a trailing direction mark'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.submit_walk_in_signing('0b5e0000-0000-4000-8125-000000000001', U&'Rim\200E', U&'\200Fمه\200Cرو',
       '5eed0000-0000-4000-8041-000000000001', (select payload from walk_in_payload), now()) $$,
  'a walk-in with direction marks around a real name signs'
);
select lives_ok(
  $$ select public.record_staff_device_signature('0b5e0000-0000-4000-8125-000000000002',
       '5eed0000-0000-4000-8000-000000000022', '5eed0000-0000-4000-8041-000000000001',
       jsonb_set((select payload from walk_in_payload), '{emergency_contact}',
                 jsonb_build_object('name', U&'\200E\3164', 'relation', 'Germana', 'phone', '+34600222333')),
       now()) $$,
  'a signing with an optional emergency contact name of only invisible characters is accepted'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.create_entity_referral(jsonb_build_object(
       'first_name', U&'\+0E0020Awa', 'last_name', U&'Sylla\00AD', 'documentationStatus', 'missing',
       'answers', jsonb_build_object(pg_temp.field('reference_contact_name'), U&'\200E\3164'),
       'consentConfirmed', true)) $$,
  'a referral with invisible edges around real names is accepted'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select lives_ok(
  $$ update public.profiles set first_name = U&'Jose\0301' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  'her direct write accepts a letter with a combining accent'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       jsonb_build_object('kind', 'answers', 'fill', jsonb_build_object('first_name', U&'\2066Joana\2069'))) $$,
  'the scenario fill accepts a name wrapped in an isolate'
);

reset role;
select is(
  (select first_name || '|' || last_name from public.walk_in_signings where id = '0b5e0000-0000-4000-8125-000000000001'),
  U&'Rim|مه\200Cرو',
  'the walk-in is saved without the edges and keeps her inner zero-width non-joiner'
);
select is(
  (select referred_first_name || '|' || referred_last_name from public.entity_referrals
    where referred_first_name like '%Awa' order by created_at desc limit 1),
  'Awa|Sylla',
  'the referral is saved without the edges'
);
select is(
  (select first_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000096'),
  'Joana',
  'the scenario fill saves the name without the isolate'
);

-- 3. An optional contact's name of only invisible characters is no answer -------------------------

select is(
  (select emergency_contact_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000022'),
  null,
  'the emergency contact name of only invisible characters is saved as no answer'
);
select is(
  private.name_trim(U&'\200E\3164'), '',
  'name_trim reads a contact name of only invisible characters as blank'
);
select is(private.name_trim(null), null, 'name_trim keeps a missing value missing');

-- 4. Parity with the shared Zod schema -------------------------------------------------------------

select is(
  (with blank_code_point as (
     select cp
       from (select generate_series(1, 131071) union all select generate_series(917504, 921599)) planes (cp)
      where (cp < 55296 or cp > 57343) and private.name_trim(chr(cp)) = ''
   ), island as (
     select min(cp) as low, max(cp) as high
       from (select cp, cp - row_number() over (order by cp) as run from blank_code_point) numbered
      group by run
   )
   select string_agg(case when low = high then to_hex(low) else to_hex(low) || '-' || to_hex(high) end,
                     ',' order by low)
     from island),
  -- name-blank-ranges:start
  '9-d,20,85,a0,ad,300-36f,483-489,591-5bd,5bf,5c1-5c2,5c4-5c5,5c7,610-61a,61c,64b-65f,670,' ||
  '6d6-6dc,6df-6e4,6e7-6e8,6ea-6ed,711,730-74a,7a6-7b0,7eb-7f3,7fd,816-819,81b-823,825-827,' ||
  '829-82d,859-85b,897-89f,8ca-8e1,8e3-903,93a-93c,93e-94f,951-957,962-963,981-983,9bc,' ||
  '9be-9c4,9c7-9c8,9cb-9cd,9d7,9e2-9e3,9fe,a01-a03,a3c,a3e-a42,a47-a48,a4b-a4d,a51,a70-a71,' ||
  'a75,a81-a83,abc,abe-ac5,ac7-ac9,acb-acd,ae2-ae3,afa-aff,b01-b03,b3c,b3e-b44,b47-b48,' ||
  'b4b-b4d,b55-b57,b62-b63,b82,bbe-bc2,bc6-bc8,bca-bcd,bd7,c00-c04,c3c,c3e-c44,c46-c48,' ||
  'c4a-c4d,c55-c56,c62-c63,c81-c83,cbc,cbe-cc4,cc6-cc8,cca-ccd,cd5-cd6,ce2-ce3,cf3,d00-d03,' ||
  'd3b-d3c,d3e-d44,d46-d48,d4a-d4d,d57,d62-d63,d81-d83,dca,dcf-dd4,dd6,dd8-ddf,df2-df3,e31,' ||
  'e34-e3a,e47-e4e,eb1,eb4-ebc,ec8-ece,f18-f19,f35,f37,f39,f3e-f3f,f71-f84,f86-f87,f8d-f97,' ||
  'f99-fbc,fc6,102b-103e,1056-1059,105e-1060,1062-1064,1067-106d,1071-1074,1082-108d,108f,' ||
  '109a-109d,115f-1160,135d-135f,1680,1712-1715,1732-1734,1752-1753,1772-1773,17b4-17d3,17dd,' ||
  '180b-180f,1885-1886,18a9,1920-192b,1930-193b,1a17-1a1b,1a55-1a5e,1a60-1a7c,1a7f,1ab0-1add,' ||
  '1ae0-1aeb,1b00-1b04,1b34-1b44,1b6b-1b73,1b80-1b82,1ba1-1bad,1be6-1bf3,1c24-1c37,1cd0-1cd2,' ||
  '1cd4-1ce8,1ced,1cf4,1cf7-1cf9,1dc0-1dff,2000-200f,2028-202f,205f-206f,20d0-20f0,2cef-2cf1,' ||
  '2d7f,2de0-2dff,3000,302a-302f,3099-309a,3164,a66f-a672,a674-a67d,a69e-a69f,a6f0-a6f1,a802,' ||
  'a806,a80b,a823-a827,a82c,a880-a881,a8b4-a8c5,a8e0-a8f1,a8ff,a926-a92d,a947-a953,a980-a983,' ||
  'a9b3-a9c0,a9e5,aa29-aa36,aa43,aa4c-aa4d,aa7b-aa7d,aab0,aab2-aab4,aab7-aab8,aabe-aabf,aac1,' ||
  'aaeb-aaef,aaf5-aaf6,abe3-abea,abec-abed,fb1e,fe00-fe0f,fe20-fe2f,feff,ffa0,fff0-fff8,101fd,' ||
  '102e0,10376-1037a,10a01-10a03,10a05-10a06,10a0c-10a0f,10a38-10a3a,10a3f,10ae5-10ae6,' ||
  '10d24-10d27,10d69-10d6d,10eab-10eac,10efa-10eff,10f46-10f50,10f82-10f85,11000-11002,' ||
  '11038-11046,11070,11073-11074,1107f-11082,110b0-110ba,110c2,11100-11102,11127-11134,' ||
  '11145-11146,11173,11180-11182,111b3-111c0,111c9-111cc,111ce-111cf,1122c-11237,1123e,11241,' ||
  '112df-112ea,11300-11303,1133b-1133c,1133e-11344,11347-11348,1134b-1134d,11357,11362-11363,' ||
  '11366-1136c,11370-11374,113b8-113c0,113c2,113c5,113c7-113ca,113cc-113d0,113d2,113e1-113e2,' ||
  '11435-11446,1145e,114b0-114c3,115af-115b5,115b8-115c0,115dc-115dd,11630-11640,116ab-116b7,' ||
  '1171d-1172b,1182c-1183a,11930-11935,11937-11938,1193b-1193e,11940,11942-11943,119d1-119d7,' ||
  '119da-119e0,119e4,11a01-11a0a,11a33-11a39,11a3b-11a3e,11a47,11a51-11a5b,11a8a-11a99,' ||
  '11b60-11b67,11c2f-11c36,11c38-11c3f,11c92-11ca7,11ca9-11cb6,11d31-11d36,11d3a,11d3c-11d3d,' ||
  '11d3f-11d45,11d47,11d8a-11d8e,11d90-11d91,11d93-11d97,11ef3-11ef6,11f00-11f01,11f03,' ||
  '11f34-11f3a,11f3e-11f42,11f5a,13440,13447-13455,1611e-1612f,16af0-16af4,16b30-16b36,16f4f,' ||
  '16f51-16f87,16f8f-16f92,16fe4,16ff0-16ff1,1bc9d-1bc9e,1bca0-1bca3,1cf00-1cf2d,1cf30-1cf46,' ||
  '1d165-1d169,1d16d-1d182,1d185-1d18b,1d1aa-1d1ad,1d242-1d244,1da00-1da36,1da3b-1da6c,1da75,' ||
  '1da84,1da9b-1da9f,1daa1-1daaf,1e000-1e006,1e008-1e018,1e01b-1e021,1e023-1e024,1e026-1e02a,' ||
  '1e08f,1e130-1e136,1e2ae,1e2ec-1e2ef,1e4ec-1e4ef,1e5ee-1e5ef,1e6e3,1e6e6,1e6ee-1e6ef,1e6f5,' ||
  '1e8d0-1e8d6,1e944-1e94a,e0000-e0fff'
  -- name-blank-ranges:end
  ,
  'the code points that are blank alone are the Unicode White_Space, Default_Ignorable_Code_Point and Mark ranges'
);

select * from finish();
rollback;

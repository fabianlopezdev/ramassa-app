-- Pending fixes 18 and 19 (RAPP-611).
-- Run with: bunx supabase test db
--
-- 18. A returning player cannot skip her required season answers by signing:
--     `sign_authorization` re-checks them (`private.missing_required_season_answers`),
--     built-in and staff ones. A staff tablet signing is not refused: signing
--     mode has no season questions (RAPP-305, RAPP-306), and a refused
--     offline signing would lose a witnessed signature.
-- 19. Joining re-checks a required field placed on the season form too,
--     besides the ones placed on her onboarding.
--
-- Seed: design role ...097, staff ...002, player ...022 (has not signed this
-- season), organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

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

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Setup: a past season she signed on paper (she is returning), the applicant
-- status required, and a field required on the season form.
insert into public.seasons (id, org_id, name, starts_on, is_current)
values ('00000000-0000-0000-0000-0000000007a1', '5eed0000-0000-4000-8000-000000000000',
        '2025/26', '2025-09-01', false);
insert into public.authorization_signatures (org_id, profile_id, season_id, method, paper_signed_on)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000022',
        '00000000-0000-0000-0000-0000000007a1', 'paper', '2025-09-15');
update public.profiles set applicant_status = null where id = '5eed0000-0000-4000-8000-000000000022';
-- A Fitxa field placed on the season form only, required there.
insert into public.profile_fields (id, org_id, section_id, kind, question_type, label, privacy, sort_order)
select '00000000-0000-0000-0000-0000000007c1', '5eed0000-0000-4000-8000-000000000000', s.id, 'custom',
       'short_text', '{"ca": "Com vas aquesta temporada?"}', 'normal', 92
  from public.profile_sections s
 where s.org_id = '5eed0000-0000-4000-8000-000000000000' and s.key = 'situation';
insert into public.field_placements (org_id, field_id, surface, sort_order, required)
values ('5eed0000-0000-4000-8000-000000000000', '00000000-0000-0000-0000-0000000007c1', 'season', 92, true);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_builtin_question_required('applicant_status', true);
reset role;

-- 18. Re-registration ----------------------------------------------------------------------------------

-- Every field by its id since RAPP-661, the app's and the staff's alike.
select is(
  (select array_agg(m order by m) from unnest(private.missing_required_season_answers('5eed0000-0000-4000-8000-000000000022')) m),
  (select array_agg(m order by m) from unnest(array['custom:' || pg_temp.field('applicant_status'),
                                                   'custom:00000000-0000-0000-0000-0000000007c1']) m),
  'her missing required season answers, built-in and staff'
);

create temp table signing (payload jsonb);
grant all on signing to authenticated;
insert into signing values (jsonb_build_object(
  'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                 'code_of_conduct', true, 'health_data', true),
  'health_info', 'No', 'unable_to_draw', true, 'language', 'ca'));

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select is((select is_returning from public.my_authorization_status()), true, 'she is returning');
select throws_ok(
  $$ select public.sign_authorization((select version_id from public.my_authorization_status()),
       (select payload from signing)) $$,
  '23502', 'a required season question has no answer',
  'signing does not end re-registration while a required season answer is missing'
);
select lives_ok(
  $$ select public.save_my_custom_answers('{"00000000-0000-0000-0000-0000000007c1": "Bé"}'::jsonb) $$,
  'she answers the staff question'
);
select throws_ok(
  $$ select public.sign_authorization((select version_id from public.my_authorization_status()),
       (select payload from signing)) $$,
  '23502', null::text, 'the built-in one is still missing'
);
select lives_ok(
  $$ select public.update_my_season_answers(jsonb_build_object('answers', pg_temp.answers('{"applicant_status": "refugee"}'))) $$,
  'she answers it'
);
select lives_ok(
  $$ select public.sign_authorization((select version_id from public.my_authorization_status()),
       (select payload from signing)) $$,
  'and then signs'
);

-- A staff tablet signing still syncs: signing mode has no season questions.
reset role;
update public.profiles set applicant_status = null where id = '5eed0000-0000-4000-8000-000000000022';
delete from public.authorization_signatures
 where profile_id = '5eed0000-0000-4000-8000-000000000022' and season_id <> '00000000-0000-0000-0000-0000000007a1';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.record_staff_device_signature(gen_random_uuid(), '5eed0000-0000-4000-8000-000000000022',
       '5eed0000-0000-4000-8041-000000000001', (select payload from signing), now()) $$,
  'a witnessed tablet signing is never refused for her season answers'
);

-- 19. Joining checks the fields on the season form --------------------------------------------------

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007c3', 'season-required@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007c3", "role": "authenticated"}';
select throws_like(
  $$ select public.complete_onboarding_signed(
       jsonb_build_object('first_name', 'Nadia', 'last_name', 'Khoury', 'media_consent', false,
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers('{"date_of_birth": "1993-11-02", "place_of_birth": "Homs",
           "nationality": "Síria", "reference_entity": null, "has_dependents": "no",
           "applicant_status": "refugee", "clothing_size": "M", "shoe_size": "38"}')),
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  '%requires an answer to a required question%',
  'joining is refused while a required question asked every season has no answer'
);
select lives_ok(
  $$ select public.complete_onboarding_signed(
       jsonb_build_object('first_name', 'Nadia', 'last_name', 'Khoury', 'media_consent', false,
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers('{"date_of_birth": "1993-11-02", "place_of_birth": "Homs",
           "nationality": "Síria", "reference_entity": null, "has_dependents": "no",
           "applicant_status": "refugee", "clothing_size": "M", "shoe_size": "38"}')
           || '{"00000000-0000-0000-0000-0000000007c1": "Bé"}'),
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'with it answered, she joins'
);

select * from finish();
rollback;

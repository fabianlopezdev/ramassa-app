-- Pending fixes 18 and 19 (RAPP-611).
-- Run with: bunx supabase test db
--
-- 18. A returning player cannot skip her required season answers by signing:
--     `sign_authorization` re-checks them (`private.missing_required_season_answers`),
--     built-in and staff ones. A staff tablet signing is not refused: signing
--     mode has no season questions (RAPP-305, RAPP-306), and a refused
--     offline signing would lose a witnessed signature.
-- 19. Joining re-checks a required staff question placed every season, as
--     her wizard asks it, not only the wizard-placed ones.
--
-- Seed: design role ...097, staff ...002, player ...022 (has not signed this
-- season), screen ...8044...001, organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Setup: a past season she signed on paper (she is returning), the applicant
-- status required, and a required staff question asked every season.
insert into public.seasons (id, org_id, name, starts_on, is_current)
values ('00000000-0000-0000-0000-0000000007a1', '5eed0000-0000-4000-8000-000000000000',
        '2025/26', '2025-09-01', false);
insert into public.authorization_signatures (org_id, profile_id, season_id, method, paper_signed_on)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000022',
        '00000000-0000-0000-0000-0000000007a1', 'paper', '2025-09-15');
update public.profiles set applicant_status = null where id = '5eed0000-0000-4000-8000-000000000022';
insert into public.custom_questions (id, org_id, screen_id, question_type, label, privacy, placements, sort_order)
values ('00000000-0000-0000-0000-0000000007c1', '5eed0000-0000-4000-8000-000000000000',
        '5eed0000-0000-4000-8044-000000000001', 'short_text', '{"ca": "Com vas aquesta temporada?"}',
        'normal', array['season'], 92);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_builtin_question_required('applicant_status', true);
select public.save_custom_question_required('00000000-0000-0000-0000-0000000007c1', true);
reset role;

-- 18. Re-registration ----------------------------------------------------------------------------------

select is(
  private.missing_required_season_answers('5eed0000-0000-4000-8000-000000000022'),
  array['applicant_status', 'custom:00000000-0000-0000-0000-0000000007c1'],
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
  $$ select public.update_my_season_answers('{"applicant_status": "refugee"}'::jsonb) $$,
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

-- 19. Joining checks the questions asked every season --------------------------------------------------

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007c3', 'season-required@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007c3", "role": "authenticated"}';
select throws_like(
  $$ select public.complete_onboarding_signed(
       '{"first_name": "Nadia", "last_name": "Khoury", "date_of_birth": "1993-11-02",
         "place_of_birth": "Homs", "nationality": "Síria", "reference_entity": null,
         "has_dependents": false, "applicant_status": "refugee", "clothing_size": "M",
         "shoe_size": "38", "media_consent": false,
         "terms_version": "2026-07-01", "locale_shown": "ca"}'::jsonb,
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  '%required staff question%',
  'joining is refused while a required question asked every season has no answer'
);
select lives_ok(
  $$ select public.complete_onboarding_signed(
       '{"first_name": "Nadia", "last_name": "Khoury", "date_of_birth": "1993-11-02",
         "place_of_birth": "Homs", "nationality": "Síria", "reference_entity": null,
         "has_dependents": false, "applicant_status": "refugee", "clothing_size": "M",
         "shoe_size": "38", "media_consent": false,
         "custom_answers": {"00000000-0000-0000-0000-0000000007c1": "Bé"},
         "terms_version": "2026-07-01", "locale_shown": "ca"}'::jsonb,
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'with it answered, she joins'
);

select * from finish();
rollback;

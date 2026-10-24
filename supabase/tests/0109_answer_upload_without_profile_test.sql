-- A woman who signed up on her own uploads a file answer before her profile exists (RAPP-610).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. `my_intake_upload_org()` gives the organization her registration uses
--      (the default one, as the catalog does) only to an account with no
--      profile at all; a player, a deactivated one included, gets nothing,
--      and anon cannot call it.
--   2. Her file, uploaded into her own folder under that organization, is
--      accepted as her answer once the wizard creates her profile, and she
--      and only she reads it back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select ok(
  not has_function_privilege('anon', 'public.my_intake_upload_org()', 'execute'),
  'anon cannot ask'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006b1', 'self-started@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006b1", "role": "authenticated"}';
select is(
  public.my_intake_upload_org(),
  '5eed0000-0000-4000-8000-000000000000'::uuid,
  'a woman with no profile yet uploads under the organization her registration uses'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_intake_upload_org(), null::uuid, 'a player uploads through her profile instead');

-- She finishes the wizard, then her file answer is saved, as her phone does.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.complete_onboarding_signed(
       '{"first_name": "Nadia", "last_name": "Khoury", "date_of_birth": "1993-11-02",
         "place_of_birth": "Homs", "nationality": "Síria", "document_type": "none",
         "reference_entity": null, "has_dependents": false, "num_dependents": 0,
         "clothing_size": "M", "shoe_size": "38", "media_consent": false,
         "terms_version": "2026-07-01", "locale_shown": "ca"}'::jsonb,
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'she completes her registration'
);

reset role;
insert into public.intake_screens (id, org_id, title, after_screen)
values ('00000000-0000-0000-0000-0000000006b2', '5eed0000-0000-4000-8000-000000000000', '{"ca": "Documents"}', 'logistics');
insert into public.profile_fields (id, org_id, section_id, kind, question_type, label, privacy, settings)
select '00000000-0000-0000-0000-0000000006b3', '5eed0000-0000-4000-8000-000000000000', s.id, 'custom',
       'file_upload', '{"ca": "Un document"}', 'personal', '{"accept": "document"}'
  from public.profile_sections s
 where s.org_id = '5eed0000-0000-4000-8000-000000000000' and s.key = 'identity';
insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order)
values ('5eed0000-0000-4000-8000-000000000000', '00000000-0000-0000-0000-0000000006b3', 'onboarding',
        '00000000-0000-0000-0000-0000000006b2', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_my_custom_answers(jsonb_build_object(
       '00000000-0000-0000-0000-0000000006b3',
       jsonb_build_object(
         'key', '5eed0000-0000-4000-8000-000000000000/intake-answers/00000000-0000-0000-0000-0000000006b1/2026/10/'
                || repeat('a', 32) || '.pdf',
         'name', 'permis.pdf', 'content_type', 'application/pdf', 'size', 2048))) $$,
  'the file she uploaded before her profile existed is her answer'
);
select ok(
  public.can_read_custom_answer_object(
    '5eed0000-0000-4000-8000-000000000000/intake-answers/00000000-0000-0000-0000-0000000006b1/2026/10/'
    || repeat('a', 32) || '.pdf'),
  'and she reads it back'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select ok(
  not public.can_read_custom_answer_object(
    '5eed0000-0000-4000-8000-000000000000/intake-answers/00000000-0000-0000-0000-0000000006b1/2026/10/'
    || repeat('a', 32) || '.pdf'),
  'another player does not'
);

select * from finish();
rollback;

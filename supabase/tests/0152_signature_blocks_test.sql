-- A signature is a block of the form builders (RAPP-690).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The team that designs the onboarding adds a signature block to an
--      Onboarding screen or to the entity form, with its text in Catalan at
--      least, edits it, orders it among the fields and removes it. Nobody
--      else does. Every save keeps the text in the audit log. The catalog
--      carries the blocks; an app screen with one is never hidden.
--   2. Nobody writes a signature directly: only the two form RPCs do.
--   3. Her Onboarding: she cannot finish while a block of a live screen is
--      unsigned. Her signature keeps the text as shown in her language, her
--      name and the strokes.
--   4. The entity form: the referral is refused while a block is unsigned;
--      the entity person's signature keeps their name.
--   5. Who reads: staff with participants.view_personal, on her page. The
--      design role and other players do not.
--   6. Erasure deletes her signatures, the entity's for her included.
--
-- Seed: organization ...000, admin ...001 (settings.organization, rgpd.erase),
-- staff ...002 (participants.*), entity contact ...004, player ...011, the
-- design account ...097.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(32);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

create function pg_temp.field(p_key text) returns uuid language sql security definer as $$
  select id from public.profile_fields where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.option(p_key text, p_option text) returns text language sql security definer as $$
  select o.id::text from public.custom_question_options o
   where o.question_id = pg_temp.field(p_key) and o.key = p_option;
$$;
-- Her registration, with these signatures.
create function pg_temp.registration(p_signatures jsonb) returns jsonb language sql as $$
  select jsonb_build_object('first_name', 'Nora', 'last_name', 'Signa', 'preferred_language', 'es',
      'terms_version', 't', 'locale_shown', 'es', 'media_consent', false, 'answers', jsonb_build_object(
        pg_temp.field('date_of_birth'), '1996-03-04', pg_temp.field('place_of_birth'), 'Vic',
        pg_temp.field('nationality'), 'Síria',
        pg_temp.field('clothing_size'), pg_temp.option('clothing_size', 'M'),
        pg_temp.field('shoe_size'), pg_temp.option('shoe_size', '38'),
        pg_temp.field('has_dependents'), pg_temp.option('has_dependents', 'no'),
        pg_temp.field('reference_entity'), '',
        pg_temp.field('document_type'), pg_temp.option('document_type', 'passport'),
        pg_temp.field('document_number'), 'PA123456',
        pg_temp.field('phone'), '+34600006690',
        '5eed0000-0000-4000-8045-000000000001', 'yes'),
      'signatures', p_signatures);
$$;
create function pg_temp.referral(p_signatures jsonb) returns jsonb language sql as $$
  select jsonb_build_object('first_name', 'Hiba', 'last_name', 'Signa', 'documentationStatus', 'missing',
                            'consentConfirmed', true, 'answers', '{}'::jsonb, 'signatures', p_signatures);
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. The builders -------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

insert into run select 'wizard', public.save_form_block(null, 'onboarding', 'logistics',
  '{"ca": "Autoritzo el transport", "es": "Autorizo el transporte"}'::jsonb);
insert into run select 'entity', public.save_form_block(null, 'entity_form', null,
  '{"ca": "La jugadora ha donat el seu permís"}'::jsonb);
select is((select count(*)::integer from run), 2, 'a signature block goes on a screen and on the entity form');
select throws_ok(
  $$ select public.save_form_block(null, 'onboarding', 'logistics', '{"es": "Autorizo"}'::jsonb) $$,
  '23514', 'a signature needs its text in Catalan', 'its text needs Catalan');
select throws_ok(
  $$ select public.save_form_block(null, 'onboarding', 'nowhere', '{"ca": "Autoritzo"}'::jsonb) $$,
  'P0002', 'no such screen', 'an Onboarding block names a real screen');
select throws_ok(
  $$ select public.save_form_block(null, 'entity_form', 'logistics', '{"ca": "Autoritzo"}'::jsonb) $$,
  '23514', 'only an onboarding block names a screen', 'the entity form names no screen');
select lives_ok(
  $$ select public.save_form_block((select id from run where label = 'wizard'), null, null,
       '{"ca": "Autoritzo que em portin amb cotxe", "es": "Autorizo que me lleven en coche"}'::jsonb) $$,
  'its text is edited');
select is(
  (select count(*)::integer from public.audit_log
    where action = 'intake.block_save' and target_id = (select id from run where label = 'wizard')),
  2, 'every save keeps the text in the audit log');
select ok(
  (select b ->> 'body' is not null and b ->> 'surface' = 'onboarding' and b ->> 'screen_key' = 'logistics'
     from jsonb_array_elements(public.intake_catalog() -> 'blocks') b
    where b ->> 'id' = (select id::text from run where label = 'wizard')),
  'the catalog carries the blocks');
select ok(
  (select (b ->> 'sort_order')::integer > coalesce(max(p.sort_order), -1)
     from jsonb_array_elements(public.intake_catalog() -> 'blocks') b,
          public.field_placements p
    where b ->> 'id' = (select id::text from run where label = 'wizard')
      and p.surface = 'onboarding' and p.screen_key = 'logistics'
    group by b),
  'a new block goes after the screen''s fields');
select lives_ok(
  format($$ select public.reorder_placements('onboarding', 'logistics', %L::uuid[]) $$,
    array[(select id from run where label = 'wizard')]
      || (select array_agg(p.id order by p.sort_order) from public.field_placements p
           where p.surface = 'onboarding' and p.screen_key = 'logistics')),
  'the block moves among the fields');
select is(
  (select sort_order from public.form_blocks where id = (select id from run where label = 'wizard')),
  0, 'one order for fields and blocks');
reset role;
select ok(not private.builtin_screen_hideable('logistics'), 'an app screen with a block is never hidden');
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.remove_form_block(public.save_form_block(null, 'entity_form', null, '{"ca": "Provisional"}'::jsonb)) $$,
  'the design role adds and removes a block');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.save_form_block(null, 'entity_form', null, '{"ca": "Accepto"}'::jsonb) $$,
  '42501', null, 'a player never edits a form');

-- 2. Nobody writes a signature directly -----------------------------------------------------------------------

select throws_ok(
  $$ insert into public.form_signatures (org_id, profile_id, surface, body, language, signer_kind, signer_name, strokes)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000011', 'wizard',
             'Accepto', 'ca', 'player', 'Ella', '[[[1, 2]]]') $$,
  '42501', null, 'a signature is written by the form RPCs only');

-- 3. Her Onboarding -------------------------------------------------------------------------------------------

reset role;
insert into auth.users (id, email) values ('5eed0000-0000-4000-8000-0000000006c0', 'rapp690.new@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000006c0", "role": "authenticated", "aal": "aal1"}';

select throws_ok(
  format($$select public.complete_onboarding_signed(%L, '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
    pg_temp.registration('{}')),
  '23502', 'complete_onboarding requires her signature on every signature block',
  'she cannot finish with a block unsigned');
select throws_ok(
  format($$select public.complete_onboarding_signed(%L, '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
    pg_temp.registration(jsonb_build_object((select id::text from run where label = 'wizard'),
      '{"strokes": [[[1, 2000]]], "language": "es"}'::jsonb))),
  '23514', 'a signature is its strokes and the language it was shown in',
  'strokes off the pad are refused');
select lives_ok(
  format($$select public.complete_onboarding_signed(%L, '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
    pg_temp.registration(jsonb_build_object(
      (select id::text from run where label = 'wizard'), '{"strokes": [[[100, 200], [300, 400]]], "language": "es"}'::jsonb,
      -- A block of the entity form, or a removed one, is passed over.
      (select id::text from run where label = 'entity'), '{"strokes": [[[1, 2]]], "language": "ca"}'::jsonb))),
  'she signs and finishes');

reset role;
select results_eq(
  $$ select surface, body, language, signer_kind, signer_name, signer_user_id::text, strokes
       from public.form_signatures where profile_id = '5eed0000-0000-4000-8000-0000000006c0' $$,
  $$ values ('wizard', 'Autorizo que me lleven en coche', 'es', 'player', 'Nora Signa',
             '5eed0000-0000-4000-8000-0000000006c0', '[[[100, 200], [300, 400]]]'::jsonb) $$,
  'her signature keeps the text as shown, its language, her name and the strokes');

-- 4. The entity form ---------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral('{}')),
  '23502', 'the referral needs a signature on every signature block',
  'a referral with a block unsigned is refused');
insert into run select 'referral', public.create_entity_referral(pg_temp.referral(jsonb_build_object(
  (select id::text from run where label = 'entity'), '{"strokes": [[[5, 6], [7, 8]]], "language": "fa"}'::jsonb)));
reset role;
select results_eq(
  $$ select surface, body, language, signer_kind, signer_user_id::text, profile_id
       from public.form_signatures where referral_id = (select id from run where label = 'referral') $$,
  $$ values ('entity_form', 'La jugadora ha donat el seu permís', 'ca', 'entity',
             '5eed0000-0000-4000-8000-000000000004', null::uuid) $$,
  'the entity person signs; a language with no text shows the Catalan');
select is(
  (select signer_name from public.form_signatures where referral_id = (select id from run where label = 'referral')),
  (select concat_ws(' ', first_name, last_name) from public.profiles where id = '5eed0000-0000-4000-8000-000000000004'),
  'with the entity person''s name');

-- The referral names Nora: her page reads the entity's signature too.
update public.entity_referrals
   set referred_profile_id = '5eed0000-0000-4000-8000-0000000006c0', status = 'active',
       assigned_staff_id = '5eed0000-0000-4000-8000-000000000002'
 where id = (select id from run where label = 'referral');

-- 5. Who reads --------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from public.participant_form_signatures('5eed0000-0000-4000-8000-0000000006c0')),
  2, 'staff with participants.view_personal read her signatures, the entity''s included');
select is(
  (select count(*)::integer from public.form_signatures), 2, 'and the rows themselves');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select * from public.participant_form_signatures('5eed0000-0000-4000-8000-0000000006c0') $$,
  '42501', 'her signatures need participants.view_personal', 'the design role does not read them');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is((select count(*)::integer from public.form_signatures), 0, 'another player reads none');
select throws_ok(
  $$ select * from public.participant_form_signatures('5eed0000-0000-4000-8000-0000000006c0') $$,
  '42501', null, 'nor through her page');

-- A removed block leaves its signatures, text and all.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  format('select public.remove_form_block(%L)', (select id from run where label = 'entity')),
  'a block is removed');
reset role;
select ok(
  (select block_id is null and body = 'La jugadora ha donat el seu permís' from public.form_signatures
    where referral_id = (select id from run where label = 'referral')),
  'its signature stays with the text she was shown');

-- 6. Erasure ------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.anonymize_participant('5eed0000-0000-4000-8000-0000000006c0') $$,
  'her record is erased');
reset role;
select is(
  (select count(*)::integer from public.form_signatures
    where profile_id = '5eed0000-0000-4000-8000-0000000006c0'
       or referral_id = (select id from run where label = 'referral')),
  0, 'her signatures leave with her, the entity''s for her included');

-- The helpers stay private.
set local role authenticated;
select throws_ok(
  $$ select private.unsigned_form_blocks('5eed0000-0000-4000-8000-000000000000', 'wizard', null, null) $$,
  '42501', null, 'a signed-in user cannot call the helpers');
reset role;
select is(
  (select disposition from public.personal_data_disposition() where table_name = 'form_signatures'),
  'purge', 'the erasure registry names the signatures');

select * from finish();
rollback;

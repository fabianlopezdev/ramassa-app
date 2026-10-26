-- The walk-in tablet signs the Onboarding signature blocks (RAPP-691).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A walk-in's block signatures wait with her signing: the text as shown
--      in her language, the strokes and the team member present. A block of
--      another form is passed over; strokes off the pad are refused.
--   2. Confirming her moves them to her profile: signed by her, with her name,
--      on her Onboarding, at the time she signed, on the tablet, witnessed.
--   3. Her phone then skips a block she signed, while its text is unchanged;
--      a changed text asks for a new signature.
--   4. A discarded walk-in drops its pending signatures.
--   5. Her page says where each was signed and who was present; the erasure
--      registry names the pending table.
--
-- Seed: staff ...002 (consents.collect, participants.invite), version
-- ...8041-...001 current, organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;
insert into run (label, id) values
  ('walk_in', '0b5e0000-0000-4000-8000-000000000691'),
  ('walk_in_discard', '0b5e0000-0000-4000-8000-000000000692');
insert into public.form_blocks (id, org_id, surface, screen_key, kind, body, sort_order)
values ('5eed0000-0000-4000-8099-000000000691', '5eed0000-0000-4000-8000-000000000000', 'onboarding',
        'logistics', 'signature', '{"ca": "Autoritzo el transport", "ar": "أوافق على النقل"}', 9),
       ('5eed0000-0000-4000-8099-000000000692', '5eed0000-0000-4000-8000-000000000000', 'entity_form',
        null, 'signature', '{"ca": "La jugadora hi està d''acord"}', 0);

create function pg_temp.payload() returns jsonb language sql as $$
  select jsonb_build_object(
    'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                   'code_of_conduct', true, 'health_data', true, 'image_rights', true),
    'health_info', 'No', 'signature', '[[[10,20],[30,40]]]'::jsonb, 'language', 'ar', 'device', 'iPad');
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. On the tablet ---------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select throws_ok(
  $$ select public.submit_walk_in_signing(gen_random_uuid(), 'Rim', 'Haddad',
       '5eed0000-0000-4000-8041-000000000001', pg_temp.payload(), now(),
       '{"5eed0000-0000-4000-8099-000000000691": {"strokes": [[[1, 2000]]], "language": "ar"}}') $$,
  '23514', 'a signature is its strokes and the language it was shown in',
  'strokes off the pad are refused'
);
select lives_ok(
  $$ select public.submit_walk_in_signing((select id from run where label = 'walk_in'), 'Rim', 'Haddad',
       '5eed0000-0000-4000-8041-000000000001', pg_temp.payload(), now() - interval '1 hour',
       '{"5eed0000-0000-4000-8099-000000000691": {"strokes": [[[100, 200], [300, 400]]], "language": "ar"},
         "5eed0000-0000-4000-8099-000000000692": {"strokes": [[[1, 2]]], "language": "ca"}}') $$,
  'a walk-in signs the Onboarding blocks after the authorization'
);
reset role;
select results_eq(
  $$ select block_id::text, body, language, witnessed_by::text from public.walk_in_form_signatures
      where walk_in_id = '0b5e0000-0000-4000-8000-000000000691' $$,
  $$ values ('5eed0000-0000-4000-8099-000000000691', 'أوافق على النقل', 'ar',
             '5eed0000-0000-4000-8000-000000000002') $$,
  'they wait with her signing, in her language, witnessed; the entity form block is passed over'
);

-- 2. On confirm ---------------------------------------------------------------------------------------

set local role authenticated;
insert into run (label, id)
select 'rim', public.confirm_walk_in((select id from run where label = 'walk_in'), 'rim.691@example.test');
reset role;
select results_eq(
  $$ select surface, signer_kind, signer_user_id = profile_id, signer_name, signed_on_tablet,
            witnessed_by::text, signed_at < now() - interval '50 minutes'
       from public.form_signatures where profile_id = (select id from run where label = 'rim') $$,
  $$ values ('wizard', 'player', true, 'Rim Haddad', true, '5eed0000-0000-4000-8000-000000000002', true) $$,
  'confirming moves them to her profile: hers, on the tablet, witnessed, at the time she signed'
);
select is(
  (select count(*)::integer from public.walk_in_form_signatures
    where walk_in_id = (select id from run where label = 'walk_in')),
  0, 'and the walk-in keeps no copy'
);

-- 3. On her phone later ------------------------------------------------------------------------------------

select is(
  private.unsigned_form_blocks('5eed0000-0000-4000-8000-000000000000', 'wizard',
    (select id from run where label = 'rim'), null) @> array['5eed0000-0000-4000-8099-000000000691'::uuid],
  false, 'her phone counts the block she signed on the tablet as signed'
);
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from run where label = 'rim'), 'role', 'authenticated', 'aal', 'aal1')::text,
  true);
set local role authenticated;
select is(
  (select count(*)::integer from public.my_form_signatures()
    where block_id = '5eed0000-0000-4000-8099-000000000691' and body = 'أوافق على النقل'),
  1, 'her phone reads her signature and its text'
);
reset role;
update public.form_blocks set body = '{"ca": "Autoritzo el transport", "ar": "أوافق على النقل بالسيارة"}'
 where id = '5eed0000-0000-4000-8099-000000000691';
select is(
  private.unsigned_form_blocks('5eed0000-0000-4000-8000-000000000000', 'wizard',
    (select id from run where label = 'rim'), null) @> array['5eed0000-0000-4000-8099-000000000691'::uuid],
  true, 'a changed text asks for a new signature'
);

-- 4. Discard ---------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.submit_walk_in_signing((select id from run where label = 'walk_in_discard'), 'Iryna', 'Melnyk',
  '5eed0000-0000-4000-8041-000000000001', pg_temp.payload(), now(),
  '{"5eed0000-0000-4000-8099-000000000691": {"strokes": [[[5, 6]]], "language": "ca"}}');
select lives_ok(
  $$ select public.discard_walk_in((select id from run where label = 'walk_in_discard')) $$,
  'a walk-in is discarded'
);
reset role;
select is(
  (select count(*)::integer from public.walk_in_form_signatures
    where walk_in_id = (select id from run where label = 'walk_in_discard')),
  0, 'and her pending signatures go with it'
);

-- 5. Her page and the registry -------------------------------------------------------------------------

set local role authenticated;
select ok(
  (select signed_on_tablet and witnessed_by_name is not null
     from public.participant_form_signatures((select id from run where label = 'rim'))),
  'her page says it was signed on the tablet, and who was present'
);
select throws_ok(
  $$ select * from public.walk_in_form_signatures $$,
  '42501', null::text, 'nobody reads the pending signatures directly'
);
reset role;
select is(
  (select disposition from public.personal_data_disposition() where table_name = 'walk_in_form_signatures'),
  'retain_limited', 'the erasure registry names the pending signatures'
);

select * from finish();
rollback;

-- A consent decision made on a draft goes with the draft (RAPP-619,
-- pending fix 30).
-- Run with: bunx supabase test db
--
-- What these assertions defend: a test player who signed a draft that adds
-- a consent, then changes that consent on her profile
-- (`set_optional_consent`), leaves a consent event whose version is the
-- draft and that no signature owns. Publishing the draft used to keep it on
-- the published version, and discarding it left it with no version at all.
-- Both now delete every consent event of the draft (only a test player ever
-- has one), as they delete its signatures.
--
-- Seed: admin ...001, design role ...097, test player ...096 (invited),
-- the current season 2026/27 with authorization version 1.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

-- An app answer given by option key, as the app's screens send it by option id.
create function pg_temp.by_option_key(f public.profile_fields, v jsonb) returns jsonb language sql stable security definer as $$
  select case
    when f.question_type in ('single_choice', 'search_choice') and jsonb_typeof(v) = 'string' then
      coalesce((select to_jsonb(o.id::text) from public.custom_question_options o
                 where o.question_id = f.id and o.key = v #>> '{}'), v)
    when f.question_type = 'multiple_choice' and jsonb_typeof(v) = 'array' then
      coalesce((select jsonb_agg(o.id::text order by o.sort_order) from public.custom_question_options o
                 where o.question_id = f.id and o.key in (select jsonb_array_elements_text(v))
                having count(*) = jsonb_array_length(v)), v)
    else v
  end;
$$;
-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, pg_temp.by_option_key(f, e.value)), '{}'::jsonb)
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

create temp table run (label text primary key, id uuid, content jsonb) on commit drop;
grant all on run to authenticated;
insert into run (label, id, content)
select 'auth-v1', id, content from public.authorization_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 1;
-- Two drafts, each adding one optional consent version 1 does not ask.
insert into run (label, content)
select 'club-news', jsonb_set(content, '{consents,club_news}',
         (content -> 'consents' -> 'newsletter') || '{"position": 19}'::jsonb)
  from run where label = 'auth-v1';
insert into run (label, content)
select 'club-trips', jsonb_set(content, '{consents,club_trips}',
         (content -> 'consents' -> 'newsletter') || '{"position": 19}'::jsonb)
  from run where label = 'auth-v1';
-- A valid signing of each draft, the added consent given.
insert into run (label, content)
select 'sign-' || d.label, jsonb_build_object(
  'consents', (select jsonb_object_agg(c.consent_key, c.required or c.consent_key in ('club_news', 'club_trips'))
                 from private.authorization_consents(d.content) c),
  'health_info', 'No',
  'emergency_contact', jsonb_build_object('name', 'Olena', 'phone', '+34600222333'),
  'unable_to_draw', true, 'language', 'ca')
  from run d where d.label in ('club-news', 'club-trips');

-- She joins through the scenario tool.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       'kind', 'answers',
       'fill', jsonb_build_object(
         'first_name', 'Joana', 'last_name', 'Prova', 'preferred_language', 'ca',
         -- Her answers by field (RAPP-661).
         'answers', pg_temp.answers('{
           "date_of_birth": "1995-05-15", "place_of_birth": "Marroc", "nationality": "Marroc",
           "reference_entity": "Entitat de prova", "has_dependents": "no",
           "clothing_size": "M", "shoe_size": "38"}'))));
     select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "terms", "accepted": true}'::jsonb) $$,
  'the test player joins'
);

-- 1. Publish.
select lives_ok(
  $$ select public.save_authorization_draft((select content from run where label = 'club-news')) $$,
  'the design role adds a consent in a draft'
);
reset role;
update run set id = (select id from public.authorization_versions
                      where org_id = '5eed0000-0000-4000-8000-000000000000' and published_at is null)
 where label = 'club-news';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select lives_ok(
  $$ select public.sign_authorization((select id from run where label = 'club-news'),
       (select content from run where label = 'sign-club-news')) $$,
  'she signs the draft and gives the new consent'
);
select lives_ok(
  $$ select public.set_optional_consent('club_news', false, 'ca') $$,
  'then withdraws it on her profile'
);
reset role;
select is(
  (select count(*)::integer from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000096' and consent_key = 'club_news'
      and signature_id is null and version_id = (select id from run where label = 'club-news')),
  1,
  'her profile decision is recorded on the draft, with no signature'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.publish_authorization_draft() $$, 'an admin publishes the draft');
reset role;
select is(
  (select count(*)::integer from public.authorization_consent_events
    where version_id = (select id from run where label = 'club-news')),
  0,
  'the published version carries no consent decision made on the draft'
);
select is(
  (select count(*)::integer from public.audit_log
    where action = 'authorization.publish' and target_id = (select id from run where label = 'club-news')
      and (changes ->> 'test_consent_events_dropped')::integer = 1),
  1,
  'the publish says how many it dropped'
);

-- 2. Discard.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_authorization_draft((select content from run where label = 'club-trips')) $$,
  'the design role adds another consent in a new draft'
);
reset role;
update run set id = (select id from public.authorization_versions
                      where org_id = '5eed0000-0000-4000-8000-000000000000' and published_at is null)
 where label = 'club-trips';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select lives_ok(
  $$ select public.sign_authorization((select id from run where label = 'club-trips'),
       (select content from run where label = 'sign-club-trips'));
     select public.set_optional_consent('club_trips', false, 'ca') $$,
  'she signs it and withdraws the new consent'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.discard_authorization_draft() $$, 'the design role discards the draft');
reset role;
select is(
  (select count(*)::integer from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000096' and consent_key = 'club_trips'),
  0,
  'no consent decision of the discarded draft is left behind, with or without a version'
);

select * from finish();
rollback;

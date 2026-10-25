-- Her specific needs (RAPP-357), since RAPP-660 two fields: the needs (several
-- choices, one of them `none`) and one details text. Her season answers travel
-- by field (RAPP-661).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(10);

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

create function pg_temp.needs(p_keys text[]) returns jsonb language sql security definer as $$
  select jsonb_agg(o.id::text order by array_position(p_keys, o.key)) from public.custom_question_options o
   where o.question_id::text = pg_temp.field('specific_needs') and o.key = any (p_keys);
$$;
grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;
set local request.jwt.claims='{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}';
select lives_ok($$select public.update_my_season_answers(jsonb_build_object('answers',jsonb_build_object(
  pg_temp.field('specific_needs'),pg_temp.needs(array['health','communication']),
  pg_temp.field('specific_needs_details'),repeat('h',3990))))$$,'several categories and their details fit the answer');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011','specific_needs'),pg_temp.needs(array['health','communication']),'canonical categories round-trip');
select throws_ok($$select public.update_my_season_answers(jsonb_build_object('answers',jsonb_build_object(
  pg_temp.field('specific_needs'),pg_temp.needs(array['none','health']))))$$,'23514',null::text,'None cannot coexist with another category');
select throws_ok($$select public.update_my_season_answers(jsonb_build_object('answers',jsonb_build_object(
  pg_temp.field('specific_needs_details'),repeat('h',4001))))$$,'23514',null::text,'the details are limited to 4000 characters');
select lives_ok($$select public.update_my_season_answers(jsonb_build_object('answers',jsonb_build_object(
  pg_temp.field('specific_needs'),pg_temp.needs(array['other']),
  pg_temp.field('specific_needs_details'),'Legacy free-text answer')))$$,'free text is the other need and its details');
select lives_ok($$select public.update_my_season_answers(jsonb_build_object('answers',jsonb_build_object(
  pg_temp.field('specific_needs'),pg_temp.needs(array['none']),pg_temp.field('specific_needs_details'),null)))$$,'None is an explicit persisted answer');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011','specific_needs'),pg_temp.needs(array['none']),'None round-trips separately from no answer');
select throws_ok($$select public.update_my_season_answers(jsonb_build_object('answers',jsonb_build_object(
  pg_temp.field('specific_needs'),jsonb_build_array('unknown'))))$$,'23514',null::text,'unknown categories are rejected');
select lives_ok($$select public.update_my_season_answers(jsonb_build_object('answers',jsonb_build_object(
  pg_temp.field('specific_needs'),pg_temp.needs(array['accessibility','communication']),
  pg_temp.field('specific_needs_details'),'An accessible room and an interpreter')))$$,'one explanation saves for several categories');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011','specific_needs_details') #>> '{}','An accessible room and an interpreter','the explanation round-trips without duplication');
select * from finish();
rollback;

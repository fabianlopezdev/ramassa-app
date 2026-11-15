-- Who gave each answer on her page (RAPP-653).
--
-- WHY
--
-- Her participant page now shows every Fitxa field with its answer, who gave
-- it and when: "Ella mateixa · 12 oct", "Creu Roja (entitat) · 3 oct",
-- "Marc Larripa · 20 oct". The answers already record the kind of source
-- (`custom_answers.source`, `profile_answers.source`: player, entity or
-- staff) and the time, but never the person or the entity behind it. And a
-- joined player's record changed by the team (or by her, from her profile)
-- left `profile_answers` as her onboarding wrote it, so the page would credit
-- her with a value the team typed later.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `answered_by` on custom_answers and profile_answers: the team member
--      who typed the answer, or the entity user who sent the referral. Null
--      for her own answers and for every row written before today (nothing is
--      backfilled: those rows show the kind of source and the date).
--   2. Every writer sets it: private.write_custom_answer (callers pass it;
--      a staff write with none names the signed-in member),
--      set_participant_custom_answers, private.apply_profile_prefill, and
--      private.adopt_referral_answers for both kinds of entity answer.
--   3. A joined player's record: a trigger on profiles records each built-in
--      answer that changed, as hers when she changed it and as the team
--      member's otherwise, the way her onboarding and the prefill do.
--   4. Readers: participant_custom_answers also returns who gave each answer
--      (`answered_by_name`: the team member's name, or the entity's name);
--      participant_profile_answers is new and returns the source, date and
--      name for the app's own fields. Both leave out what the
--      reader may not read, by the field's privacy level.

-- 1. The column ------------------------------------------------------------------------------------

alter table public.custom_answers
  add column answered_by uuid references public.profiles(id) on delete set null;
alter table public.profile_answers
  add column answered_by uuid references public.profiles(id) on delete set null;

create index custom_answers_answered_by_idx on public.custom_answers (answered_by)
  where answered_by is not null;
create index profile_answers_answered_by_idx on public.profile_answers (answered_by)
  where answered_by is not null;

comment on column public.custom_answers.answered_by is
  'The team member who typed it, or the entity user whose referral gave it; null for her own (RAPP-653).';
comment on column public.profile_answers.answered_by is
  'The team member who typed it, or the entity user whose referral gave it; null for her own (RAPP-653).';

-- 2. The writers -----------------------------------------------------------------------------------

-- One more argument: the old four-argument function goes, so no call is ambiguous.
drop function private.write_custom_answer(uuid, public.custom_questions, jsonb, text);

create or replace function private.write_custom_answer(
  p_profile_id uuid,
  p_question public.custom_questions,
  p_value jsonb,
  p_source text,
  p_answered_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season uuid := case when 'season' = any (p_question.placements)
                      then private.current_season_id(p_question.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := private.custom_answer_is_empty(p_value);
  stored jsonb := private.custom_answer_tidied(p_question.question_type, p_value);
  -- Her own answers name nobody; a staff write with no name given is the
  -- signed-in team member's.
  author uuid := case
    when p_source = 'player' then null
    when p_source = 'staff' then coalesce(p_answered_by, (select auth.uid()))
    else p_answered_by
  end;
begin
  if p_question.question_type in ('file_upload', 'signature') and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file or a signature is hers to give';
  end if;
  -- With no current season there is nowhere to keep a seasonal answer. Her
  -- registration never stops on it; staff are told.
  if 'season' = any (p_question.placements) and season is null then
    if p_source = 'player' then
      return;
    end if;
    raise check_violation using message = 'a seasonal question needs a current season';
  end if;
  if is_empty then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = p_question.id and season_key = key;
    return;
  end if;
  if not private.custom_answer_valid(p_question, stored) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  -- Her file lives in her own private folder of her organization.
  if p_question.question_type = 'file_upload'
     and (split_part(stored ->> 'key', '/', 1) <> p_question.org_id::text
          or split_part(stored ->> 'key', '/', 3) <> p_profile_id::text) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source,
    answered_by, answered_at)
  values (
    p_profile_id, p_question.id, key, season, p_question.org_id,
    case when p_question.privacy = 'sensitive' then null else stored end,
    case when p_question.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    p_source, author, now())
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted,
        source = excluded.source, answered_by = excluded.answered_by, answered_at = now();
end;
$$;

revoke all on function private.write_custom_answer(uuid, public.custom_questions, jsonb, text, uuid)
  from public, anon, authenticated;

create or replace function public.set_participant_custom_answers(p_profile_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  actor uuid := (select auth.uid());
  entry record;
  question public.custom_questions;
  changed text[] := '{}';
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'editing her answers needs participants.view_personal';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_profile_id and org_id = actor_org and role in ('player', 'invited')) then
    raise no_data_found using message = 'no such participant';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = actor_org and not q.is_archived;
    if question.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if question.privacy = 'sensitive' and not (select private.participant_permission(p_profile_id, 'participants.view_sensitive')) then
      raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
    end if;
    perform private.write_custom_answer(p_profile_id, question, entry.value, 'staff', actor);
    changed := changed || question.id::text;
  end loop;
  -- The questions only: answers may be Sensitive and never enter the log (ADR-004).
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'profile.custom_answers_update', 'profile', p_profile_id,
          jsonb_build_object('questions', to_jsonb(changed)));
end;
$$;

revoke all on function public.set_participant_custom_answers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_participant_custom_answers(uuid, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.apply_profile_prefill(p_profile_id uuid, p_payload jsonb, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.profiles;
begin
  if p_source not in ('staff', 'entity') then
    raise exception 'apply_profile_prefill takes staff or entity answers'
      using errcode = 'invalid_parameter_value';
  end if;

  if (p_payload ? 'first_name' and nullif(private.name_trim(p_payload ->> 'first_name'), '') is null)
    or (p_payload ? 'last_name' and nullif(private.name_trim(p_payload ->> 'last_name'), '') is null)
  then
    raise exception 'a name can be corrected but not removed'
      using errcode = 'not_null_violation';
  end if;

  if not private.season_answers_valid(p_payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    first_name = case when p_payload ? 'first_name' then private.name_trim(p_payload ->> 'first_name') else p.first_name end,
    last_name = case when p_payload ? 'last_name' then private.name_trim(p_payload ->> 'last_name') else p.last_name end,
    date_of_birth = case when p_payload ? 'date_of_birth'
      then nullif(p_payload ->> 'date_of_birth', '')::date else p.date_of_birth end,
    place_of_birth = case when p_payload ? 'place_of_birth'
      then nullif(btrim(p_payload ->> 'place_of_birth'), '') else p.place_of_birth end,
    nationality = case when p_payload ? 'nationality'
      then nullif(btrim(p_payload ->> 'nationality'), '') else p.nationality end,
    preferred_language = coalesce(nullif(p_payload ->> 'preferred_language', ''), p.preferred_language),
    document_name = case when p_payload ? 'document_name' then nullif(btrim(p_payload ->> 'document_name'), '') else p.document_name end,
    document_type = case when p_payload ? 'document_type'
      then nullif(p_payload ->> 'document_type', '') else p.document_type end,
    document_number = case when p_payload ? 'document_number'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'document_number'), '')) else p.document_number end,
    phone = case when p_payload ? 'phone'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'phone'), '')) else p.phone end,
    address = case when p_payload ? 'address'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'address'), '')) else p.address end,
    city = case when p_payload ? 'city' then nullif(btrim(p_payload ->> 'city'), '') else p.city end,
    postal_code = case when p_payload ? 'postal_code'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'postal_code'), '')) else p.postal_code end,
    reference_entity = case when p_payload ? 'reference_entity'
      then nullif(btrim(p_payload ->> 'reference_entity'), '') else p.reference_entity end,
    reference_contact_name = case when p_payload ? 'reference_contact_name'
      then nullif(private.name_trim(p_payload ->> 'reference_contact_name'), '') else p.reference_contact_name end,
    has_dependents = case when nullif(p_payload ->> 'has_dependents', '') is not null
      then (p_payload ->> 'has_dependents')::boolean else p.has_dependents end,
    num_dependents = case when nullif(p_payload ->> 'num_dependents', '') is not null
      then (p_payload ->> 'num_dependents')::integer else p.num_dependents end,
    clothing_size = case when p_payload ? 'clothing_size'
      then nullif(p_payload ->> 'clothing_size', '') else p.clothing_size end,
    shoe_size = case when p_payload ? 'shoe_size'
      then nullif(p_payload ->> 'shoe_size', '') else p.shoe_size end,
    applicant_status = case when p_payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status'), '')) else p.applicant_status end,
    applicant_status_details = case when p_payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status_details'), '')) else p.applicant_status_details end,
    supporting_entities = case when p_payload ? 'supporting_entities'
      then private.text_array_answer(p_payload -> 'supporting_entities') else p.supporting_entities end,
    season_number = case when p_payload ? 'season_number'
      then nullif(p_payload ->> 'season_number', '')::smallint else p.season_number end,
    -- "This is her third year" means two seasons before this one (RAPP-306).
    prior_seasons = case when nullif(p_payload ->> 'season_number', '') is not null
      then greatest((p_payload ->> 'season_number')::smallint - 1, 0) else p.prior_seasons end,
    childcare_need = case when p_payload ? 'childcare_need'
      then nullif(p_payload ->> 'childcare_need', '') else p.childcare_need end,
    specific_needs = case when p_payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'specific_needs'), '')) else p.specific_needs end,
    updated_at = now()
  where p.id = p_profile_id
  returning * into target;

  if target.id is null then
    return;
  end if;

  if not target.has_dependents and target.num_dependents <> 0 then
    update public.profiles set num_dependents = 0 where id = p_profile_id;
    target.num_dependents := 0;
  end if;

  with question (name, touched, has_value) as (
    values
      ('first_name', p_payload ? 'first_name', target.first_name is not null),
      ('last_name', p_payload ? 'last_name', target.last_name is not null),
      ('date_of_birth', p_payload ? 'date_of_birth', target.date_of_birth is not null),
      ('place_of_birth', p_payload ? 'place_of_birth', target.place_of_birth is not null),
      ('nationality', p_payload ? 'nationality', target.nationality is not null),
      ('preferred_language', nullif(p_payload ->> 'preferred_language', '') is not null, true),
      ('document', p_payload ?| array['document_type', 'document_number', 'document_name'],
        target.document_type is not null
        and (target.document_type = 'none' or (target.document_type = 'other' and target.document_name is not null) or target.document_number is not null)),
      ('phone', p_payload ? 'phone', target.phone is not null),
      ('address', p_payload ? 'address', target.address is not null),
      ('city', p_payload ? 'city', target.city is not null),
      ('postal_code', p_payload ? 'postal_code', target.postal_code is not null),
      ('reference_entity', p_payload ? 'reference_entity', target.reference_entity is not null),
      ('reference_contact_name', p_payload ? 'reference_contact_name', target.reference_contact_name is not null),
      ('dependents', nullif(p_payload ->> 'has_dependents', '') is not null, true),
      ('clothing_size', p_payload ? 'clothing_size', target.clothing_size is not null),
      ('shoe_size', p_payload ? 'shoe_size', target.shoe_size is not null),
      ('applicant_status', p_payload ?| array['applicant_status', 'applicant_status_details'], target.applicant_status is not null),
      ('supporting_entities', p_payload ? 'supporting_entities', target.supporting_entities is not null),
      ('season_number', p_payload ? 'season_number', target.season_number is not null),
      ('childcare_need', p_payload ? 'childcare_need', target.childcare_need is not null),
      ('specific_needs', p_payload ? 'specific_needs', target.specific_needs is not null)
  ),
  cleared as (
    delete from public.profile_answers answer
     using question
     where answer.profile_id = p_profile_id
       and answer.question = question.name
       and question.touched
       and not question.has_value
  )
  insert into public.profile_answers (profile_id, org_id, question, source, answered_by)
  select p_profile_id, target.org_id, question.name, p_source,
         -- The team member who typed it; an entity's answer is named by
         -- private.adopt_referral_answers, which knows the referral.
         case when p_source = 'staff' then (select auth.uid()) end
    from question
   where question.touched and question.has_value
  on conflict (profile_id, question) do update
    set source = excluded.source, answered_by = excluded.answered_by, answered_at = now();
end;
$function$;

revoke all on function private.apply_profile_prefill(uuid, jsonb, text) from public, anon, authenticated;

create or replace function private.adopt_referral_answers(p_referral_id uuid, p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer record;
  question public.custom_questions;
  adopted uuid[] := '{}';
  skipped integer := 0;
  referral_org uuid;
  referrer uuid;
  actor uuid := (select auth.uid());
begin
  select org_id, entity_user_id into referral_org, referrer
    from public.entity_referrals where id = p_referral_id;
  if referral_org is null or p_profile_id is null then
    return 0;
  end if;
  -- The app's own fields the entity gave were written just before, by the
  -- prefill, which does not know the referral: they are named here.
  update public.profile_answers
     set answered_by = referrer
   where profile_id = p_profile_id and source = 'entity' and answered_by is null;
  for answer in
    select r.question_id, (public.decrypt_field(r.value_encrypted))::jsonb as value
      from public.referral_custom_answers r
     where r.referral_id = p_referral_id
  loop
    select * into question from public.custom_questions q
     where q.id = answer.question_id and q.org_id = referral_org;
    -- What she or the team already answered stays: a later surface asks again
    -- only through her per-player choice.
    if question.id is null or exists (
         select 1 from public.custom_answers a
          where a.profile_id = p_profile_id and a.question_id = question.id
            and (a.season_id is null or a.season_id = private.current_season_id(referral_org))) then
      skipped := skipped + 1;
      continue;
    end if;
    begin
      perform private.write_custom_answer(p_profile_id, question, answer.value, 'entity', referrer);
      adopted := adopted || question.id;
    exception when check_violation or insufficient_privilege then
      -- An option archived since, or a seasonal field with no season: the
      -- referral keeps no copy either way.
      skipped := skipped + 1;
    end;
  end loop;
  delete from public.referral_custom_answers where referral_id = p_referral_id;
  -- Field ids only, never an answer. A row written with nobody signed in (a
  -- seed, a migration) has no actor to name.
  if actor is not null and (cardinality(adopted) > 0 or skipped > 0) then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (referral_org, actor, 'intake.entity_answers_adopted', 'entity_referral', p_referral_id,
            jsonb_build_object('profile_id', p_profile_id, 'fields', to_jsonb(adopted), 'skipped', skipped));
  end if;
  return cardinality(adopted);
end;
$$;

revoke all on function private.adopt_referral_answers(uuid, uuid) from public, anon, authenticated;

-- 3. A joined player's record -----------------------------------------------------------------------

-- Each built-in answer that changed on a joined player's record becomes an
-- answer again: hers when she changed it, the team member's otherwise. A value
-- cleared is no answer. Her onboarding (invited to player) and the prefill
-- (an invited profile) record their own answers and are not touched here.
create or replace function private.record_joined_profile_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  is_hers boolean;
begin
  -- A seed, a migration or a job: nobody to name.
  if actor is null then
    return null;
  end if;
  is_hers := actor = new.id;

  with question (name, changed, has_value) as (
    values
      ('first_name', old.first_name is distinct from new.first_name, new.first_name is not null),
      ('last_name', old.last_name is distinct from new.last_name, new.last_name is not null),
      ('date_of_birth', old.date_of_birth is distinct from new.date_of_birth, new.date_of_birth is not null),
      ('place_of_birth', old.place_of_birth is distinct from new.place_of_birth, new.place_of_birth is not null),
      ('nationality', old.nationality is distinct from new.nationality, new.nationality is not null),
      ('preferred_language', old.preferred_language is distinct from new.preferred_language, true),
      ('document',
        old.document_type is distinct from new.document_type
          or old.document_name is distinct from new.document_name
          or public.decrypt_field(old.document_number) is distinct from public.decrypt_field(new.document_number),
        new.document_type is not null
          and (new.document_type = 'none'
               or (new.document_type = 'other' and new.document_name is not null)
               or new.document_number is not null)),
      ('phone', public.decrypt_field(old.phone) is distinct from public.decrypt_field(new.phone), new.phone is not null),
      ('address', public.decrypt_field(old.address) is distinct from public.decrypt_field(new.address), new.address is not null),
      ('city', old.city is distinct from new.city, new.city is not null),
      ('postal_code', public.decrypt_field(old.postal_code) is distinct from public.decrypt_field(new.postal_code), new.postal_code is not null),
      ('reference_entity', old.reference_entity is distinct from new.reference_entity, new.reference_entity is not null),
      ('reference_contact_name', old.reference_contact_name is distinct from new.reference_contact_name, new.reference_contact_name is not null),
      ('dependents',
        old.has_dependents is distinct from new.has_dependents or old.num_dependents is distinct from new.num_dependents,
        new.has_dependents is not null),
      ('clothing_size', old.clothing_size is distinct from new.clothing_size, new.clothing_size is not null),
      ('shoe_size', old.shoe_size is distinct from new.shoe_size, new.shoe_size is not null),
      ('applicant_status',
        public.decrypt_field(old.applicant_status) is distinct from public.decrypt_field(new.applicant_status)
          or public.decrypt_field(old.applicant_status_details) is distinct from public.decrypt_field(new.applicant_status_details),
        new.applicant_status is not null),
      ('supporting_entities', old.supporting_entities is distinct from new.supporting_entities, new.supporting_entities is not null),
      ('childcare_need', old.childcare_need is distinct from new.childcare_need, new.childcare_need is not null),
      ('specific_needs', public.decrypt_field(old.specific_needs) is distinct from public.decrypt_field(new.specific_needs), new.specific_needs is not null)
  ),
  cleared as (
    delete from public.profile_answers answer
     using question
     where answer.profile_id = new.id
       and answer.question = question.name
       and question.changed
       and not question.has_value
  )
  insert into public.profile_answers (profile_id, org_id, question, source, answered_by)
  select new.id, new.org_id, question.name,
         case when is_hers then 'player' else 'staff' end,
         case when is_hers then null else actor end
    from question
   where question.changed and question.has_value
  on conflict (profile_id, question) do update
    set source = excluded.source, answered_by = excluded.answered_by, answered_at = now();
  return null;
end;
$$;

revoke all on function private.record_joined_profile_answers() from public, anon, authenticated;

create trigger profiles_record_joined_answers
  after update on public.profiles
  for each row
  -- An anonymized record holds no answers anybody gave.
  when (old.role = 'player' and new.role = 'player' and new.anonymized_at is null)
  execute function private.record_joined_profile_answers();

-- 4. Readers ---------------------------------------------------------------------------------------

-- Who an answer names: the team member, or the entity of the entity user.
create or replace function private.answer_author_name(p_answered_by uuid, p_source text, p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_source
    when 'staff' then (
      select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
        from public.profiles p
       where p.id = p_answered_by and p.org_id = p_org_id)
    when 'entity' then (
      select e.name
        from public.profiles p
        join public.collaborating_entities e
          on e.id = p.collaborating_entity_id and e.org_id = p.org_id
       where p.id = p_answered_by and p.org_id = p_org_id)
  end;
$$;

revoke all on function private.answer_author_name(uuid, text, uuid) from public, anon, authenticated;

-- A new column in the result: the function is dropped and made again.
drop function public.participant_custom_answers(uuid);

create function public.participant_custom_answers(p_profile_id uuid)
returns table (
  question_id uuid,
  season_id uuid,
  season_name text,
  value jsonb,
  source text,
  answered_at timestamptz,
  answered_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  sees_personal boolean := (select private.participant_permission(p_profile_id, 'participants.view_personal'));
  sees_sensitive boolean := (select private.participant_permission(p_profile_id, 'participants.view_sensitive'));
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id, a.season_id, s.name,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb),
         a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.custom_answers a
    join public.custom_questions q on q.id = a.question_id
    left join public.seasons s on s.id = a.season_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and (q.privacy = 'normal'
          or (q.privacy = 'personal' and sees_personal)
          or (q.privacy = 'sensitive' and sees_sensitive))
   order by q.sort_order, s.starts_on desc nulls first;
end;
$$;

revoke all on function public.participant_custom_answers(uuid) from public, anon, authenticated;
grant execute on function public.participant_custom_answers(uuid) to authenticated;

-- Who gave her answers to the app's own fields, and when. The values come
-- from get_participant_profile; this says only where they came from, for the
-- fields the reader may read (a question with no field of its own, such as
-- her language, is Normal).
create or replace function public.participant_profile_answers(p_profile_id uuid)
returns table (
  question text,
  source text,
  answered_at timestamptz,
  answered_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  sees_personal boolean := (select private.participant_permission(p_profile_id, 'participants.view_personal'));
  sees_sensitive boolean := (select private.participant_permission(p_profile_id, 'participants.view_sensitive'));
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question, a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.profile_answers a
    left join public.profile_fields f
      on f.org_id = a.org_id and f.builtin_key = a.question
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and (coalesce(f.privacy, 'normal') = 'normal'
          or (f.privacy = 'personal' and sees_personal)
          or (f.privacy = 'sensitive' and sees_sensitive))
   order by a.question;
end;
$$;

revoke all on function public.participant_profile_answers(uuid) from public, anon, authenticated;
grant execute on function public.participant_profile_answers(uuid) to authenticated;

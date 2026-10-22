-- Required answers re-checked where they could be skipped (pending fixes 18,
-- 19, RAPP-611) (RAPP-611).
--
-- 18. Re-registration ends with her signature. `update_my_season_answers`
--     refused a missing required season answer, but `sign_authorization` did
--     not, so a returning player could sign without them. One list,
--     `private.missing_required_season_answers`, now serves both. A staff
--     tablet signing is not refused: signing mode has no season questions
--     (RAPP-305, RAPP-306), and refusing an offline signing at sync would
--     lose a witnessed signature; her season answers stay a gap staff see.
-- 19. Joining re-checks the required staff questions placed every season,
--     which her wizard asks too, not only the wizard-placed ones.
--
-- Docs: https://www.postgresql.org/docs/current/plpgsql-errors-and-messages.html
-- (RAISE with a condition name), https://supabase.com/docs/guides/database/postgres/row-level-security.

-- Her required season questions without an answer: built-in names and
-- custom:<question id> for staff questions asked every season.
create or replace function private.missing_required_season_answers(p_profile_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select array_agg(required.question order by required.question)
      from public.profiles p,
           unnest(private.required_intake_questions(p.org_id)) required(question)
     where p.id = p_profile_id
       and case required.question
         when 'applicant_status' then p.applicant_status is null
         when 'supporting_entities' then coalesce(cardinality(p.supporting_entities), 0) = 0
         when 'childcare_need' then p.childcare_need is null
         when 'specific_needs' then p.specific_needs is null
         else false end), array[]::text[])
  || coalesce((
    select array_agg('custom:' || id::text)
      from unnest(private.missing_required_custom_answers(p_profile_id, 'season')) id), array[]::text[]);
$$;

revoke all on function private.missing_required_season_answers(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_my_season_answers(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = caller and role = 'player') then
    raise insufficient_privilege using message = 'only a player answers her season questions';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_payload - array['applicant_status_details', 'applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] <> '{}'::jsonb
    or not private.season_answers_valid(p_payload)
  then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    applicant_status = case when p_payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status'), '')) else p.applicant_status end,
    applicant_status_details = case when p_payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status_details'), '')) else p.applicant_status_details end,
    supporting_entities = case when p_payload ? 'supporting_entities'
      then private.text_array_answer(p_payload -> 'supporting_entities') else p.supporting_entities end,
    childcare_need = case when p_payload ? 'childcare_need'
      then nullif(p_payload ->> 'childcare_need', '') else p.childcare_need end,
    specific_needs = case when p_payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'specific_needs'), '')) else p.specific_needs end,
    updated_at = now()
  where p.id = caller;

  insert into public.profile_answers (profile_id, org_id, question, source)
  select distinct caller, p.org_id, case when key = 'applicant_status_details' then 'applicant_status' else key end, 'player'
    from public.profiles p, jsonb_object_keys(p_payload) key
   where p.id = caller
  on conflict (profile_id, question) do update set source = 'player', answered_at = now();

  -- Re-registration asks the season questions staff made required (RAPP-611),
  -- built-in and staff ones: they are re-checked here, the call that ends it.
  -- Her staff answers are saved just before this one.
  if cardinality(private.missing_required_season_answers(caller)) > 0 then
    raise not_null_violation using message = 'a required season question has no answer';
  end if;
end;
$function$

;

-- Her signature ends re-registration: a returning player signs once her
-- required season answers are there (pending fix 18).
create or replace function public.sign_authorization(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player signs her authorization';
  end if;
  version := private.current_authorization_version(me.org_id);
  if version.id is null or version.id <> p_version_id then
    raise check_violation using message = 'sign the current version';
  end if;
  if exists (select 1 from public.authorization_signatures sig
              where sig.profile_id = caller and sig.season_id <> version.season_id)
     and cardinality(private.missing_required_season_answers(caller)) > 0 then
    raise not_null_violation using message = 'a required season question has no answer';
  end if;
  return private.record_signature(gen_random_uuid(), caller, p_version_id, p_payload, 'app', null, now());
end;
$$;

CREATE OR REPLACE FUNCTION private.complete_onboarding_signed(payload jsonb, p_signing jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  previous_ids uuid[];
  acceptance uuid;
  drawing jsonb := nullif(p_signing->'signature','null'::jsonb);
  cannot_draw boolean;
begin
  if caller is null then raise insufficient_privilege using message='authenticated signing required'; end if;
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing->'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing->'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing->'unable_to_draw') is distinct from 'boolean'
    or (payload->'media_consent') is distinct from (p_signing->'media_consent')
    or length(coalesce(p_signing->>'device',''))>200
  then raise check_violation using message='explicit terms acceptance and matching media choice required'; end if;
  cannot_draw := (p_signing->>'unable_to_draw')::boolean;
  if (cannot_draw and drawing is not null) or
    (not cannot_draw and not private.app_signature_valid(drawing))
  then raise check_violation using message='draw a valid signature or use the cannot-draw alternative'; end if;

  -- Serialize calls for an existing account and identify this acceptance exactly,
  -- including two acceptances made in one transaction with the same timestamp.
  perform 1 from public.profiles where id=caller for update;
  select coalesce(array_agg(id),'{}'::uuid[]) into previous_ids
    from public.terms_acceptances where profile_id=caller;
  -- Her answers to the staff questions travel with the wizard (RAPP-611), so
  -- they are saved in the same transaction as her profile and the required
  -- ones are checked before anything is kept.
  saved := public.complete_onboarding(payload - 'custom_answers');
  if payload ? 'custom_answers' then
    perform private.save_player_custom_answers(caller, saved.org_id,
      coalesce(nullif(payload -> 'custom_answers', 'null'::jsonb), '{}'::jsonb));
  end if;
  -- The wizard asks the staff questions placed every season too (isAskedOfHer),
  -- so both are re-checked (pending fix 19).
  if cardinality(private.missing_required_custom_answers(caller, 'wizard'))
     + cardinality(private.missing_required_custom_answers(caller, 'season')) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires an answer to a required staff question';
  end if;
  select id into strict acceptance from public.terms_acceptances
    where profile_id=caller and not (id=any(previous_ids));
  insert into public.app_terms_signatures
    (acceptance_id,profile_id,org_id,signature,unable_to_draw,media_consent,device)
  values (acceptance,caller,saved.org_id,drawing,cannot_draw,(p_signing->>'media_consent')::boolean,nullif(p_signing->>'device',''));
  return saved;
end $function$

;

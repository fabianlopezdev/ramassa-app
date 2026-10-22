-- Dependants unknown until she answers, on every profile staff create
-- (pending fix 17, RAPP-611).
--
-- RAPP-611 made `profiles.has_dependents` nullable: an optional dependants
-- question she did not answer is unknown, never "no". The column default
-- stayed `false`, so a profile staff create (an invitation, which inserts the
-- profile and fills only what staff typed) still read "no dependants" until
-- she onboarded, and a count of players without dependants miscounted her.
--
--   1. The column has no default: a new profile's dependants are null.
--   2. Invited profiles nobody answered the question for are set back to
--      null (a stored false there was the default, never an answer).
--   3. The test player scenario (RAPP-619) resets and clears the answer to
--      null too, so a reset player is a new invitation.
--
-- Every reader already handles null (RAPP-611): `dependentsShown` in the
-- admin table and card, the participant prefill, the wizard prefill (only
-- an answered question is read), exports (an empty cell).
--
-- Pending fix 16 (RAPP-624) needs no change here: `update_participant_profile`
-- lost its PUBLIC and anon grants in 20261022040000; the privilege checks in
-- supabase/tests/0111 prove it.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html (DROP
-- DEFAULT: "the default value for the column is null").

alter table public.profiles alter column has_dependents drop default;

update public.profiles p
   set has_dependents = null, num_dependents = 0
 where p.role = 'invited'
   and p.has_dependents is false
   and not exists (select 1 from public.profile_answers a
                    where a.profile_id = p.id and a.question = 'dependents');

CREATE OR REPLACE FUNCTION private.scenario_reset(p_target profiles)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_email text;
begin
  select lower(u.email) into owner_email from auth.users u where u.id = p_target.id;

  -- Not joined, with an open invitation.
  perform private.scenario_terms(p_target, '{"accepted": false}'::jsonb);
  -- No signature and no consent, this season or any other.
  delete from public.authorization_signatures where profile_id = p_target.id;
  delete from public.authorization_consent_events where profile_id = p_target.id;
  delete from public.season_answers where profile_id = p_target.id;
  -- Nothing answered but the name the invitation gave her.
  delete from public.profile_answers
   where profile_id = p_target.id and question not in ('first_name', 'last_name');
  delete from public.custom_answers where profile_id = p_target.id;
  update public.profiles p set
    date_of_birth = null, place_of_birth = null, nationality = null,
    document_type = null, document_number = null, document_name = null,
    phone = null, address = null, city = null, postal_code = null,
    reference_entity = null, reference_contact_name = null,
    has_dependents = null, num_dependents = 0, clothing_size = null, shoe_size = null,
    avatar_url = null, media_consent_at = null,
    applicant_status = null, applicant_status_details = null, supporting_entities = null,
    season_number = null, prior_seasons = 0, childcare_need = null, specific_needs = null,
    health_info = null, emergency_contact_name = null, emergency_contact_relation = null,
    emergency_contact_phone = null, updated_at = now()
  where p.id = p_target.id;
  return '{}'::jsonb;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.scenario_answers(p_target profiles, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fill jsonb := coalesce(p_change -> 'fill', '{}'::jsonb);
  clear text[];
  question text;
begin
  if jsonb_typeof(fill) <> 'object'
    or coalesce(jsonb_typeof(p_change -> 'clear'), 'array') <> 'array'
  then
    raise invalid_parameter_value using message = 'answers take fill (an object) and clear (a list)';
  end if;
  clear := array(select jsonb_array_elements_text(coalesce(p_change -> 'clear', '[]'::jsonb)));

  if exists (select 1 from jsonb_object_keys(fill) k where not (k = any (private.scenario_answer_keys()))) then
    raise invalid_parameter_value using message = 'a sample answer has an unknown field';
  end if;
  foreach question in array clear loop
    if not (question = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'unknown question ' || question;
    end if;
    -- A joined woman keeps a complete profile, as every finished onboarding does.
    if p_target.role = 'player' and question = any (private.required_intake_questions()) then
      raise object_not_in_prerequisite_state
        using message = 'she has joined: set the app terms to not accepted before clearing a required answer';
    end if;
  end loop;

  if fill <> '{}'::jsonb then
    perform private.apply_profile_prefill(p_target.id, fill, 'staff');
  end if;

  if cardinality(clear) > 0 then
    -- Her name and language cannot be empty, and dependants has a default:
    -- they keep their value and stop counting as answered, so she is asked.
    update public.profiles p set
      date_of_birth = case when 'date_of_birth' = any (clear) then null else p.date_of_birth end,
      place_of_birth = case when 'place_of_birth' = any (clear) then null else p.place_of_birth end,
      nationality = case when 'nationality' = any (clear) then null else p.nationality end,
      document_type = case when 'document' = any (clear) then null else p.document_type end,
      document_number = case when 'document' = any (clear) then null else p.document_number end,
      document_name = case when 'document' = any (clear) then null else p.document_name end,
      phone = case when 'phone' = any (clear) then null else p.phone end,
      address = case when 'address' = any (clear) then null else p.address end,
      city = case when 'city' = any (clear) then null else p.city end,
      postal_code = case when 'postal_code' = any (clear) then null else p.postal_code end,
      reference_entity = case when 'reference_entity' = any (clear) then null else p.reference_entity end,
      reference_contact_name = case when 'reference_contact_name' = any (clear)
        then null else p.reference_contact_name end,
      has_dependents = case when 'dependents' = any (clear) then null else p.has_dependents end,
      num_dependents = case when 'dependents' = any (clear) then 0 else p.num_dependents end,
      clothing_size = case when 'clothing_size' = any (clear) then null else p.clothing_size end,
      shoe_size = case when 'shoe_size' = any (clear) then null else p.shoe_size end,
      applicant_status = case when 'applicant_status' = any (clear) then null else p.applicant_status end,
      applicant_status_details = case when 'applicant_status' = any (clear)
        then null else p.applicant_status_details end,
      supporting_entities = case when 'supporting_entities' = any (clear)
        then null else p.supporting_entities end,
      childcare_need = case when 'childcare_need' = any (clear) then null else p.childcare_need end,
      specific_needs = case when 'specific_needs' = any (clear) then null else p.specific_needs end,
      updated_at = now()
    where p.id = p_target.id;
    delete from public.profile_answers a where a.profile_id = p_target.id and a.question = any (clear);
  end if;

  -- The field names only: the values are made up, but the audit log never
  -- holds answers (ADR-004).
  return jsonb_build_object(
    'filled', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(fill) k),
    'cleared', to_jsonb(clear));
end;
$function$

;

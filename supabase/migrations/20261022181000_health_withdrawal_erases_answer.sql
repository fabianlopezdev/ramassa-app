-- Withdrawing the health data consent erases her health answer (RAPP-614,
-- pending fix 25).
--
-- Her health answer is special category data (GDPR art. 9) processed on her
-- explicit consent, which she can withdraw at any time (art. 7(3)). Withdrawing
-- `health_data` from her profile kept the answer stored and readable by staff
-- with participants.view_health. Decision (safer default, Fabián may
-- overrule): the withdrawal deletes her stored health answer in the same
-- transaction, audited with ids only (`consent.health_answer_erased`). The
-- participant page then says the consent was withdrawn.
--
-- Docs: https://gdpr-info.eu/art-9-gdpr/, https://gdpr-info.eu/art-7-gdpr/ and
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security definer functions with an empty search path).

CREATE OR REPLACE FUNCTION public.set_optional_consent(p_key text, p_granted boolean, p_language text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
  shown_language text;
  last_event public.authorization_consent_events;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player changes her consents';
  end if;
  version := private.current_authorization_version(me.org_id);
  shown_language := coalesce(nullif(p_language, ''), me.preferred_language, 'ca');
  if shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  select * into last_event from public.authorization_consent_events e
   where e.profile_id = caller and e.consent_key = p_key
   order by e.decided_at desc, e.id desc limit 1;
  if p_granted is null
    or (version.content -> 'consents' -> p_key ->> 'required')::boolean is true
    or not (
      (version.content -> 'consents' -> p_key ->> 'required')::boolean is false
      or (not p_granted and last_event.granted is true)
    )
  then
    raise invalid_parameter_value using message = 'only an optional consent changes here';
  end if;

  insert into public.authorization_consent_events
    (org_id, profile_id, consent_key, granted, method, version_id, language, wording, required)
  values (
    me.org_id, caller, p_key, p_granted, 'profile',
    case when version.content -> 'consents' ? p_key then version.id else last_event.version_id end,
    case when version.content -> 'consents' ? p_key then shown_language else last_event.language end,
    case when version.content -> 'consents' ? p_key
      then private.localized_text_in(version.content -> 'consents' -> p_key -> 'label', shown_language)
      else last_event.wording end,
    false);

  if p_key = 'image_rights' then
    perform set_config('ramassa.consent_event_written', 'on', true);
    update public.profiles
       set media_consent_at = case when p_granted then coalesce(media_consent_at, now()) end
     where id = caller;
    perform set_config('ramassa.consent_event_written', '', true);
  end if;

  -- Without her consent her health answer is not kept (pending fix 25).
  if p_key = 'health_data' and not p_granted then
    update public.profiles set health_info = null, updated_at = now()
     where id = caller and health_info is not null;
    if found then
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (me.org_id, caller, 'consent.health_answer_erased', 'profile', caller,
              jsonb_build_object('consent', 'health_data'));
    end if;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (me.org_id, caller, 'consent.change', 'profile', caller,
          jsonb_build_object('consent', p_key, 'granted', p_granted));
end;
$function$;


-- RAPP-781: French (fr) is a supported language.
--
-- The database ACCEPTS French everywhere a language is checked: a stored
-- language, a key of a text, a fallback order, a picked language. It REQUIRES
-- it nowhere: every "complete in every language" rule keeps the five languages
-- it had, so rows written before French stay valid when they are next updated,
-- and the app build already installed (which sends five languages) keeps
-- working. The Control Center and the new app ask for French before they
-- publish. French is switched on for every organization, in the picker order
-- (ca, es, en, fr, ar, fa), and for every new one.
--
-- Each function below is its current definition with French added to its
-- language lists, plus:
--   * private.valid_notification_copy, private.valid_survey_copy: the copy no
--     longer has to hold exactly five keys (the five plus French is valid);
--   * public.is_knowledge_body_valid: a French body, when present, has the
--     same blocks as the Catalan one;
--   * private.member_label: the French label of a test player;
--   * public.create_data_export: French title and category columns;
--   * public.get_service_review_queue: the search reads French titles too;
--   * public.save_forum_category: the five names stay required, and a French
--     name, when given, is not blank.

-- Check constraints that list the languages ------------------------------------------------

alter table public.organizations drop constraint organizations_document_step_explanation_shape;
alter table public.organizations add constraint organizations_document_step_explanation_shape CHECK (((document_step_explanation IS NULL) OR ((jsonb_typeof(document_step_explanation) = 'object'::text) AND (length(btrim(COALESCE((document_step_explanation ->> 'ca'::text), ''::text))) > 0) AND ((document_step_explanation - ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text]) = '{}'::jsonb))));

alter table public.organizations drop constraint organizations_available_languages_supported;
alter table public.organizations add constraint organizations_available_languages_supported CHECK (((cardinality(available_languages) > 0) AND (available_languages <@ ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text]) AND (default_language = ANY (available_languages)) AND ((locked_default_language IS NULL) OR ((default_language = locked_default_language) AND (locked_default_language = ANY (available_languages))))));

alter table public.organizations drop constraint organizations_locked_default_language_check;
alter table public.organizations add constraint organizations_locked_default_language_check CHECK (((locked_default_language IS NULL) OR (locked_default_language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text]))));

alter table public.organizations drop constraint organizations_default_language_supported;
alter table public.organizations add constraint organizations_default_language_supported CHECK ((default_language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text])));

alter table public.terms_acceptances drop constraint terms_acceptances_locale_shown_check;
alter table public.terms_acceptances add constraint terms_acceptances_locale_shown_check CHECK ((locale_shown = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text])));

alter table public.equipment_deliveries drop constraint equipment_deliveries_statement_language_check;
alter table public.equipment_deliveries add constraint equipment_deliveries_statement_language_check CHECK (((statement_language IS NULL) OR (statement_language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text]))));

alter table public.knowledge_articles drop constraint knowledge_articles_submission_language_check;
alter table public.knowledge_articles add constraint knowledge_articles_submission_language_check CHECK (((submission_language IS NULL) OR (submission_language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text]))));

alter table public.push_deliveries drop constraint push_deliveries_language_check;
alter table public.push_deliveries add constraint push_deliveries_language_check CHECK ((language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text])));

alter table public.authorization_signatures drop constraint authorization_signatures_language_check;
alter table public.authorization_signatures add constraint authorization_signatures_language_check CHECK (((language IS NULL) OR (language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text]))));

alter table public.consent_events drop constraint consent_events_language_check;
alter table public.consent_events add constraint consent_events_language_check CHECK (((language IS NULL) OR (language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text]))));

alter table public.form_signatures drop constraint form_signatures_language_check;
alter table public.form_signatures add constraint form_signatures_language_check CHECK ((language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text])));

alter table public.walk_in_form_signatures drop constraint walk_in_form_signatures_language_check;
alter table public.walk_in_form_signatures add constraint walk_in_form_signatures_language_check CHECK ((language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text])));

alter table public.walk_in_consents drop constraint walk_in_consents_language_check;
alter table public.walk_in_consents add constraint walk_in_consents_language_check CHECK ((language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'fr'::text, 'ar'::text, 'fa'::text])));

-- French is on for every organization ----------------------------------------------------------

alter table public.organizations
  alter column available_languages set default array['ca', 'es', 'en', 'fr', 'ar', 'fa'];

update public.organizations
set available_languages = array(
  select language
  from unnest(array['ca', 'es', 'en', 'fr', 'ar', 'fa']) with ordinality as listed(language, position)
  where language = 'fr' or language = any (available_languages)
  order by position
)
where not ('fr' = any (available_languages));

-- A player's own story may be written in French ----------------------------------------------

alter policy knowledge_articles_insert_org_staff_or_own_story on public.knowledge_articles
  with check (
    org_id = (select public.current_org_id())
    and created_by = (select auth.uid())
    and (
      (select public.has_permission('knowledge.edit'))
      or (select public.has_permission('knowledge.publish'))
      or (
        (select public.current_app_role()) = 'player'
        and content_type = 'participant_story'
        and author_id = (select auth.uid())
        and story_status = 'submitted'
        and not is_published
        and published_at is null
        and expires_at is null
        and reviewer_note is null
        and submission_language = any (array['ca', 'es', 'en', 'fr', 'ar', 'fa'])
        and title ? submission_language
        and body ? submission_language
        and publication_consent = true
        and publication_consent_at is not null
        and publication_consent_version = 'story-publication-v1'
        and public.is_story_image_urls_valid(story_image_urls, org_id, author_id)
      )
    )
  );

-- Functions -----------------------------------------------------------------------------------

-- private.app_terms_given_valid
CREATE OR REPLACE FUNCTION private.app_terms_given_valid(p_given jsonb, p_names_version boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_typeof(p_given) = 'object'
    and p_given - array['version_id', 'language', 'answers', 'consents', 'signatures', 'device'] = '{}'::jsonb
    and (not p_names_version or private.is_uuid_text(p_given ->> 'version_id'))
    and coalesce(p_given ->> 'language', '') in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
    and jsonb_typeof(p_given -> 'consents') = 'object'
    and not exists (select 1 from jsonb_each(p_given -> 'consents') t where jsonb_typeof(t.value) <> 'boolean')
    and jsonb_typeof(p_given -> 'signatures') = 'object'
    and coalesce(jsonb_typeof(p_given -> 'answers'), 'object') in ('object', 'null')
    and length(coalesce(p_given ->> 'device', '')) <= 200,
    false);
$function$;

-- private.app_terms_text_or
CREATE OR REPLACE FUNCTION private.app_terms_text_or(p_text jsonb, p_fallback jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when jsonb_typeof(p_text) = 'object' and length(btrim(coalesce(p_text ->> 'ca', ''))) > 0 then (
      select jsonb_object_agg(entry.key, btrim(entry.value #>> '{}'))
        from jsonb_each(p_text) entry
       where entry.key in ('ca', 'es', 'en', 'fr', 'ar', 'fa') and jsonb_typeof(entry.value) = 'string'
         and length(btrim(entry.value #>> '{}')) > 0)
    else p_fallback end;
$function$;

-- private.apply_forum_flag
CREATE OR REPLACE FUNCTION private.apply_forum_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  publication_id uuid;
begin
  if new.target_type = 'post' then
    update public.forum_posts
    set flag_count = flag_count + 1,
      visibility = case when visibility = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else visibility end
    where org_id = new.org_id and id = new.post_id;
  elsif new.target_type = 'reply' then
    update public.forum_replies
    set flag_count = flag_count + 1,
      visibility = case when visibility = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else visibility end
    where org_id = new.org_id and id = new.reply_id;
  else
    update public.media_items
    set flag_count = flag_count + 1,
      moderation_state = case when moderation_state = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else moderation_state end
    where org_id = new.org_id and id = new.media_id;
  end if;

  insert into public.push_publications (org_id, content_type, content_id, scheduled_for, state)
  values (new.org_id, 'forum_flag', new.id, new.created_at, 'processing')
  on conflict (content_type, content_id) do nothing
  returning id into publication_id;

  if publication_id is not null then
    insert into public.push_deliveries (
      org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
    )
    select new.org_id, publication_id, push_token.id, profile.id,
      case when profile.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
        then profile.preferred_language else 'ca' end,
      new.created_at
    from public.profiles as profile
    join public.push_tokens as push_token on push_token.user_id = profile.id
    where profile.org_id = new.org_id
      and (select private.profile_has_permission(profile.id, 'forum.moderate'))
      and profile.is_active
      and profile.push_notifications_enabled
    on conflict on constraint push_deliveries_publication_token_unique do nothing;
    perform private.invoke_push_dispatch('forum_flag');
  end if;
  return new;
end;
$function$;

-- private.claim_push_deliveries
CREATE OR REPLACE FUNCTION private.claim_push_deliveries(dispatch_secret text, claiming_worker_id uuid, claimed_at timestamp with time zone DEFAULT now(), claim_limit integer DEFAULT 500)
 RETURNS TABLE(delivery_id uuid, publication_id uuid, push_token_id uuid, recipient_id uuid, token text, language text, content_type text, content_id uuid, title jsonb, body jsonb, expires_at timestamp with time zone, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.push_dispatch_secret_matches(dispatch_secret) then
    raise exception 'PUSH-1' using errcode = '28000';
  end if;
  if claim_limit < 1 or claim_limit > 1000 then
    raise exception 'claim_limit must be between 1 and 1000'
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.enqueue_due_push_publications(claimed_at);
  update public.push_deliveries as stale
  set
    state = case when stale.expo_ticket_id is null then 'retry' else 'ticketed' end,
    worker_id = null,
    lease_expires_at = null,
    next_attempt_at = claimed_at,
    receipt_due_at = case when stale.expo_ticket_id is null then null else claimed_at end,
    last_error_code = 'PUSH-8'
  where stale.state in ('sending', 'checking_receipt')
    and stale.lease_expires_at <= claimed_at;

  with pending_publications as (
    select publication.id, publication.org_id
    from public.push_publications as publication
    where publication.state = 'pending'
      and publication.content_type <> 'targeted_notification'
      and publication.scheduled_for <= claimed_at
    order by publication.scheduled_for, publication.id
    for update skip locked
  )
  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    publication.org_id,
    publication.id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    claimed_at
  from pending_publications as publication
  join public.profiles as profile
    on profile.org_id = publication.org_id
   and profile.role = 'player'
   and profile.is_active
   and profile.push_notifications_enabled
  join public.push_tokens as push_token on push_token.user_id = profile.id
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.refresh_push_publication_states(claimed_at);

  return query
  with candidates as (
    select delivery.id
    from public.push_deliveries as delivery
    join public.push_publications as publication
      on publication.org_id = delivery.org_id
     and publication.id = delivery.publication_id
    where delivery.state in ('pending', 'retry')
      and delivery.next_attempt_at <= claimed_at
      and delivery.push_token_id is not null
      and publication.scheduled_for <= claimed_at
    order by delivery.next_attempt_at, delivery.id
    limit claim_limit
    for update of delivery skip locked
  ), claimed as (
    update public.push_deliveries as delivery
    set state = 'sending', worker_id = claiming_worker_id,
      lease_expires_at = claimed_at + interval '5 minutes',
      attempt_count = delivery.attempt_count + 1
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  ), marked_publications as (
    update public.push_publications as publication
    set state = 'processing', completed_at = null
    where (publication.org_id, publication.id) in (
      select distinct claimed.org_id, claimed.publication_id from claimed
    )
    returning publication.id
  )
  select
    claimed.id,
    claimed.publication_id,
    claimed.push_token_id,
    claimed.recipient_id,
    push_token.token,
    claimed.language,
    publication.content_type,
    publication.content_id,
    case
      when publication.content_type = 'announcement' then announcement.title
      when publication.content_type = 'targeted_notification' then targeted_send.title
      when publication.content_type = 'custom_form' then custom_form.name
      else event.title
    end,
    case
      when publication.content_type = 'announcement' then announcement.body
      when publication.content_type = 'targeted_notification' then targeted_send.body
      when publication.content_type = 'custom_form' then null
      else event.description
    end,
    case
      when publication.content_type = 'announcement' then announcement.expires_at
      when publication.content_type = 'event' then event.expires_at
      else null
    end,
    claimed.attempt_count
  from claimed
  join marked_publications on marked_publications.id = claimed.publication_id
  join public.push_publications as publication
    on publication.org_id = claimed.org_id and publication.id = claimed.publication_id
  join public.push_tokens as push_token
    on push_token.user_id = claimed.recipient_id and push_token.id = claimed.push_token_id
  left join public.announcements as announcement
    on publication.content_type = 'announcement'
   and announcement.org_id = publication.org_id and announcement.id = publication.content_id
  left join public.events as event
    on publication.content_type = 'event'
   and event.org_id = publication.org_id and event.id = publication.content_id
  left join public.targeted_notification_sends as targeted_send
    on publication.content_type = 'targeted_notification'
   and targeted_send.org_id = publication.org_id and targeted_send.id = publication.content_id
  left join public.custom_form_responses as form_response
    on publication.content_type = 'custom_form'
   and form_response.org_id = publication.org_id and form_response.id = publication.content_id
  left join public.custom_forms as custom_form on custom_form.id = form_response.form_id
  order by claimed.id;
end;
$function$;

-- private.create_targeted_notification_send
CREATE OR REPLACE FUNCTION private.create_targeted_notification_send(p_template_id uuid, p_title jsonb, p_body jsonb, p_audience_kind text, p_audience_config jsonb, p_expected_recipient_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  recipient_ids uuid[];
  actual_recipient_count integer;
  actual_device_count integer;
  send_id uuid;
  publication_id uuid;
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if not private.valid_notification_copy(p_title, 120)
    or not private.valid_notification_copy(p_body, 1000)
    or p_expected_recipient_count < 1
  then
    raise exception 'NOTIFICATIONS/INVALID_SEND' using errcode = '23514';
  end if;
  if p_template_id is not null and not exists (
    select 1 from public.notification_templates
    where id = p_template_id and org_id = actor_org
  ) then
    raise exception 'NOTIFICATIONS/TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(audience.participant_id), '{}'::uuid[]),
    count(*)::integer,
    coalesce(sum(audience.device_count), 0)::integer
  into recipient_ids, actual_recipient_count, actual_device_count
  from public.preview_notification_audience(p_audience_kind, coalesce(p_audience_config, '{}'::jsonb)) audience;

  if actual_recipient_count <> p_expected_recipient_count then
    raise exception 'NOTIFICATIONS/AUDIENCE_CHANGED' using errcode = 'P0001';
  end if;

  insert into public.targeted_notification_sends (
    org_id, template_id, title, body, audience_kind, audience_config,
    recipient_count, sent_by
  ) values (
    actor_org, p_template_id, p_title, p_body, p_audience_kind,
    coalesce(p_audience_config, '{}'::jsonb), actual_recipient_count, actor
  ) returning id into send_id;

  insert into public.push_publications (
    org_id, content_type, content_id, scheduled_for, recipient_count
  ) values (
    actor_org, 'targeted_notification', send_id, now(), actual_device_count
  ) returning id into publication_id;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    actor_org,
    publication_id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    now()
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = actor_org
    and profile.id = any(recipient_ids)
    and profile.role = 'player'
    and profile.is_active
    and not profile.is_test_account
    and profile.push_notifications_enabled;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'targeted_notification_sent',
    'targeted_notification_send',
    send_id,
    jsonb_build_object(
      'audience_kind', p_audience_kind,
      'recipient_count', actual_recipient_count,
      'template_id', p_template_id
    )
  );

  perform private.invoke_push_dispatch('targeted');
  return send_id;
end;
$function$;

-- private.enqueue_message_push
CREATE OR REPLACE FUNCTION private.enqueue_message_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  recipient uuid;
  recipient_role text;
  publication_id uuid;
begin
  if not exists (
    select 1 from public.profiles as sender
    where sender.id = new.sender_id
      and sender.org_id = new.org_id
      and sender.role in ('staff', 'admin')
  ) then
    return new;
  end if;

  select conversation.user_id, profile.role
  into recipient, recipient_role
  from public.conversations as conversation
  join public.profiles as profile
    on profile.org_id = conversation.org_id and profile.id = conversation.user_id
  where conversation.org_id = new.org_id and conversation.id = new.conversation_id;

  if recipient_role <> 'player' then
    return new;
  end if;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    new.org_id, 'message', new.id, recipient, new.created_at, 'processing'
  )
  on conflict (content_type, content_id) do nothing
  returning id into publication_id;

  if publication_id is null then
    return new;
  end if;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    new.org_id,
    publication_id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    new.created_at
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = new.org_id
    and profile.id = recipient
    and profile.is_active
    and profile.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.invoke_push_dispatch('message');
  return new;
end;
$function$;

-- private.enqueue_referral_update_push
CREATE OR REPLACE FUNCTION private.enqueue_referral_update_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  recipient uuid;
  publication uuid;
begin
  select referral.assigned_staff_id into recipient
  from public.entity_referrals as referral
  where referral.org_id = new.org_id and referral.id = new.referral_id;

  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    new.org_id, 'referral_update', new.id, recipient, new.created_at, 'processing'
  )
  on conflict (content_type, content_id) do nothing
  returning id into publication;

  if publication is not null then
    insert into public.push_deliveries (
      org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
    )
    select
      new.org_id,
      publication,
      push_token.id,
      profile.id,
      case when profile.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
        then profile.preferred_language else 'ca' end,
      new.created_at
    from public.profiles as profile
    join public.push_tokens as push_token on push_token.user_id = profile.id
    where profile.org_id = new.org_id
      and profile.id = recipient
      and (select private.profile_has_permission(profile.id, 'referrals.manage'))
      and profile.is_active
      and profile.push_notifications_enabled
    on conflict on constraint push_deliveries_publication_token_unique do nothing;

    perform private.invoke_push_dispatch('referral_update');
  end if;

  return new;
end;
$function$;

-- private.form_signature_given_valid
CREATE OR REPLACE FUNCTION private.form_signature_given_valid(p_given jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_typeof(p_given) = 'object'
    and coalesce(p_given ->> 'language', '') in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
    and case when p_given ? 'unable_to_draw'
             then p_given - array['unable_to_draw', 'language'] = '{}'::jsonb
                  and p_given -> 'unable_to_draw' = 'true'::jsonb
             else p_given - array['strokes', 'language'] = '{}'::jsonb
                  and private.app_signature_valid(p_given -> 'strokes') end,
    false);
$function$;

-- private.localized_text_in
CREATE OR REPLACE FUNCTION private.localized_text_in(p_text jsonb, p_language text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (
    select nullif(btrim(p_text ->> candidate.language), '')
      from unnest(array[coalesce(p_language, 'ca'), 'ca', 'es', 'en', 'fr', 'ar', 'fa'])
           with ordinality as candidate(language, ordinal)
     where nullif(btrim(p_text ->> candidate.language), '') is not null
     order by candidate.ordinal
     limit 1);
$function$;

-- private.localized_text_valid
CREATE OR REPLACE FUNCTION private.localized_text_valid(p_text jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_typeof(p_text) = 'object'
    and p_text - array['ca', 'es', 'en', 'fr', 'ar', 'fa'] = '{}'::jsonb
    and exists (
      select 1 from jsonb_each(p_text) entry
       where jsonb_typeof(entry.value) = 'string' and length(btrim(entry.value #>> '{}')) > 0
    )
    and not exists (
      select 1 from jsonb_each(p_text) entry
       where jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 20000
    ),
    false);
$function$;

-- private.member_label
CREATE OR REPLACE FUNCTION private.member_label(p_number integer, p_language text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_language
           when 'en' then 'Player '
           when 'fr' then 'Joueuse '
           when 'ar' then 'اللاعبة '
           when 'fa' then 'بازیکن '
           else 'Jugadora '
         end
         || case when p_number between 0 and 9999 then lpad(p_number::text, 4, '0') else p_number::text end;
$function$;

-- private.notify_custom_form
CREATE OR REPLACE FUNCTION private.notify_custom_form(p_org_id uuid, p_response_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  publication_id uuid;
begin
  insert into public.push_publications (org_id, content_type, content_id, recipient_id, scheduled_for, state)
  values (p_org_id, 'custom_form', p_response_id, p_profile_id, now(), 'processing')
  on conflict do nothing
  returning id into publication_id;
  if publication_id is null then
    return;
  end if;
  insert into public.push_deliveries (org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at)
  select p_org_id, publication_id, push_token.id, player.id,
         case when player.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
              then player.preferred_language else 'ca' end,
         now()
    from public.profiles as player
    join public.push_tokens as push_token on push_token.user_id = player.id
   where player.org_id = p_org_id and player.id = p_profile_id and player.role = 'player'
     and player.is_active and player.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;
end;
$function$;

-- private.onboarding_consents_shown
CREATE OR REPLACE FUNCTION private.onboarding_consents_shown(p_org_id uuid, p_consents jsonb, p_language text, p_screens text[] DEFAULT NULL::text[], p_custom_form_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(consent_id uuid, consent_key text, granted boolean, required boolean, screen_key text, wording text, language text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  shown_language text := case when p_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa') then p_language else 'ca' end;
  asked_surface text := case when p_custom_form_id is null then 'onboarding' else 'custom_form' end;
  asked record;
begin
  if p_consents is null or p_consents = 'null'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_consents) <> 'object'
     or exists (select 1 from jsonb_each(p_consents) given where jsonb_typeof(given.value) <> 'boolean')
     or exists (
       select 1 from jsonb_object_keys(p_consents) given(key)
        where not exists (
          select 1 from public.consent_placements p
            join public.consents c on c.id = p.consent_id and not c.is_archived
           where p.org_id = p_org_id and p.surface = asked_surface and c.key = given.key
             and p.custom_form_id is not distinct from p_custom_form_id
             and case when p_custom_form_id is null then private.onboarding_screen_live(p_org_id, p.screen_key)
                      else private.custom_form_screen_live(p.screen_key) end))
  then
    raise check_violation using message = 'her Onboarding consents are ticks of the consents it asks';
  end if;
  for asked in
    select c.id, c.key, c.body, p.required, p.screen_key
      from public.consent_placements p
      join public.consents c on c.id = p.consent_id and not c.is_archived
     where p.org_id = p_org_id and p.surface = asked_surface
       and p.custom_form_id is not distinct from p_custom_form_id
       and case when p_custom_form_id is null then private.onboarding_screen_live(p_org_id, p.screen_key)
                else private.custom_form_screen_live(p.screen_key) end
       and (p_screens is null or p.screen_key = any (p_screens))
     order by p.screen_key, p.sort_order
  loop
    if asked.required and (p_consents -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'every required consent must be given';
    end if;
    consent_id := asked.id;
    consent_key := asked.key;
    granted := coalesce((p_consents ->> asked.key)::boolean, false);
    required := asked.required;
    screen_key := asked.screen_key;
    wording := private.localized_text_in(asked.body, shown_language);
    language := shown_language;
    return next;
  end loop;
end;
$function$;

-- private.optional_screen_text_valid
CREATE OR REPLACE FUNCTION private.optional_screen_text_valid(p_text jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_typeof(p_text) = 'object'
    and p_text <> '{}'::jsonb
    and p_text - array['ca', 'es', 'en', 'fr', 'ar', 'fa'] = '{}'::jsonb
    and not exists (
      select 1 from jsonb_each(p_text) entry
       where jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 2000
    ),
    false);
$function$;

-- private.valid_notification_copy
CREATE OR REPLACE FUNCTION private.valid_notification_copy(copy jsonb, max_length integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_typeof(copy) = 'object'
    and copy ?& array['ca', 'es', 'en', 'ar', 'fa']
    and not exists (
      select 1
      from jsonb_each(copy) as item(language, value)
      where item.language not in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
        or jsonb_typeof(item.value) <> 'string'
        or length(btrim(item.value #>> '{}')) not between 1 and max_length
    );
$function$;

-- private.valid_survey_copy
CREATE OR REPLACE FUNCTION private.valid_survey_copy(copy jsonb, max_length integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_typeof(copy) = 'object'
    and copy ?& array['ca', 'es', 'en', 'ar', 'fa']
    and not exists (
      select 1
      from jsonb_each(copy) as item(language, value)
      where item.language not in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
        or jsonb_typeof(item.value) <> 'string'
        or length(btrim(item.value #>> '{}')) not between 1 and max_length
    );
$function$;

-- private.validate_signing_payload
CREATE OR REPLACE FUNCTION private.validate_signing_payload(p_payload jsonb, p_version authorization_versions, p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  snapshot jsonb := private.authorization_version_snapshot(p_version);
  is_form boolean := jsonb_typeof(p_payload) = 'object' and p_payload ? 'signatures';
  consents jsonb := coalesce(nullif(p_payload -> 'consents', 'null'::jsonb), '{}'::jsonb);
  signatures jsonb := coalesce(nullif(p_payload -> 'signatures', 'null'::jsonb), '{}'::jsonb);
  answers jsonb;
  drawing jsonb := p_payload -> 'signature';
  cannot_draw boolean := coalesce((p_payload ->> 'unable_to_draw')::boolean, false);
  shown_language text := nullif(p_payload ->> 'language', '');
  block jsonb;
  given jsonb;
  main_given jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or snapshot is null then
    raise check_violation using message = 'sign with a drawing, or record that she could not draw';
  end if;
  if shown_language is not null and shown_language not in ('ca', 'es', 'en', 'fr', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  -- An older build shows the old content only (RAPP-773).
  if not is_form and not private.authorization_version_compatible(p_version) then
    raise feature_not_supported using message = 'AUTHORIZATION/UPDATE_THE_APP: this authorization needs the new app';
  end if;
  answers := private.signing_answers(p_version.org_id, p_payload);
  -- Her ticks: only of the consents the version asks, each required one on a
  -- screen she was shown given.
  if jsonb_typeof(consents) <> 'object'
    or exists (
      select 1 from jsonb_each(consents) g
       where jsonb_typeof(g.value) <> 'boolean'
          or not exists (select 1 from jsonb_array_elements(snapshot -> 'consent_placements') p
                          where p -> 'consent' ->> 'key' = g.key))
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'consent_placements') p
       where (p ->> 'required')::boolean
         and private.snapshot_screen_opens(p_profile_id, snapshot, p ->> 'screen_key', answers)
         and (consents -> (p -> 'consent' ->> 'key')) is distinct from 'true'::jsonb)
  then
    raise check_violation using message = 'every required consent must be given';
  end if;
  if is_form then
    if jsonb_typeof(signatures) <> 'object' then
      raise check_violation using message = 'signatures are sent by block';
    end if;
    -- Every signature block on a screen she was shown.
    for block in select value from jsonb_array_elements(snapshot -> 'blocks')
                  where coalesce(value ->> 'kind', 'signature') = 'signature'
                    and private.snapshot_screen_opens(p_profile_id, snapshot, value ->> 'screen_key', answers) loop
      given := signatures -> (block ->> 'id');
      if given is null or not private.form_signature_given_valid(given) then
        raise check_violation using message = 'sign with a drawing, or record that she could not draw';
      end if;
      if block -> 'settings' ->> 'system' = 'authorization_signature' then
        main_given := given;
      end if;
    end loop;
    if main_given is null then
      raise check_violation using message = 'sign with a drawing, or record that she could not draw';
    end if;
    cannot_draw := coalesce((main_given ->> 'unable_to_draw')::boolean, false);
    drawing := case when cannot_draw then null else main_given -> 'strokes' end;
  else
    if drawing is not null and (jsonb_typeof(drawing) <> 'array' or jsonb_array_length(drawing) = 0) then
      drawing := null;
    end if;
    if (drawing is null) = (not cannot_draw) then
      raise check_violation using message = 'sign with a drawing, or record that she could not draw';
    end if;
  end if;
  if drawing is not null and octet_length(drawing::text) > 200000 then
    raise check_violation using message = 'the signature is too large';
  end if;
  return jsonb_build_object('drawing', drawing, 'unable_to_draw', cannot_draw, 'is_form', is_form);
end;
$function$;

-- public.accept_current_app_terms
CREATE OR REPLACE FUNCTION public.accept_current_app_terms(p_version_id uuid, p_locale_shown text, p_signing jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  current_version public.app_terms_versions;
  drawing jsonb := nullif(p_signing -> 'signature', 'null'::jsonb);
  cannot_draw boolean;
  media boolean;
  acceptance uuid;
  is_form boolean := jsonb_typeof(p_signing) = 'object' and p_signing ? 'consents';
  given jsonb;
begin
  select * into her from public.profiles where id = caller for update;
  if her.id is null or her.role <> 'player' then
    raise insufficient_privilege using message = 'accepting the app terms again is for a player who joined';
  end if;
  -- The version she names is locked before anything is decided about it
  -- (pending fix 29): a publish or discard of that draft in flight is
  -- waited for, and what follows reads the row it committed.
  perform 1 from public.app_terms_versions where id = p_version_id for share;
  -- A test player is shown the draft when there is one (RAPP-619).
  current_version := private.app_terms_version_for(her.org_id, caller);
  if current_version.id is null or p_version_id is distinct from current_version.id then
    raise object_not_in_prerequisite_state using message = 'accept the current version';
  end if;
  if p_locale_shown is null or p_locale_shown not in ('ca', 'es', 'en', 'fr', 'ar', 'fa') then
    raise check_violation using message = 'the language shown is one of the five';
  end if;

  if is_form then
    given := p_signing || jsonb_build_object('language', p_locale_shown);
    if not private.app_terms_given_valid(given, false) then
      raise check_violation using message = 'the terms form takes her answers, consents, signatures and language';
    end if;
    insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
    values (caller, coalesce(current_version.version_number::text, 'draft'), p_locale_shown, current_version.id)
    returning id into acceptance;
    perform private.write_field_answers(caller, coalesce(nullif(given -> 'answers', 'null'::jsonb), '{}'::jsonb),
                                        'player', null, true);
    perform private.apply_document_rule(caller, true, true);
    perform private.record_app_terms_form(caller, private.app_terms_form_id(her.org_id),
                                          private.app_terms_version_snapshot(current_version), given, acceptance);
    return;
  end if;

  -- An older build shows the old content only (RAPP-772).
  if not private.app_terms_version_compatible(current_version) then
    raise feature_not_supported using message = 'APP_TERMS/UPDATE_THE_APP: these app terms need the new app';
  end if;
  -- The same signing rules as joining (complete_onboarding_signed).
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing -> 'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing -> 'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing -> 'unable_to_draw') is distinct from 'boolean'
    or length(coalesce(p_signing ->> 'device', '')) > 200
  then
    raise check_violation using message = 'explicit terms acceptance and a media choice required';
  end if;
  cannot_draw := (p_signing ->> 'unable_to_draw')::boolean;
  media := (p_signing ->> 'media_consent')::boolean;
  if (cannot_draw and drawing is not null) or (not cannot_draw and not private.app_signature_valid(drawing)) then
    raise check_violation using message = 'draw a valid signature or use the cannot-draw alternative';
  end if;

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
  values (caller, coalesce(current_version.version_number::text, 'draft'), p_locale_shown, current_version.id)
  returning id into acceptance;
  insert into public.app_terms_signatures
    (acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device)
  values (acceptance, caller, her.org_id, drawing, cannot_draw, media, nullif(p_signing ->> 'device', ''));
  perform private.record_app_terms_acceptance_consent(caller, current_version, p_locale_shown);
  -- Her photo choice, as she made it on this screen.
  update public.profiles
     set media_consent_at = case when media then coalesce(media_consent_at, now()) else null end,
         updated_at = now()
   where id = caller;
end;
$function$;

-- public.complete_custom_form
CREATE OR REPLACE FUNCTION public.complete_custom_form(p_response_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  response public.custom_form_responses;
  form public.custom_forms;
  live public.custom_form_versions;
  content jsonb;
  shown_language text;
  ticks jsonb := coalesce(nullif(payload -> 'consents', 'null'::jsonb), '{}'::jsonb);
  signatures jsonb := coalesce(nullif(payload -> 'signatures', 'null'::jsonb), '{}'::jsonb);
  block jsonb;
  given jsonb;
  block_language text;
  is_unable boolean;
  asked record;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  select * into live from private.custom_form_version_for(form.id, caller);
  if form.filled_by <> 'player' or form.is_archived or live.id is null then
    raise insufficient_privilege using message = 'this form is not asked now';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['answers', 'signatures', 'consents', 'language'] <> '{}'::jsonb
     or jsonb_typeof(ticks) <> 'object' or jsonb_typeof(signatures) <> 'object' then
    raise invalid_parameter_value
      using message = 'complete_custom_form takes her answers by field, her signatures, her consents and her language';
  end if;
  content := live.content;
  shown_language := case when payload ->> 'language' in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
                         then payload ->> 'language' else her.preferred_language end;

  perform private.write_field_answers(caller, coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb),
                                      'player', null, true);
  perform private.apply_document_rule(caller, true, true);

  -- Every required field the version asks has an answer (shown on its condition).
  if exists (
    select 1
      from jsonb_array_elements(content -> 'placements') p
      join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived
     where (p ->> 'required')::boolean
       -- Only on a screen that opens for her (RAPP-715).
       and private.content_screen_opens(caller, content, p ->> 'screen_key')
       and (f.show_when_field_id is null or exists (
             select 1 from public.profile_fields gate
              where gate.id = f.show_when_field_id
                and private.field_answer_now(caller, gate) = to_jsonb(f.show_when_option_id::text)))
       and private.field_answer_now(caller, f) is null
  ) then
    raise not_null_violation using message = 'complete_custom_form requires an answer to a required question';
  end if;

  -- Every signature block, with the text the version published. A text or
  -- points block asks nothing (RAPP-770); a version published before names
  -- no kind, and its blocks are signatures. "No puc signar" keeps the text
  -- she accepted with no strokes (RAPP-771).
  for block in select value from jsonb_array_elements(content -> 'blocks')
                where coalesce(value ->> 'kind', 'signature') = 'signature'
                  and private.content_screen_opens(caller, content, value ->> 'screen_key') loop
    given := signatures -> (block ->> 'id');
    if given is null or not private.form_signature_given_valid(given) then
      raise not_null_violation using message = 'complete_custom_form requires her signature on every signature block';
    end if;
    is_unable := coalesce((given ->> 'unable_to_draw')::boolean, false);
    block_language := case when length(btrim(coalesce(block -> 'body' ->> (given ->> 'language'), ''))) > 0
                           then given ->> 'language' else 'ca' end;
    insert into public.form_signatures (
      org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind,
      signer_user_id, signer_name, strokes, unable_to_draw, custom_form_id)
    values (
      her.org_id, caller, 'custom_form',
      (select b.id from public.form_blocks b where b.id = (block ->> 'id')::uuid),
      block ->> 'screen_key', block -> 'body' ->> block_language, block_language, 'player', caller,
      coalesce(nullif(concat_ws(' ', private.name_answer_text(caller, 'first_name'),
                                     private.name_answer_text(caller, 'last_name')), ''), '-'),
      case when is_unable then null else given -> 'strokes' end, is_unable, form.id);
  end loop;

  -- Her ticks of the consents the version asks, each recorded with the key,
  -- the text and the requiredness the version froze; a version before schema
  -- 2 records the consent's text as it is now.
  if exists (select 1 from jsonb_each(ticks) t
              where jsonb_typeof(t.value) <> 'boolean'
                 or not exists (
                   select 1 from jsonb_array_elements(content -> 'consent_placements') p
                     join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
                    where coalesce(p -> 'consent' ->> 'key', c.key) = t.key)) then
    raise check_violation using message = 'her consents are ticks of the consents the form asks';
  end if;
  for asked in
    select c.id, coalesce(p -> 'consent' ->> 'key', c.key) as key,
           coalesce(p -> 'consent' -> 'body', c.body) as body,
           (p ->> 'required')::boolean as required, p ->> 'screen_key' as screen_key
      from jsonb_array_elements(content -> 'consent_placements') p
      join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
     where private.content_screen_opens(caller, content, p ->> 'screen_key')
     order by p ->> 'screen_key', (p ->> 'sort_order')::integer
  loop
    if asked.required and (ticks -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'every required consent must be given';
    end if;
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key, custom_form_id)
    values (her.org_id, her.id, asked.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), 'app',
            shown_language, private.localized_text_in(asked.body, shown_language), asked.required,
            'custom_form', asked.screen_key, form.id);
    perform private.apply_consent_effects(her.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), her.id);
  end loop;

  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = caller, filled_by = 'player',
         version = live.version
   where id = response.id;
end;
$function$;

-- public.create_data_export
CREATE OR REPLACE FUNCTION public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_columns jsonb;
  field_columns jsonb;
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  perform private.require_recent_second_factor();
  if actor is null or actor_org is null or not (
    -- Custom answers (RAPP-307) need what the participants export needs.
    case (case when p_dataset in ('custom_answers', 'consents') then 'participants' else p_dataset end)
      when 'participants' then case
        when p_scope = 'full' then (select public.has_permission('export.participants_sensitive'))
          and (select public.has_permission('participants.view_sensitive'))
        else (select public.has_permission('export.participants'))
      end
      when 'attendance' then (select public.has_permission('export.attendance'))
      when 'events' then (select public.has_permission('export.events'))
      -- An unknown dataset falls through to the validation below for anyone
      -- who may export something, so the error names the real problem.
      else (select public.has_permission('export.participants'))
        or (select public.has_permission('export.attendance'))
        or (select public.has_permission('export.events'))
    end
  ) then
    raise insufficient_privilege using message = 'data exports require admin access';
  end if;
  if p_dataset not in ('participants', 'custom_answers', 'consents', 'attendance', 'events') then
    raise invalid_parameter_value using message = 'unsupported export dataset';
  end if;
  if p_scope not in ('default', 'full') then
    raise invalid_parameter_value using message = 'unsupported export scope';
  end if;
  if p_format not in ('csv', 'xlsx') then
    raise invalid_parameter_value using message = 'unsupported export format';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise invalid_datetime_format using message = 'invalid export period';
  end if;
  if p_scope = 'full' and not p_confirmed then
    raise invalid_parameter_value using message = 'full export requires explicit confirmation';
  end if;
  if p_scope = 'full' and length(btrim(coalesce(p_reason, ''))) < 10 then
    raise invalid_parameter_value using message = 'full export requires a reason of at least 10 characters';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise invalid_parameter_value using message = 'export reason is too long';
  end if;
  if (
    select count(*)
    from public.audit_log log
    where log.actor_id = actor
      and log.action like 'data_export.%'
      and log.created_at >= now() - interval '1 minute'
  ) >= 5 then
    raise sqlstate '42901' using message = 'export rate limit exceeded';
  end if;

  start_instant := case
    when p_start_date is null then null
    else p_start_date::timestamp at time zone 'Europe/Madrid'
  end;
  end_instant := case
    when p_end_date is null then null
    else (p_end_date + 1)::timestamp at time zone 'Europe/Madrid'
  end;

  if p_dataset = 'participants' then
    -- One column per field (RAPP-662, D9): her names and account, then every
    -- field of Dades de les jugadores in its order, by its system key or its
    -- Catalan name. The level decides: the default scope holds Normal and
    -- Personal fields, the full scope Sensitive ones too. Each value is her
    -- current answer (this season's for a seasonal field) as text, the way
    -- the custom answers export writes it.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', named.id, 'column_name', named.column_name, 'season_key', named.season_key)
             order by named.section_order, named.sort_order, named.id), '[]'::jsonb)
      into field_columns
      from (
        select f.id, s.sort_order as section_order, f.sort_order,
               case when private.field_is_seasonal(f.id)
                    then private.current_season_id(f.org_id)
                    else '00000000-0000-0000-0000-000000000000'::uuid end as season_key,
               -- Two fields with one name, or a name a fixed column has, get
               -- the start of their id so no column hides another.
               case when count(*) over (partition by coalesce(f.system_key, f.label ->> 'ca')) > 1
                      or coalesce(f.system_key, f.label ->> 'ca')
                         in ('id', 'first_name', 'last_name', 'preferred_language', 'is_active', 'created_at')
                    then coalesce(f.system_key, f.label ->> 'ca') || ' (' || left(f.id::text, 8) || ')'
                    else coalesce(f.system_key, f.label ->> 'ca') end as column_name
          from public.profile_fields f
          join public.profile_sections s on s.id = f.section_id
         where f.org_id = actor_org
           -- Her names are columns of their own (D2).
           and f.system_key is distinct from 'first_name'
           and f.system_key is distinct from 'last_name'
           and (p_scope = 'full' or f.privacy <> 'sensitive')
           -- Her health only for someone with the health permission (RAPP-698).
           and (f.read_permission is null or (select public.has_permission(f.read_permission)))
      ) named;
    export_columns := '["id","first_name","last_name","preferred_language"]'::jsonb
      || coalesce((select jsonb_agg(c -> 'column_name' order by ordinality)
                     from jsonb_array_elements(field_columns) with ordinality as listed(c, ordinality)), '[]'::jsonb)
      || '["is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', profile.id,
               'first_name', private.shown_name(profile.id, 'first_name'),
               'last_name', private.shown_name(profile.id, 'last_name'),
               'preferred_language', profile.preferred_language,
               'is_active', profile.is_active,
               'created_at', profile.created_at)
             || coalesce((
               select jsonb_object_agg(
                        c.column_name,
                        private.custom_answer_text(
                          field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)))
                 from jsonb_to_recordset(field_columns) as c(id uuid, column_name text, season_key uuid)
                 join public.profile_fields field on field.id = c.id
                 join public.custom_answers answer
                   on answer.profile_id = profile.id and answer.question_id = c.id
                  and answer.season_key = c.season_key), '{}'::jsonb)
             order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'custom_answers' then
    -- Answers to every field (RAPP-307, RAPP-662), one row per answer. The
    -- default scope holds Normal and Personal answers; Sensitive answers only
    -- the full scope, which needs participants.view_sensitive above.
    export_columns := '["participant_id","first_name","last_name","section","question","privacy","season","answer","answered_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', private.shown_name(profile.id, 'first_name'),
      'last_name', private.shown_name(profile.id, 'last_name'),
      'section', section.title ->> 'ca',
      'question', field.label ->> 'ca',
      'privacy', field.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id, section.sort_order, field.sort_order,
             season.starts_on), '[]'::jsonb)
    into export_rows
    from public.custom_answers answer
    -- Her Fitxa: every field, in the section the team reads it (RAPP-656).
    join public.profile_fields field on field.id = answer.question_id
    join public.profile_sections section on section.id = field.section_id
    join public.profiles profile on profile.id = answer.profile_id
    left join public.seasons season on season.id = answer.season_id
    where answer.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (p_scope = 'full' or field.privacy <> 'sensitive')
      and (field.read_permission is null or (select public.has_permission(field.read_permission)));
  elsif p_dataset = 'consents' then
    -- Every consent decision with the words she was shown (RAPP-614): one row
    -- per decision, signing and later changes alike. No health answer, no
    -- signature: a consent's wording is the organization's own text.
    export_columns := '["participant_id","first_name","last_name","season","version","consent_key","consent","language","required","granted","method","decided_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', private.shown_name(profile.id, 'first_name'),
      'last_name', private.shown_name(profile.id, 'last_name'),
      'season', season.name,
      'version', version.version_number,
      'consent_key', event.consent_key,
      'consent', event.wording,
      'language', event.language,
      'required', event.required,
      'granted', event.granted,
      'method', event.method,
      'decided_at', event.decided_at
    ) order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id, event.decided_at, event.id), '[]'::jsonb)
    into export_rows
    from public.consent_events event
    join public.profiles profile on profile.id = event.profile_id
    left join public.authorization_versions version on version.id = event.version_id
    left join public.seasons season on season.id = version.season_id
    where event.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (start_instant is null or event.decided_at >= start_instant)
      and (end_instant is null or event.decided_at < end_instant);
  elsif p_dataset = 'attendance' then
    export_columns := '["attendance_id","occurrence_id","event_id","category_id","player_id","first_name","last_name","status","marked_at","starts_at","ends_at","event_title_ca","event_title_es","event_title_en","event_title_fr","event_title_ar","event_title_fa","event_location","category_name_ca","category_name_es","category_name_en","category_name_fr","category_name_ar","category_name_fa"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'attendance_id', report.attendance_id,
      'occurrence_id', report.occurrence_id,
      'event_id', report.event_id,
      'category_id', report.category_id,
      'player_id', report.player_id,
      'first_name', report.first_name,
      'last_name', report.last_name,
      'status', report.status,
      'marked_at', report.marked_at,
      'starts_at', report.starts_at,
      'ends_at', report.ends_at,
      'event_title_ca', report.event_title ->> 'ca',
      'event_title_es', report.event_title ->> 'es',
      'event_title_en', report.event_title ->> 'en',
      'event_title_fr', report.event_title ->> 'fr',
      'event_title_ar', report.event_title ->> 'ar',
      'event_title_fa', report.event_title ->> 'fa',
      'event_location', report.event_location,
      'category_name_ca', report.category_name ->> 'ca',
      'category_name_es', report.category_name ->> 'es',
      'category_name_en', report.category_name ->> 'en',
      'category_name_fr', report.category_name ->> 'fr',
      'category_name_ar', report.category_name ->> 'ar',
      'category_name_fa', report.category_name ->> 'fa'
    ) order by report.starts_at, report.last_name, report.first_name, report.attendance_id), '[]'::jsonb)
    into export_rows
    from public.attendance_report_rows report
    where report.org_id = actor_org
      and not report.is_test_account
      and (start_instant is null or report.starts_at >= start_instant)
      and (end_instant is null or report.starts_at < end_instant);
  else
    export_columns := '["id","category_id","title_ca","title_es","title_en","title_fr","title_ar","title_fa","location","starts_at","ends_at","time_zone","status","signup_mode","max_participants","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'category_id', event.category_id,
      'title_ca', event.title ->> 'ca',
      'title_es', event.title ->> 'es',
      'title_en', event.title ->> 'en',
      'title_fr', event.title ->> 'fr',
      'title_ar', event.title ->> 'ar',
      'title_fa', event.title ->> 'fa',
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'time_zone', event.time_zone,
      'status', event.status,
      'signup_mode', event.signup_mode,
      'max_participants', event.max_participants,
      'created_at', event.created_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
    into export_rows
    from public.events event
    where event.org_id = actor_org
      and (start_instant is null or event.starts_at >= start_instant)
      and (end_instant is null or event.starts_at < end_instant);
  end if;

  insert into public.audit_log (id, org_id, actor_id, action, target_type, target_id, changes)
  values (
    gen_random_uuid(), actor_org, actor, 'data_export.' || p_scope, 'data_export', export_id,
    jsonb_strip_nulls(jsonb_build_object(
      'dataset', p_dataset,
      'format', p_format,
      'scope', p_scope,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'reason', case when p_scope = 'full' then btrim(p_reason) else null end,
      'row_count', jsonb_array_length(export_rows)
    ))
  );

  return jsonb_build_object(
    'version', 1,
    'export_id', export_id,
    'dataset', p_dataset,
    'scope', p_scope,
    'format', p_format,
    'generated_at', now(),
    'columns', export_columns,
    'rows', export_rows
  );
end;
$function$;

-- public.get_service_review_queue
CREATE OR REPLACE FUNCTION public.get_service_review_queue(p_kind text, p_category_id uuid, p_query text, p_page integer)
 RETURNS TABLE(item_kind text, item_id uuid, service_id uuid, category_id uuid, title jsonb, provider_name text, contact_name text, status text, changed_at timestamp with time zone, previous_service jsonb, current_service jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not (select public.has_permission('services.review')) then
    raise insufficient_privilege using message =
      'only staff may read the service review queue';
  end if;
  if p_kind not in ('all', 'pending', 'published_edit') then
    raise check_violation using message = 'invalid service review queue kind';
  end if;
  if p_page is null or p_page < 1 or p_page > 10000 then
    raise check_violation using message = 'invalid service review queue page';
  end if;

  return query
  with candidates as (
    select
      'pending'::text as item_kind,
      service.id as item_id,
      service.id as service_id,
      service.category_id,
      service.title,
      service.provider_name,
      service.contact_name,
      service.status,
      service.updated_at as changed_at,
      null::jsonb as previous_service,
      null::jsonb as current_service,
      0 as sort_priority
    from public.services as service
    where p_kind in ('all', 'pending')
      and service.org_id = (select public.current_org_id())
      and service.status = 'pending'

    union all

    select
      'published_edit'::text as item_kind,
      notification.id as item_id,
      service.id as service_id,
      service.category_id,
      service.title,
      service.provider_name,
      service.contact_name,
      service.status,
      notification.created_at as changed_at,
      notification.previous_service,
      notification.current_service,
      1 as sort_priority
    from public.service_submission_notifications as notification
    join public.services as service
      on service.org_id = notification.org_id
     and service.id = notification.service_id
    where p_kind in ('all', 'published_edit')
      and notification.org_id = (select public.current_org_id())
      and notification.kind = 'published_edit'
      and notification.read_at is null
  ), filtered as (
    select candidate.*
    from candidates as candidate
    where (p_category_id is null or candidate.category_id = p_category_id)
      and (
        btrim(coalesce(p_query, '')) = ''
        or concat_ws(
          ' ',
          candidate.title->>'ca',
          candidate.title->>'es',
          candidate.title->>'en',
          candidate.title->>'fr',
          candidate.title->>'ar',
          candidate.title->>'fa',
          candidate.provider_name,
          candidate.contact_name
        ) ilike '%' || btrim(p_query) || '%'
      )
  )
  select
    filtered.item_kind,
    filtered.item_id,
    filtered.service_id,
    filtered.category_id,
    filtered.title,
    filtered.provider_name,
    filtered.contact_name,
    filtered.status,
    filtered.changed_at,
    filtered.previous_service,
    filtered.current_service,
    count(*) over() as total_count
  from filtered
  order by filtered.sort_priority, filtered.changed_at, filtered.item_id
  limit 25
  offset (p_page - 1) * 25;
end;
$function$;

-- public.is_knowledge_body_valid
CREATE OR REPLACE FUNCTION public.is_knowledge_body_valid(content jsonb, require_all_languages boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
declare
  language text;
  blocks jsonb;
  block jsonb;
  source_type text;
begin
  if jsonb_typeof(content) <> 'object' or not (content ? 'ca') then
    return false;
  end if;

  if exists (
    select 1 from jsonb_object_keys(content) as key(language_key)
    where language_key <> all(array['ca', 'es', 'en', 'fr', 'ar', 'fa'])
  ) then
    return false;
  end if;

  if require_all_languages and not (content ?& array['ca', 'es', 'en', 'ar', 'fa']) then
    return false;
  end if;

  for language, blocks in select key, value from jsonb_each(content)
  loop
    if jsonb_typeof(blocks) <> 'array'
      or jsonb_array_length(blocks) not between 1 and 50 then
      return false;
    end if;

    for block in select value from jsonb_array_elements(blocks)
    loop
      if jsonb_typeof(block) <> 'object' or jsonb_typeof(block->'type') <> 'string' then
        return false;
      end if;

      if block->>'type' = 'paragraph' then
        if not (block ?& array['type', 'text'])
          or jsonb_typeof(block->'text') <> 'string'
          or length(btrim(block->>'text')) not between 1 and 10000 then
          return false;
        end if;
      elsif block->>'type' = 'step' then
        if not (block ?& array['type', 'title', 'text', 'imageUrl', 'imageAlt'])
          or jsonb_typeof(block->'title') <> 'string'
          or length(btrim(block->>'title')) not between 1 and 300
          or jsonb_typeof(block->'text') <> 'string'
          or length(btrim(block->>'text')) not between 1 and 10000
          or (jsonb_typeof(block->'imageUrl') not in ('string', 'null'))
          or (jsonb_typeof(block->'imageAlt') not in ('string', 'null'))
          or (
            jsonb_typeof(block->'imageUrl') = 'string'
            and length(btrim(block->>'imageUrl')) not between 1 and 2000
          )
          or (
            jsonb_typeof(block->'imageAlt') = 'string'
            and length(btrim(block->>'imageAlt')) not between 1 and 500
          )
          or (jsonb_typeof(block->'imageUrl') = 'string') <> (jsonb_typeof(block->'imageAlt') = 'string') then
          return false;
        end if;
      else
        return false;
      end if;
    end loop;
  end loop;

  if require_all_languages then
    foreach language in array array['es', 'en', 'fr', 'ar', 'fa']
    loop
      -- French is aligned when it is there; it is never required (RAPP-781).
      continue when not (content ? language);
      if jsonb_array_length(content->language) <> jsonb_array_length(content->'ca') then
        return false;
      end if;
      for block_index in 0..jsonb_array_length(content->'ca') - 1
      loop
        source_type := content->'ca'->block_index->>'type';
        if content->language->block_index->>'type' <> source_type then
          return false;
        end if;
      end loop;
    end loop;
  end if;

  return true;
exception when others then
  return false;
end;
$function$;

-- public.is_knowledge_body_valid_for_language
CREATE OR REPLACE FUNCTION public.is_knowledge_body_valid_for_language(content jsonb, source_language text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
declare
  blocks jsonb;
  block jsonb;
begin
  if source_language not in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
    or jsonb_typeof(content) <> 'object'
    or not (content ? source_language) then
    return false;
  end if;

  if exists (
    select 1 from jsonb_object_keys(content) as key(language_key)
    where language_key <> all(array['ca', 'es', 'en', 'fr', 'ar', 'fa'])
  ) then
    return false;
  end if;

  for blocks in select value from jsonb_each(content)
  loop
    if jsonb_typeof(blocks) <> 'array'
      or jsonb_array_length(blocks) not between 1 and 50 then
      return false;
    end if;

    for block in select value from jsonb_array_elements(blocks)
    loop
      if jsonb_typeof(block) <> 'object' or jsonb_typeof(block->'type') <> 'string' then
        return false;
      end if;

      if block->>'type' = 'paragraph' then
        if not (block ?& array['type', 'text'])
          or jsonb_typeof(block->'text') <> 'string'
          or length(btrim(block->>'text')) not between 1 and 10000 then
          return false;
        end if;
      elsif block->>'type' = 'step' then
        if not (block ?& array['type', 'title', 'text', 'imageUrl', 'imageAlt'])
          or jsonb_typeof(block->'title') <> 'string'
          or length(btrim(block->>'title')) not between 1 and 300
          or jsonb_typeof(block->'text') <> 'string'
          or length(btrim(block->>'text')) not between 1 and 10000
          or jsonb_typeof(block->'imageUrl') not in ('string', 'null')
          or jsonb_typeof(block->'imageAlt') not in ('string', 'null')
          or (
            jsonb_typeof(block->'imageUrl') = 'string'
            and length(btrim(block->>'imageUrl')) not between 1 and 2000
          )
          or (
            jsonb_typeof(block->'imageAlt') = 'string'
            and length(btrim(block->>'imageAlt')) not between 1 and 500
          )
          or (jsonb_typeof(block->'imageUrl') = 'string')
            <> (jsonb_typeof(block->'imageAlt') = 'string') then
          return false;
        end if;
      else
        return false;
      end if;
    end loop;
  end loop;

  return true;
exception when others then
  return false;
end;
$function$;

-- public.is_localized_content_valid
CREATE OR REPLACE FUNCTION public.is_localized_content_valid(content jsonb, maximum_length integer, require_all_languages boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select
    jsonb_typeof(content) = 'object'
    and content ? 'ca'
    and (
      not require_all_languages
      or content ?& array['ca', 'es', 'en', 'ar', 'fa']
    )
    and not exists (
      select 1
      from jsonb_each(content) as entry(language, value)
      where entry.language <> all(array['ca', 'es', 'en', 'fr', 'ar', 'fa'])
         or jsonb_typeof(entry.value) <> 'string'
         or length(btrim(entry.value #>> '{}')) not between 1 and maximum_length
    );
$function$;

-- public.is_localized_content_valid_for_language
CREATE OR REPLACE FUNCTION public.is_localized_content_valid_for_language(content jsonb, max_length integer, source_language text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select source_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
    and jsonb_typeof(content) = 'object'
    and content ? source_language
    and not exists (
      select 1
      from jsonb_object_keys(content) as key(language_key)
      where language_key <> all(array['ca', 'es', 'en', 'fr', 'ar', 'fa'])
    )
    and not exists (
      select 1
      from jsonb_each(content) as entry(language_key, localized_value)
      where jsonb_typeof(localized_value) <> 'string'
        or length(btrim(localized_value #>> '{}')) not between 1 and max_length
    );
$function$;

-- public.list_survey_responses
CREATE OR REPLACE FUNCTION public.list_survey_responses(p_survey_id uuid)
 RETURNS TABLE(id uuid, player_id uuid, player_name text, language text, answers jsonb, status text, completed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select public.has_permission('surveys.results')) then
    raise exception 'SURVEYS/STAFF_ONLY' using errcode = '42501';
  end if;
  return query
  select
    response.id,
    response.player_id,
    btrim(private.shown_name(profile.id, 'first_name') || ' ' || private.shown_name(profile.id, 'last_name')),
    case when profile.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    public.decrypt_field(response.answers_encrypted)::jsonb,
    response.status,
    response.completed_at,
    response.updated_at
  from public.survey_responses as response
  join public.profiles as profile
    on profile.org_id = response.org_id and profile.id = response.player_id
  where response.org_id = (select public.current_org_id())
    and response.survey_id = p_survey_id
    and not profile.is_test_account
  order by response.completed_at desc nulls last, response.updated_at desc, response.id;
end;
$function$;

-- public.preview_notification_audience
CREATE OR REPLACE FUNCTION public.preview_notification_audience(p_audience_kind text, p_audience_config jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(participant_id uuid, full_name text, language text, device_count integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    raise exception 'NOTIFICATIONS/INVALID_AUDIENCE' using errcode = '22023';
  end if;

  return query
  select
    profile.id,
    btrim(private.shown_name(profile.id, 'first_name') || ' ' || private.shown_name(profile.id, 'last_name')),
    case
      when profile.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
        then profile.preferred_language
      else 'ca'
    end,
    count(distinct push_token.id)::integer
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role = 'player'
    and profile.is_active
    and not (select private.is_test_player(profile.id))
    and profile.push_notifications_enabled
    and (
      p_audience_kind = 'all'
      or (
        p_audience_kind = 'interest'
        and exists (
          select 1
          from public.service_interests as interest
          join public.services as service
            on service.org_id = interest.org_id
           and service.id = interest.service_id
          where interest.org_id = profile.org_id
            and interest.user_id = profile.id
            and service.category_id = nullif(p_audience_config->>'service_category_id', '')::uuid
        )
      )
      or (
        p_audience_kind = 'signup'
        and exists (
          select 1
          from public.event_signups as signup
          where signup.org_id = profile.org_id
            and signup.player_id = profile.id
            and signup.event_id = nullif(p_audience_config->>'event_id', '')::uuid
            and signup.state in ('interested', 'confirmed')
        )
      )
      or (
        p_audience_kind = 'entity'
        -- Her entity at its field's level (RAPP-662, D9).
        and lower(private.entity_audience_text(profile.id)) =
          lower(btrim(nullif(p_audience_config->>'entity_name', '')))
      )
      or (
        p_audience_kind = 'custom_group'
        and exists (
          select 1
          from public.custom_notification_group_members as membership
          where membership.org_id = profile.org_id
            and membership.participant_id = profile.id
            and membership.group_id = nullif(p_audience_config->>'custom_group_id', '')::uuid
        )
      )
    )
  group by profile.id, private.shown_name(profile.id, 'first_name'), private.shown_name(profile.id, 'last_name'), profile.preferred_language
  order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id;
end;
$function$;

-- public.record_participant_consent
CREATE OR REPLACE FUNCTION public.record_participant_consent(p_profile_id uuid, p_consent_id uuid, p_granted boolean, p_method text, p_reason text DEFAULT NULL::text, p_language text DEFAULT NULL::text, p_decided_on date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  her public.profiles;
  consent public.consents;
  shown_language text;
  saved bigint;
begin
  if not (select public.has_permission('consents.collect'))
     or not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'recording her consent needs consents.collect';
  end if;
  select * into her from public.profiles
   where id = p_profile_id and org_id = actor_org and role = 'player' and anonymized_at is null;
  if her.id is null then
    raise no_data_found using message = 'no such player';
  end if;
  select * into consent from public.consents where id = p_consent_id and org_id = actor_org;
  if consent.id is null then
    raise no_data_found using message = 'no such consent';
  end if;
  if p_granted is null or p_method is null or p_method not in ('paper', 'staff') then
    raise invalid_parameter_value using message = 'staff record a consent on paper or as staff';
  end if;
  if not p_granted and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise check_violation using message = 'a withdrawal needs its reason';
  end if;
  if p_decided_on > current_date then
    raise check_violation using message = 'a decision is not in the future';
  end if;
  shown_language := coalesce(nullif(p_language, ''), her.preferred_language, 'ca');
  if shown_language not in ('ca', 'es', 'en', 'fr', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;

  insert into public.consent_events
    (org_id, profile_id, consent_id, consent_key, granted, method, decided_at, language, wording,
     recorded_by, reason)
  values (actor_org, her.id, consent.id, consent.key, p_granted, p_method,
          coalesce(p_decided_on::timestamptz, now()), shown_language,
          private.localized_text_in(consent.body, shown_language), actor,
          nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into saved;

  perform private.apply_consent_effects(her.id, consent.key, p_granted, actor);

  -- Which consent and how, never the reason: it is prose about her.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'consent.staff_record', 'profile', her.id,
          jsonb_build_object('consent', consent.key, 'granted', p_granted, 'method', p_method));
  return saved;
end;
$function$;

-- public.save_forum_category
CREATE OR REPLACE FUNCTION public.save_forum_category(p_category_id uuid, p_name jsonb, p_slug text, p_icon text, p_color text, p_sort_order integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  result uuid;
begin
  if not (select public.has_permission('forum.moderate'))
    or jsonb_typeof(p_name) <> 'object'
    or exists (
      select 1
      -- French is never required (RAPP-781); when given it is a real name.
      from unnest(array['ca', 'es', 'en', 'ar', 'fa']) as language(code)
      where nullif(btrim(p_name ->> language.code), '') is null
    )
    or (p_name ? 'fr' and nullif(btrim(p_name ->> 'fr'), '') is null)
  then
    raise exception 'forum category action denied or invalid'
      using errcode = 'insufficient_privilege';
  end if;

  if p_category_id is null then
    insert into public.forum_categories (org_id, name, slug, icon, color, sort_order)
    values (
      actor_org,
      p_name,
      lower(btrim(p_slug)),
      btrim(p_icon),
      btrim(p_color),
      p_sort_order
    )
    returning id into result;
    return result;
  end if;

  update public.forum_categories
  set
    name = p_name,
    slug = lower(btrim(p_slug)),
    icon = btrim(p_icon),
    color = btrim(p_color),
    sort_order = p_sort_order
  where id = p_category_id and org_id = actor_org
  returning id into result;
  if result is null then
    raise exception 'forum category not found' using errcode = 'no_data_found';
  end if;
  return result;
end;
$function$;

-- public.save_item_type
CREATE OR REPLACE FUNCTION public.save_item_type(p_id uuid, p_name jsonb, p_kind text, p_sizes text[], p_default_value_cents integer, p_code_prefix text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  current_type public.equipment_item_types%rowtype;
  clean_sizes text[];
  clean_name jsonb;
  clean_prefix text := nullif(upper(btrim(p_code_prefix)), '');
  stranded text;
  saved_id uuid;
begin
  if not (select public.has_permission('equipment.items')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_kind not in ('player_kit', 'team_equipment') then
    raise exception 'STOCK/ITEM_KIND' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(s order by ordinality), '{}') into clean_sizes
    from (
      select distinct on (btrim(size)) btrim(size) as s, ordinality
      from unnest(coalesce(p_sizes, '{}')) with ordinality as given(size, ordinality)
      where btrim(size) <> ''
      order by btrim(size), ordinality
    ) sizes;
  if cardinality(clean_sizes) > 30
     or exists (select 1 from unnest(clean_sizes) s where length(s) > 20) then
    raise exception 'STOCK/ITEM_SIZES' using errcode = 'check_violation';
  end if;
  if p_default_value_cents is not null and p_default_value_cents < 0 then
    raise exception 'STOCK/ITEM_VALUE' using errcode = 'check_violation';
  end if;
  if clean_prefix is not null and clean_prefix !~ '^[A-Z]{1,3}$' then
    raise exception 'STOCK/ITEM_CODE' using errcode = 'check_violation';
  end if;

  -- Only the languages the app knows, each a non-empty text.
  select coalesce(jsonb_object_agg(key, btrim(value)), '{}'::jsonb) into clean_name
    from jsonb_each_text(coalesce(p_name, '{}'::jsonb))
   where key in ('ca', 'es', 'en', 'fr', 'ar', 'fa') and btrim(value) <> '';

  if p_id is null then
    if not clean_name ? 'ca' then
      raise exception 'STOCK/ITEM_NAME' using errcode = 'check_violation';
    end if;
    insert into public.equipment_item_types (
      org_id, key, name, kind, sizes, default_value_cents, code_prefix, is_active, is_builtin
    ) values (
      actor_org, 'custom_' || replace(gen_random_uuid()::text, '-', ''), clean_name, p_kind,
      clean_sizes, p_default_value_cents,
      case when p_kind = 'player_kit' then clean_prefix end, coalesce(p_is_active, true), false
    )
    returning id into saved_id;
  else
    select * into current_type from public.equipment_item_types
     where id = p_id and org_id = actor_org
     for update;
    if current_type.id is null then
      raise exception 'STOCK/NO_ITEM_TYPE' using errcode = 'P0002';
    end if;

    -- A size can go only once nothing is in stock on it.
    select coalesce(m.size, '') into stranded
      from public.stock_movements m
     where m.item_type_id = current_type.id
       and not (
         (cardinality(clean_sizes) = 0 and m.size is null)
         or m.size = any (clean_sizes)
       )
     group by m.size
    having sum(m.quantity) <> 0
     limit 1;
    if stranded is not null then
      raise exception 'STOCK/SIZE_IN_STOCK: %', stranded using errcode = 'check_violation';
    end if;

    if current_type.is_builtin then
      -- The name comes from the app's translations; kind and code letters stay.
      update public.equipment_item_types
         set sizes = clean_sizes, default_value_cents = p_default_value_cents,
             is_active = coalesce(p_is_active, is_active)
       where id = current_type.id;
    else
      if not clean_name ? 'ca' then
        raise exception 'STOCK/ITEM_NAME' using errcode = 'check_violation';
      end if;
      update public.equipment_item_types
         set name = clean_name, kind = p_kind, sizes = clean_sizes,
             default_value_cents = p_default_value_cents,
             code_prefix = case when p_kind = 'player_kit' then clean_prefix end,
             is_active = coalesce(p_is_active, is_active)
       where id = current_type.id;
    end if;
    saved_id := current_type.id;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'stock.item_save', 'equipment_item_type', saved_id,
    jsonb_build_object(
      'name', clean_name, 'kind', p_kind, 'sizes', to_jsonb(clean_sizes),
      'default_value_cents', p_default_value_cents, 'code_prefix', clean_prefix,
      'is_active', p_is_active
    )
  );
  return saved_id;
end;
$function$;

-- public.schedule_mentoring_request
CREATE OR REPLACE FUNCTION public.schedule_mentoring_request(p_request_id uuid, p_scheduled_at timestamp with time zone, p_assigned_staff_id uuid, p_staff_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := public.current_org_id();
  request public.mentoring_requests%rowtype;
  normalized_notes text := nullif(btrim(p_staff_notes), '');
  notification_kind text;
  notification_id uuid;
  publication_id uuid;
begin
  if actor_org is null or not public.has_permission('mentoring.manage') then
    raise exception 'only staff may schedule mentoring'
      using errcode = 'insufficient_privilege';
  end if;

  select row.* into request
  from public.mentoring_requests as row
  where row.org_id = actor_org and row.id = p_request_id
  for update;

  if not found then
    raise no_data_found using message = 'mentoring request not found';
  end if;

  if request.status not in ('requested', 'scheduled')
    or p_scheduled_at <= now()
    or normalized_notes is not null and length(normalized_notes) > 2000
    or not exists (
      select 1 from public.profiles as staff
      where staff.org_id = actor_org
        and staff.id = p_assigned_staff_id
        and (select private.profile_has_permission(staff.id, 'mentoring.manage'))
        and staff.is_active
    )
  then
    raise check_violation using message = 'invalid mentoring schedule';
  end if;

  notification_kind := case when request.status = 'requested' then 'scheduled' else 'changed' end;

  update public.mentoring_requests
  set
    status = 'scheduled',
    scheduled_at = p_scheduled_at,
    assigned_staff_id = p_assigned_staff_id,
    staff_notes_encrypted = case
      when normalized_notes is null then null
      else public.encrypt_field(normalized_notes)
    end,
    completed_at = null
  where id = request.id;

  insert into public.mentoring_notification_events (
    org_id, request_id, recipient_id, kind
  ) values (
    request.org_id, request.id, request.player_id, notification_kind
  )
  returning id into notification_id;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    request.org_id,
    'mentoring_update',
    notification_id,
    request.player_id,
    now(),
    'processing'
  )
  returning id into publication_id;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    request.org_id,
    publication_id,
    push_token.id,
    player.id,
    case
      when player.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
        then player.preferred_language
      else 'ca'
    end,
    now()
  from public.profiles as player
  join public.push_tokens as push_token on push_token.user_id = player.id
  where player.org_id = request.org_id
    and player.id = request.player_id
    and player.role = 'player'
    and player.is_active
    and player.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.invoke_push_dispatch('mentoring_update');
end;
$function$;

-- public.set_optional_consent
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
  consent public.consents;
  last_event public.consent_events;
  onboarding public.consent_placements;
  asked record;
  in_version boolean;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player changes her consents';
  end if;
  version := private.current_authorization_version(me.org_id);
  shown_language := coalesce(nullif(p_language, ''), me.preferred_language, 'ca');
  if shown_language not in ('ca', 'es', 'en', 'fr', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  select * into consent from public.consents where org_id = me.org_id and key = p_key;
  select * into last_event from public.consent_events e
   where e.profile_id = caller and e.consent_id = consent.id
   order by e.decided_at desc, e.id desc limit 1;
  select * into onboarding from public.consent_placements p
   where p.consent_id = consent.id and p.surface = 'onboarding';
  select * into asked from private.authorization_version_consents(version) c where c.consent_key = p_key limit 1;
  in_version := asked.consent_key is not null;
  if consent.id is null or p_granted is null
    or asked.required is true
    or not (
      asked.required is false
      or (not in_version and onboarding.id is not null and not onboarding.required and not consent.is_archived)
      or (not p_granted and last_event.granted is true)
    )
  then
    raise invalid_parameter_value using message = 'only an optional consent changes here';
  end if;

  insert into public.consent_events
    (org_id, profile_id, consent_id, consent_key, granted, method, version_id, language, wording, required, form)
  values (
    me.org_id, caller, consent.id, consent.key, p_granted, 'profile',
    case when in_version then version.id else last_event.version_id end,
    case when in_version or last_event.wording is null then shown_language else last_event.language end,
    case when in_version
      then private.localized_text_in(asked.label, shown_language)
      else coalesce(last_event.wording, private.localized_text_in(consent.body, shown_language)) end,
    false,
    case when in_version then 'authorization' else last_event.form end);

  perform private.apply_consent_effects(caller, consent.key, p_granted, caller);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (me.org_id, caller, 'consent.change', 'profile', caller,
          jsonb_build_object('consent', p_key, 'granted', p_granted));
end;
$function$;

-- public.update_organization_settings
CREATE OR REPLACE FUNCTION public.update_organization_settings(p_name text, p_contact_email text, p_contact_phone text, p_logo_url text, p_primary_color text, p_secondary_color text, p_available_languages text[], p_default_language text)
 RETURNS organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  saved public.organizations;
  clean_name text := nullif(btrim(p_name), '');
  clean_primary text := upper(btrim(p_primary_color));
  clean_secondary text := upper(btrim(p_secondary_color));
  locked_language text;
begin
  if not (select public.has_permission('settings.organization'))
    and not (select public.has_permission('settings.branding'))
  then
    raise insufficient_privilege using message = 'organization settings need settings.organization or settings.branding';
  end if;
  -- Name, contact details and languages are settings.organization; the logo
  -- and colours are settings.branding. A field the caller may not change must
  -- arrive unchanged.
  if not (select public.has_permission('settings.organization')) and exists (
    select 1 from public.organizations as current_org
    where current_org.id = actor_org
      and (current_org.name is distinct from nullif(btrim(p_name), '')
        or current_org.contact_email is distinct from p_contact_email
        or current_org.contact_phone is distinct from p_contact_phone
        or current_org.available_languages is distinct from p_available_languages
        or current_org.default_language is distinct from p_default_language)
  ) then
    raise insufficient_privilege using message = 'changing the organization details needs settings.organization';
  end if;
  if not (select public.has_permission('settings.branding')) and exists (
    select 1 from public.organizations as current_org
    where current_org.id = actor_org
      and (current_org.logo_url is distinct from p_logo_url
        or upper(current_org.primary_color) is distinct from upper(btrim(p_primary_color))
        or upper(current_org.secondary_color) is distinct from upper(btrim(p_secondary_color)))
  ) then
    raise insufficient_privilege using message = 'changing the logo or colours needs settings.branding';
  end if;
  if clean_name is null or length(clean_name) > 200 then
    raise check_violation using message = 'organization name is required';
  end if;
  if clean_primary !~ '^#[0-9A-F]{6}$' or clean_secondary !~ '^#[0-9A-F]{6}$' then
    raise check_violation using message = 'brand colors must use six-digit hex values';
  end if;
  if private.hex_contrast_ratio(clean_primary, '#FFFFFF') < 4.5 then
    raise check_violation using message = 'primary color does not meet WCAG AA contrast with white text';
  end if;
  if private.hex_contrast_ratio(clean_secondary, '#0F172A') < 4.5 then
    raise check_violation using message = 'secondary color does not meet WCAG AA contrast with dark text';
  end if;
  if cardinality(p_available_languages) = 0
    or not (p_available_languages <@ array['ca', 'es', 'en', 'fr', 'ar', 'fa']::text[])
    or not (p_default_language = any(p_available_languages))
  then
    raise check_violation using message = 'default language must be enabled and all languages must be supported';
  end if;

  select organization.locked_default_language into locked_language
  from public.organizations as organization
  where organization.id = actor_org
  for update;

  if locked_language is not null
    and (p_default_language <> locked_language or not (locked_language = any(p_available_languages)))
  then
    raise check_violation using message = 'Catalan must remain enabled and default for the Ramassa organization';
  end if;

  update public.organizations
  set
    name = clean_name,
    contact_email = nullif(btrim(p_contact_email), ''),
    contact_phone = nullif(btrim(p_contact_phone), ''),
    logo_url = nullif(btrim(p_logo_url), ''),
    primary_color = clean_primary,
    secondary_color = clean_secondary,
    available_languages = array(
      select entry.language
      from unnest(p_available_languages) with ordinality as entry(language, position)
      group by entry.language
      order by min(entry.position)
    ),
    default_language = p_default_language
  where id = actor_org
  returning * into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    (select auth.uid()),
    'organization.settings_update',
    'organization',
    actor_org,
    jsonb_build_object(
      'primary_color', clean_primary,
      'secondary_color', clean_secondary,
      'available_languages', p_available_languages,
      'default_language', p_default_language,
      'has_logo', p_logo_url is not null
    )
  );

  return saved;
end;
$function$;

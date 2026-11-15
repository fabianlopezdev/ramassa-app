-- The walk-in tablet signs the Onboarding signature blocks (RAPP-691).
--
-- WHY
--
-- Fabián, 2026-10-26: a woman who signs the season authorization on a staff
-- tablet signs the Onboarding signature blocks there too. She has no profile
-- yet, so her signatures wait with the walk-in, and move to her profile when
-- the team confirms or merges her. On her phone later she signs only a block
-- whose text changed since.
--
-- WHAT CHANGES
--
--   1. `form_signatures` says where it was signed: `signed_on_tablet` and
--      `witnessed_by`, the team member present.
--   2. `public.walk_in_form_signatures`: one pending signature per block of a
--      walk-in. `submit_walk_in_signing` takes `p_block_signatures`
--      (`{block: {strokes, language}}`, default none, so an older tablet still
--      sends) and keeps them with the text as shown. A block of no live
--      Onboarding screen is passed over.
--   3. `private.resolve_walk_in` (confirm and merge) moves them into
--      `form_signatures` on her profile: signed by her, her name, surface
--      `wizard`, the original time, on the tablet, with the team member
--      present. Discarding a walk-in deletes them; the 60-day purge takes them
--      with the walk-in.
--   4. A block counts as signed while one of her signatures holds its text
--      exactly as the block now says it in the language she read it
--      (`private.unsigned_form_blocks`). A changed text asks for a new
--      signature. `my_form_signatures` gives her phone the same reading.
--   5. Her page reads where each signature was given and who was present.
--
-- The season authorization signing itself is not changed.

-- 1. Where a signature was given ------------------------------------------------------------------------

alter table public.form_signatures
  add column signed_on_tablet boolean not null default false,
  add column witnessed_by uuid references public.profiles (id) on delete set null;

-- 2. Pending signatures of a walk-in ----------------------------------------------------------------------

create table public.walk_in_form_signatures (
  id uuid primary key default gen_random_uuid(),
  walk_in_id uuid not null references public.walk_in_signings (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  block_id uuid references public.form_blocks (id) on delete set null,
  screen_key text,
  body text not null check (length(btrim(body)) > 0),
  language text not null check (language in ('ca', 'es', 'en', 'ar', 'fa')),
  strokes jsonb not null check (private.app_signature_valid(strokes)),
  signed_at timestamptz not null,
  witnessed_by uuid references public.profiles (id) on delete set null,
  constraint walk_in_form_signatures_one_per_block unique (walk_in_id, block_id)
);
create index walk_in_form_signatures_org_idx on public.walk_in_form_signatures (org_id);
create index walk_in_form_signatures_block_idx on public.walk_in_form_signatures (block_id);
comment on table public.walk_in_form_signatures is
  'A walk-in''s signatures of the Onboarding blocks (RAPP-691), until staff confirm or merge her.';
alter table public.walk_in_form_signatures enable row level security;
alter table public.walk_in_form_signatures force row level security;
-- Only the walk-in functions read and write them.
revoke all on public.walk_in_form_signatures from anon, authenticated;

-- The Onboarding blocks of the live screens: an app screen, or a Ramassà screen not archived.
create or replace function private.live_onboarding_blocks(p_org_id uuid)
returns setof public.form_blocks
language sql
stable
security definer
set search_path = ''
as $$
  select b.* from public.form_blocks b
   where b.org_id = p_org_id and b.surface = 'onboarding'
     and (not private.is_uuid_text(b.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = b.screen_key::uuid and s.org_id = b.org_id and not s.is_archived));
$$;
revoke all on function private.live_onboarding_blocks(uuid) from public, anon, authenticated;

-- The shape check of the tablet's block signatures: `{block: {strokes, language}}`.
create or replace function private.check_walk_in_block_signatures(p_org_id uuid, p_signatures jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  entry record;
begin
  if p_signatures is null or p_signatures = 'null'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_signatures) <> 'object' then
    raise check_violation using message = 'signatures are sent by block';
  end if;
  for entry in select key, value from jsonb_each(p_signatures) loop
    if not private.is_uuid_text(entry.key) or jsonb_typeof(entry.value) <> 'object'
       or entry.value - array['strokes', 'language'] <> '{}'::jsonb
       or not private.app_signature_valid(entry.value -> 'strokes')
       or coalesce(entry.value ->> 'language', '') not in ('ca', 'es', 'en', 'ar', 'fa') then
      raise check_violation using message = 'a signature is its strokes and the language it was shown in';
    end if;
  end loop;
end;
$$;
revoke all on function private.check_walk_in_block_signatures(uuid, jsonb) from public, anon, authenticated;

-- Each signed block of a live screen with its text as shown (Catalan when the
-- language has none), as `private.save_form_signatures` keeps it.
create or replace function private.walk_in_blocks_shown(p_org_id uuid, p_signatures jsonb)
returns table (block_id uuid, screen_key text, body text, language text, strokes jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.screen_key, b.body ->> shown.language, shown.language, entry.value -> 'strokes'
    from jsonb_each(coalesce(nullif(p_signatures, 'null'::jsonb), '{}'::jsonb)) entry
    join private.live_onboarding_blocks(p_org_id) b on b.id::text = entry.key
   cross join lateral (
     select case when length(btrim(coalesce(b.body ->> (entry.value ->> 'language'), ''))) > 0
                 then entry.value ->> 'language' else 'ca' end as language) shown;
$$;
revoke all on function private.walk_in_blocks_shown(uuid, jsonb) from public, anon, authenticated;

drop function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz);
create function public.submit_walk_in_signing(p_id uuid, p_first_name text, p_last_name text, p_version_id uuid, p_payload jsonb, p_signed_at timestamp with time zone, p_block_signatures jsonb default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  version public.authorization_versions;
begin
  if not (select public.has_permission('consents.collect')) then
    raise insufficient_privilege using message = 'collecting signatures needs consents.collect';
  end if;
  if exists (select 1 from public.walk_in_signings where id = p_id) then
    return p_id;
  end if;
  select * into version from public.authorization_versions v
   where v.id = p_version_id and v.org_id = actor_org and v.published_at is not null
     and v.season_id = private.current_season_id(actor_org);
  if version.id is null then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  if nullif(private.name_trim(p_first_name), '') is null or nullif(private.name_trim(p_last_name), '') is null then
    raise check_violation using message = 'a walk-in needs her first and last name';
  end if;
  if p_signed_at is null or p_signed_at > now() + interval '10 minutes'
    or p_signed_at < now() - interval '60 days'
  then
    raise check_violation using message = 'the signing time is outside the allowed window';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);
  -- Her Onboarding signature blocks (RAPP-691), checked before anything is kept.
  perform private.check_walk_in_block_signatures(actor_org, p_block_signatures);

  insert into public.walk_in_signings
    (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
  values (p_id, actor_org, private.name_trim(p_first_name), private.name_trim(p_last_name), p_version_id,
          public.encrypt_field(p_payload::text), p_signed_at, actor)
  on conflict (id) do nothing;
  -- They wait with the walk-in until the team confirms or merges her: the text
  -- as shown, its language, the strokes, the time and the team member present.
  insert into public.walk_in_form_signatures (
    walk_in_id, org_id, block_id, screen_key, body, language, strokes, signed_at, witnessed_by)
  select p_id, actor_org, shown.block_id, shown.screen_key, shown.body, shown.language, shown.strokes,
         p_signed_at, actor
    from private.walk_in_blocks_shown(actor_org, p_block_signatures) shown;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'walk_in.submit', 'walk_in_signing', p_id, '{}'::jsonb);
  return p_id;
end;
$function$;
revoke all on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz, jsonb) from public, anon;
grant execute on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz, jsonb) to authenticated;

-- 3. Confirm and merge move them to her profile; discard drops them ---------------------------------

create or replace function private.resolve_walk_in(p_walk_in public.walk_in_signings, p_profile_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_signature(
    p_walk_in.id, p_profile_id, p_walk_in.version_id,
    public.decrypt_field(p_walk_in.payload)::jsonb, 'staff_device', p_walk_in.collected_by,
    p_walk_in.signed_at);
  -- Her Onboarding blocks signed on the tablet (RAPP-691): hers, at the time
  -- she signed, with the team member who was present.
  insert into public.form_signatures (
    org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind, signer_user_id,
    signer_name, strokes, signed_at, signed_on_tablet, witnessed_by)
  select p_walk_in.org_id, p_profile_id, 'wizard', w.block_id, w.screen_key, w.body, w.language, 'player',
         p_profile_id, concat_ws(' ', p_walk_in.first_name, p_walk_in.last_name), w.strokes, w.signed_at,
         true, w.witnessed_by
    from public.walk_in_form_signatures w
   where w.walk_in_id = p_walk_in.id;
  delete from public.walk_in_form_signatures where walk_in_id = p_walk_in.id;
  update public.walk_in_signings
     set status = p_status, payload = null, resolved_profile_id = p_profile_id,
         resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_walk_in.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (p_walk_in.org_id, (select auth.uid()), 'walk_in.' || p_status, 'walk_in_signing', p_walk_in.id,
          jsonb_build_object('profile_id', p_profile_id));
end;
$$;

create or replace function public.discard_walk_in(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'discarding a walk-in needs participants.invite';
  end if;
  update public.walk_in_signings
     set status = 'discarded', payload = null, resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_id and org_id = (select public.current_org_id()) and status = 'pending';
  if not found then
    raise insufficient_privilege using message = 'no pending walk-in of this organization';
  end if;
  -- Her block signatures go with the discarded signing (RAPP-691).
  delete from public.walk_in_form_signatures where walk_in_id = p_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values ((select public.current_org_id()), (select auth.uid()), 'walk_in.discarded',
          'walk_in_signing', p_id, '{}'::jsonb);
end;
$$;

-- 4. A block is signed while her signature holds its current text ---------------------------------------

create or replace function private.unsigned_form_blocks(
  p_org_id uuid, p_surface text, p_profile_id uuid, p_referral_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id order by b.screen_key, b.sort_order), array[]::uuid[])
    from public.form_blocks b
   where b.org_id = p_org_id
     and b.surface = case p_surface when 'wizard' then 'onboarding' else 'entity_form' end
     and (b.surface <> 'onboarding'
          or not private.is_uuid_text(b.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = b.screen_key::uuid and s.org_id = b.org_id and not s.is_archived))
     and not exists (
       select 1 from public.form_signatures g
        where g.block_id = b.id
          -- The text she signed is still the block's text in the language she read (RAPP-691).
          and g.body = b.body ->> g.language
          and case p_surface when 'wizard' then g.profile_id = p_profile_id
                             else g.referral_id = p_referral_id end);
$$;
revoke all on function private.unsigned_form_blocks(uuid, text, uuid, uuid) from public, anon, authenticated;

-- Her own signatures of the Onboarding blocks, for her phone: which block, the
-- text as she signed it and its language.
create or replace function public.my_form_signatures()
returns table (block_id uuid, body text, language text, signed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.block_id, g.body, g.language, g.signed_at
    from public.form_signatures g
   where g.profile_id = (select auth.uid()) and g.surface = 'wizard' and g.block_id is not null
   order by g.signed_at;
$$;
revoke all on function public.my_form_signatures() from public, anon;
grant execute on function public.my_form_signatures() to authenticated;

-- 5. Her page reads where each signature was given ------------------------------------------------------

drop function public.participant_form_signatures(uuid);
create function public.participant_form_signatures(p_profile_id uuid)
returns table (id uuid, surface text, block_id uuid, screen_key text, body text, language text,
               signer_kind text, signer_name text, strokes jsonb, signed_at timestamptz,
               signed_on_tablet boolean, witnessed_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her signatures need participants.view_personal';
  end if;
  return query
  select g.id, g.surface, g.block_id, g.screen_key, g.body, g.language, g.signer_kind, g.signer_name,
         g.strokes, g.signed_at, g.signed_on_tablet,
         (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = g.witnessed_by)
    from public.form_signatures g
   where g.org_id = actor_org
     and (g.profile_id = p_profile_id
          or g.referral_id in (select r.id from public.entity_referrals r
                                where r.referred_profile_id = p_profile_id))
   order by g.signed_at, g.id;
end;
$$;
revoke all on function public.participant_form_signatures(uuid) from public, anon;
grant execute on function public.participant_form_signatures(uuid) to authenticated;

-- The erasure registry names the pending signatures.
create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The signature blocks of the forms and the text each asks to accept.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_form_signatures', null, 'retain_limited', 'A walk-in''s signatures of the Onboarding blocks until staff confirm her; moved to her profile then, or purged with the walk-in.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

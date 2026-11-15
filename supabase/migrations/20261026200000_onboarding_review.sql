-- RAPP-697: a Nova versió of an Onboarding screen asks players who finished
-- Onboarding to go through that screen again before using the app.
--
-- WHY
--
-- RAPP-696 gave every form a Desa dialog: Correcció or Nova versió. On
-- Onboarding, Nova versió was disabled, because nothing asked a player who had
-- already finished. This migration builds that.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `public.onboarding_screen_versions`: one row per screen saved as a Nova
--      versió, with when. The key is the screen as a placement names it: an
--      app screen's name (`logistics`) or a Ramassà screen's id.
--   2. `profiles.onboarding_current_at`: when her Onboarding was last up to
--      date. Set when she becomes a player (she finished it), and again when
--      she finishes a review. Players who joined before this migration take
--      the day they accepted the terms, or the day the profile was made.
--   3. `mark_onboarding_screen_changed(screen)`: Desa's Nova versió, for the
--      people who design the onboarding.
--   4. `my_onboarding_review()`: her screens saved as a Nova versió after her
--      Onboarding was up to date. A Ramassà screen archived since is left out;
--      her phone also skips a screen staff hid.
--   5. `complete_onboarding_review(payload)`: her answers by field and her
--      signatures of the blocks, through the same writers as Onboarding. Every
--      required field and every signature block on her pending screens must be
--      answered and signed (a block whose text changed since she signed it
--      asks again). Then her Onboarding is up to date.
--   6. `participant_onboarding_review_pending(profile)`: whether she still has
--      screens to review, for her page in the Control Center.
--   7. The erasure registry lists the new table: it holds no participant data.
--
-- A player who finishes Onboarding after a Nova versió is not asked again:
-- her Onboarding is up to date from the moment she becomes a player.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (RLS on every new table; security definer functions with an empty search
-- path, permission checks inside) and
-- https://www.postgresql.org/docs/current/plpgsql-trigger.html (a BEFORE row
-- trigger that fills a column).

-- 1. The screens saved as a Nova versió ------------------------------------------------------------------

create table public.onboarding_screen_versions (
  org_id uuid not null references public.organizations (id) on delete cascade,
  screen_key text not null check (
    private.is_uuid_text(screen_key) or screen_key ~ '^[a-z][a-z-]{0,39}$'),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  primary key (org_id, screen_key)
);
comment on table public.onboarding_screen_versions is
  'Onboarding screens saved as a Nova versió (RAPP-697): players whose Onboarding was up to date before changed_at go through the screen again.';

alter table public.onboarding_screen_versions enable row level security;
alter table public.onboarding_screen_versions force row level security;
-- Written only through the functions below; the people who design the
-- onboarding read their organization's.
revoke all on public.onboarding_screen_versions from anon, authenticated;
grant select on public.onboarding_screen_versions to authenticated;
create policy onboarding_screen_versions_read on public.onboarding_screen_versions
  for select to authenticated
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('settings.organization'))
              or (select public.has_permission('onboarding.design'))));

-- 2. When her Onboarding was last up to date -------------------------------------------------------------

alter table public.profiles add column onboarding_current_at timestamptz;
comment on column public.profiles.onboarding_current_at is
  'When her Onboarding was last up to date (RAPP-697): when she became a player, or finished a review of the screens saved as a Nova versió.';

update public.profiles
   set onboarding_current_at = coalesce(terms_accepted_at, created_at)
 where role = 'player' and onboarding_current_at is null;

create or replace function private.onboarding_current_on_joining()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'player'
     and (tg_op = 'INSERT' or old.role is distinct from 'player')
     and new.onboarding_current_at is null then
    new.onboarding_current_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.onboarding_current_on_joining() from public, anon, authenticated;

create trigger profiles_onboarding_current_on_joining
  before insert or update of role on public.profiles
  for each row execute function private.onboarding_current_on_joining();

-- 3. Desa's Nova versió ------------------------------------------------------------------------------------

create or replace function public.mark_onboarding_screen_changed(p_screen_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the onboarding needs settings.organization or onboarding.design';
  end if;
  if p_screen_key is null
     or not (private.is_uuid_text(p_screen_key) or p_screen_key ~ '^[a-z][a-z-]{0,39}$') then
    raise invalid_parameter_value using message = 'an app screen name or a Ramassà screen id';
  end if;
  if private.is_uuid_text(p_screen_key) and not exists (
    select 1 from public.intake_screens s
     where s.id = p_screen_key::uuid and s.org_id = actor_org and not s.is_archived
  ) then
    raise no_data_found using message = 'no such screen';
  end if;
  insert into public.onboarding_screen_versions (org_id, screen_key, changed_at, changed_by)
  values (actor_org, p_screen_key, now(), actor)
  on conflict (org_id, screen_key) do update
    set changed_at = excluded.changed_at, changed_by = excluded.changed_by;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.new_version', 'organization', actor_org,
          jsonb_build_object('screen_key', p_screen_key,
                             'players_asked_again', (select count(*) from public.profiles p
                                                     where p.org_id = actor_org and p.role = 'player'
                                                       and not p.is_test_account)));
end;
$$;
revoke all on function public.mark_onboarding_screen_changed(text) from public, anon;
grant execute on function public.mark_onboarding_screen_changed(text) to authenticated;

-- 4. Her screens to review ---------------------------------------------------------------------------------

create or replace function private.onboarding_review_screens(p_profile_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(v.screen_key order by v.changed_at, v.screen_key), array[]::text[])
    from public.profiles p
    join public.onboarding_screen_versions v on v.org_id = p.org_id
   where p.id = p_profile_id
     and p.role = 'player'
     and v.changed_at > coalesce(p.onboarding_current_at, '-infinity'::timestamptz)
     -- A Ramassà screen archived since asks nothing.
     and (not private.is_uuid_text(v.screen_key) or exists (
           select 1 from public.intake_screens s
            where s.id = v.screen_key::uuid and s.org_id = p.org_id and not s.is_archived));
$$;
revoke all on function private.onboarding_review_screens(uuid) from public, anon, authenticated;

create or replace function public.my_onboarding_review()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.onboarding_review_screens((select auth.uid()));
$$;
revoke all on function public.my_onboarding_review() from public, anon;
grant execute on function public.my_onboarding_review() to authenticated;

-- 5. She finishes her review ----------------------------------------------------------------------------------

create or replace function public.complete_onboarding_review(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  pending text[];
  answers jsonb := coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb);
  first_name_value text := nullif(private.name_trim(payload ->> 'first_name'), '');
  last_name_value text := nullif(private.name_trim(payload ->> 'last_name'), '');
  missing uuid[];
begin
  select * into her from public.profiles where id = caller for update;
  if her.id is null or her.role <> 'player' then
    raise insufficient_privilege using message = 'reviewing the onboarding is for a player who joined';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['first_name', 'last_name', 'answers', 'signatures'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'complete_onboarding_review takes her names, her answers by field and her signatures';
  end if;
  pending := private.onboarding_review_screens(caller);

  -- Her names, when the review asked them; one left empty keeps what is stored.
  if first_name_value is not null or last_name_value is not null then
    update public.profiles
       set first_name = coalesce(first_name_value, first_name),
           last_name = coalesce(last_name_value, last_name),
           updated_at = now()
     where id = caller;
  end if;
  -- Her answers by field, through the Onboarding writer.
  perform private.write_field_answers(caller, answers, 'player', null, true);
  perform private.apply_document_rule(caller, true, true);
  perform private.save_form_signatures(
    her.org_id, 'wizard', caller, null, caller,
    concat_ws(' ', private.name_answer_text(caller, 'first_name'), private.name_answer_text(caller, 'last_name')),
    payload -> 'signatures');

  -- Every required field on a screen she reviews has an answer.
  select coalesce(array_agg(m.id), array[]::uuid[]) into missing
    from unnest(private.missing_required_custom_answers(caller, 'wizard')) m(id)
   where exists (select 1 from public.field_placements pl
                  where pl.field_id = m.id and pl.surface = 'onboarding'
                    and pl.screen_key = any (pending));
  if cardinality(missing) > 0 then
    raise not_null_violation using message = 'complete_onboarding_review requires an answer to a required question';
  end if;
  -- Every signature block on a screen she reviews is signed as it reads now.
  if exists (
    select 1 from public.form_blocks b
     where b.org_id = her.org_id and b.surface = 'onboarding'
       and b.screen_key = any (pending)
       and not exists (
         select 1 from public.form_signatures g
          where g.block_id = b.id and g.profile_id = caller
            and g.body = b.body ->> g.language)
  ) then
    raise not_null_violation using message = 'complete_onboarding_review requires her signature on every signature block';
  end if;

  update public.profiles set onboarding_current_at = now(), updated_at = now() where id = caller;
end;
$$;
revoke all on function public.complete_onboarding_review(jsonb) from public, anon;
grant execute on function public.complete_onboarding_review(jsonb) to authenticated;

-- 6. Her page says so ------------------------------------------------------------------------------------------

create or replace function public.participant_onboarding_review_pending(p_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her onboarding needs participants.view_personal';
  end if;
  return cardinality(private.onboarding_review_screens(p_profile_id)) > 0;
end;
$$;
revoke all on function public.participant_onboarding_review_pending(uuid) from public, anon;
grant execute on function public.participant_onboarding_review_pending(uuid) to authenticated;

-- 7. The erasure registry knows the new table ------------------------------------------------------------------

-- The body of `20261026140000_walk_in_tablet_signs_the_onboarding_blocks.sql`,
-- with `onboarding_screen_versions`: it holds no participant data.
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
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.'),
    ('onboarding_screen_versions', null, 'not_personal', 'Which Onboarding screens were saved as a new version, and when.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;


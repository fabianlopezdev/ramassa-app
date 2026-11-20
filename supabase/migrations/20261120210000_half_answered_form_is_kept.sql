-- A half-answered form is kept, so its card says "Continua" (RAPP-886).
--
-- Until now her answers to a form lived only on the screen (RAPP-825): leaving
-- half way lost them, and a form had no started state. From here on the form
-- keeps her answers so far on the server, one row per ask, so they survive a
-- closed app, a reinstall and another phone, as a started survey's do.
--
-- Her answers so far are encrypted whole with the field key (`encrypt_field`),
-- the way a survey response is: an unsent answer to a Sensitive field is never
-- stored in plain text, and neither is any other. Only she reads them, through
-- the functions below; the team has no policy on the table and its lists,
-- counts and exports keep reading `custom_form_responses`, where the ask stays
-- pending until she sends it. Her signatures and consent ticks are not kept:
-- she gives them when she sends the form.
--
-- What happens to her answers so far:
--   - She sends the form, or the team answers it for her: removed.
--   - She deletes it ("Esborra"): removed.
--   - She puts it off ("Ara no"): kept, so it continues from her later list.
--   - The team withdraws it (archived), or makes it a form the team fills:
--     removed. Restoring it later starts the form again.
--   - The team publishes a new version: kept. Only answers to fields the form
--     still asks are read back or saved again, and a screen no longer on the
--     form starts her at the first one.
--   - The ask is deleted, or her account is erased: removed with it (cascade).

-- 1. The record ---------------------------------------------------------------------------------------------

create table public.custom_form_progress (
  response_id uuid primary key references public.custom_form_responses (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  screen_id uuid,
  answers_encrypted bytea not null,
  saved_at timestamptz not null default now()
);

comment on table public.custom_form_progress is
  'Her answers so far to a form she left half way, and the screen she was on (RAPP-886). Encrypted whole; only she reads it.';
comment on column public.custom_form_progress.screen_id is
  'The screen she was on when she left; null when she was on the first one.';
comment on column public.custom_form_progress.answers_encrypted is
  'Her answers so far by field id, as JSON encrypted with encrypt_field. Only the answers that differ from her record.';

create index custom_form_progress_profile_idx on public.custom_form_progress (profile_id);
create index custom_form_progress_org_idx on public.custom_form_progress (org_id);

alter table public.custom_form_progress enable row level security;
alter table public.custom_form_progress force row level security;

create policy custom_form_progress_select_self
  on public.custom_form_progress for select to authenticated
  using (profile_id = (select auth.uid()));

-- Rows are written only by `save_custom_form_progress`, never by a direct insert.
revoke all on table public.custom_form_progress from public, anon, authenticated;
grant select on table public.custom_form_progress to authenticated;

-- 2. The fields a form asks ---------------------------------------------------------------------------------

-- The fields placed on the form now (what her phone walks) and on the version
-- she is asked, archived fields left out. Her answers so far are kept for
-- these fields only.
create function private.custom_form_progress_fields(p_form_id uuid, p_profile_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct f.id), '{}'::uuid[])
    from (
      select (p ->> 'field_id')::uuid as field_id
        from private.custom_form_version_for(p_form_id, p_profile_id) v
       cross join lateral jsonb_array_elements(coalesce(v.content -> 'placements', '[]'::jsonb)) p
      union
      select fp.field_id
        from public.field_placements fp
        join public.custom_form_screens s
          on s.id::text = fp.screen_key and s.form_id = p_form_id and not s.is_archived
       where fp.surface = 'custom_form'
    ) asked
    join public.profile_fields f on f.id = asked.field_id and not f.is_archived;
$$;

comment on function private.custom_form_progress_fields(uuid, uuid) is
  'The fields a form asks her, now or in the version she is asked (RAPP-886). Her answers so far are kept for these only.';

-- 3. Saving and reading her answers so far ------------------------------------------------------------------

-- Her own open ask of a form she fills, the same rules as answering it. An
-- empty set of answers on the first screen leaves nothing to keep, so the row
-- goes and the form is new again.
create function public.save_custom_form_progress(p_response_id uuid, p_answers jsonb, p_screen_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  response public.custom_form_responses;
  form public.custom_forms;
  asked uuid[];
  kept jsonb;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is kept by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  if form.filled_by <> 'player' or form.is_archived
     or not exists (select 1 from private.custom_form_version_for(form.id, caller)) then
    raise insufficient_privilege using message = 'this form is not asked now';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise invalid_parameter_value using message = 'save_custom_form_progress takes her answers by field';
  end if;
  if octet_length(p_answers::text) > 65536 then
    raise check_violation using message = 'her answers so far are too long to keep';
  end if;
  asked := private.custom_form_progress_fields(form.id, caller);
  if exists (select 1 from jsonb_object_keys(p_answers) k
              where k !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                 or not (k::uuid = any (asked))) then
    raise check_violation using message = 'her answers so far answer the fields the form asks';
  end if;
  if p_screen_id is not null and not exists (
    select 1 from public.custom_form_screens s
     where s.id = p_screen_id and s.form_id = form.id and not s.is_archived) then
    raise check_violation using message = 'the screen she is on is a screen of the form';
  end if;
  kept := jsonb_strip_nulls(p_answers);
  if kept = '{}'::jsonb and p_screen_id is null then
    delete from public.custom_form_progress where response_id = response.id;
    return;
  end if;
  insert into public.custom_form_progress (response_id, org_id, profile_id, screen_id, answers_encrypted)
  values (response.id, response.org_id, caller, p_screen_id, public.encrypt_field(kept::text))
  on conflict (response_id) do update
    set screen_id = excluded.screen_id,
        answers_encrypted = excluded.answers_encrypted,
        saved_at = now();
end;
$$;

comment on function public.save_custom_form_progress(uuid, jsonb, uuid) is
  'Keeps her answers so far to her own open form and the screen she is on (RAPP-886). Empty answers on the first screen remove them.';

-- Her answers so far to one of her open forms, decrypted for her alone; null
-- when she has none. Only answers to fields the form still asks come back,
-- and the screen only while it is still on the form.
create function public.my_custom_form_progress(p_response_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'screen_id',
           case when exists (select 1 from public.custom_form_screens s
                              where s.id = g.screen_id and s.form_id = r.form_id
                                and not s.is_archived and not s.is_hidden)
                then g.screen_id end,
           'answers',
           coalesce((select jsonb_object_agg(e.key, e.value)
                       from jsonb_each(public.decrypt_field(g.answers_encrypted)::jsonb) e
                      where e.key::uuid = any (private.custom_form_progress_fields(r.form_id, r.profile_id))),
                    '{}'::jsonb),
           'saved_at', g.saved_at)
    from public.custom_form_progress g
    join public.custom_form_responses r on r.id = g.response_id
    join public.custom_forms f on f.id = r.form_id
   where g.response_id = p_response_id
     and g.profile_id = (select auth.uid())
     and r.profile_id = (select auth.uid())
     and r.status = 'pending'
     and f.filled_by = 'player'
     and not f.is_archived;
$$;

comment on function public.my_custom_form_progress(uuid) is
  'Her answers so far to her own open form and the screen she left it on (RAPP-886); null when she has none.';

-- Her open asks that she started, for the Continua mark. `my_custom_forms`
-- stays as it was, so a build from before this change reads it unchanged.
create function public.my_started_custom_forms()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id), '{}'::uuid[])
    from public.custom_form_progress g
    join public.custom_form_responses r on r.id = g.response_id
    join public.custom_forms f on f.id = r.form_id
   where g.profile_id = (select auth.uid())
     and r.profile_id = (select auth.uid())
     and r.status = 'pending'
     and f.filled_by = 'player'
     and not f.is_archived;
$$;

comment on function public.my_started_custom_forms() is
  'The ids of her open form asks that she started and left half way (RAPP-886).';

revoke all on function private.custom_form_progress_fields(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_custom_form_progress(uuid, jsonb, uuid) from public, anon;
revoke all on function public.my_custom_form_progress(uuid) from public, anon;
revoke all on function public.my_started_custom_forms() from public, anon;
grant execute on function public.save_custom_form_progress(uuid, jsonb, uuid) to authenticated;
grant execute on function public.my_custom_form_progress(uuid) to authenticated;
grant execute on function public.my_started_custom_forms() to authenticated;

-- 4. When her answers so far go -----------------------------------------------------------------------------

-- The ask is answered (by her or by the team) or deleted by her.
create function private.custom_form_progress_ends_with_the_ask()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.custom_form_progress where response_id = new.id;
  return new;
end;
$$;

create trigger custom_form_responses_progress_ends
  after update of status on public.custom_form_responses
  for each row
  when (new.status <> 'pending')
  execute function private.custom_form_progress_ends_with_the_ask();

-- The team withdraws the form, or makes it one the team fills.
create function private.custom_form_progress_ends_with_the_form()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.custom_form_progress g
   using public.custom_form_responses r
   where r.id = g.response_id and r.form_id = new.id;
  return new;
end;
$$;

create trigger custom_forms_progress_ends
  after update of is_archived, filled_by on public.custom_forms
  for each row
  when (new.is_archived or new.filled_by <> 'player')
  execute function private.custom_form_progress_ends_with_the_form();

revoke all on function private.custom_form_progress_ends_with_the_ask() from public, anon, authenticated;
revoke all on function private.custom_form_progress_ends_with_the_form() from public, anon, authenticated;

-- 5. What happens to these rows when she asks to be erased -------------------------------------------------

-- The body of `20261120120000_tab_news.sql`, plus the new table.
CREATE OR REPLACE FUNCTION public.personal_data_disposition()
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
    ('consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew, with the text she was shown. Anonymizing keeps them as proof without her name and clears a staff reason; deleting her account deletes them.'),
    ('consents', null, 'not_personal', 'The consents of the organization, defined once (Dades legals).'),
    ('consent_placements', null, 'not_personal', 'Where each consent is asked.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The blocks of the forms: a signature with the text it asks to accept, a text, a list of points.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_consents', null, 'retain_limited', 'A walk-in''s ticks of the Onboarding consents on the tablet until staff confirm her; moved to her consent history then, or purged with the walk-in.'),
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
    ('custom_forms', null, 'not_personal', 'Forms the team created: their names and choices.'),
    ('custom_form_screens', null, 'not_personal', 'The screens of the forms the team created.'),
    ('custom_form_responses', 'profile_id', 'purge', 'Each time she was asked a form, and when and by whom it was answered.'),
    ('custom_form_recipients', 'profile_id', 'purge', 'The forms the team picked her for.'),
    ('custom_form_versions', null, 'not_personal', 'The forms the team created as each was published.'),
    ('custom_form_reminders', null, 'not_personal', 'When the team was reminded to renew a repeating form.'),
    ('announcement_reads', 'user_id', 'purge', 'The announcements she has seen.'),
    ('event_reads', 'user_id', 'purge', 'The activities she has opened.'),
    ('onboarding_form_chains', null, 'not_personal', 'The order of the forms after Onboarding, set by the team.'),
    ('list_visits', 'user_id', 'purge', 'When she last saw each list of posts, photos, stories, activities, services or guides.'),
    ('forum_post_reads', 'user_id', 'purge', 'The forum posts she has opened, and when she last opened her own.'),
    ('media_item_reads', 'user_id', 'purge', 'The gallery items she has opened.'),
    ('knowledge_article_reads', 'user_id', 'purge', 'The guides and stories she has opened.'),
    ('service_reads', 'user_id', 'purge', 'The services she has opened.'),
    ('mentoring_request_reads', 'user_id', 'purge', 'When she last opened each of her mentoring requests.'),
    ('feedback_submission_reads', 'user_id', 'purge', 'When she last opened each of her suggestions.'),
    ('custom_form_progress', 'profile_id', 'purge', 'Her answers so far to a form she left half way, encrypted, and the screen she left it on. Removed when she sends or deletes the form, and with the ask or her account.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

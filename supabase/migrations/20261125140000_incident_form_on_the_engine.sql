-- The incident report joins the form engine as a third form she sends when she wants (RAPP-973).
--
-- WHY
--
-- Larri, 2026-11-24: players need an easy way to report an incident
-- ("denúncia") from the app, from Contacte, labelled "Reportar un incident".
-- Fabián, 2026-11-25: a private form to the team, built as the third form she
-- sends when she wants on the form engine, beside the suggestions form
-- (RAPP-939) and the mentoring request (RAPP-940). Its fixed parts are what
-- happened, when and where; the team adds questions on the board as for the
-- other two. She chooses whether to send it anonymously. A new permission,
-- "Incidents" (`incidents.manage`), reads the reports; it goes by default to
-- whoever holds `mentoring.manage`. Everyone who holds it gets a push that
-- says nothing about the report.
--
-- The form follows the rules RAPP-940 wrote for the forms she sends when she
-- wants (`private.on_demand_form_keys()`): its choices stay, it is never
-- published and asks nobody, its screens always show, and it asks its own
-- questions only. Adding its key to that list is what brings those rules to it.
--
-- Three things hold as for the other two forms:
--   - installed phone builds read `intake_catalog()` strictly. The incident
--     form, its screens and its questions never reach it: its questions are of
--     kind `survey`, which that catalog already leaves out, and the form is left
--     out of its lists of forms by its key;
--   - the people who design the form never read a report. Only
--     `incidents.manage` reads one, through `list_staff_incident_reports`;
--   - her answers stay with the report, encrypted, never on her record.
--
-- Anonymous means the team never learns who sent it, on any surface: the
-- dashboard, the staff app, the bell and the push. The row keeps `player_id`
-- for two reasons only: the report goes with her account when it is deleted
-- (`personal_data_disposition`), and the sending limit counts her reports. No
-- staff function returns it for an anonymous report, and no staff policy
-- reads the table: it has none, so every read goes through a function.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Each organization gets the incident form (`custom_forms.system_key`
--      `incident`, filled in by the player), with one fixed first screen,
--      `system_screen` `incident_report`: what happened, when, where and
--      whether she sends it anonymously. A new organization gets all three
--      forms.
--   2. The permission `incidents.manage` (area community, after
--      `mentoring.manage`), in the Staff and Admin defaults, and granted to
--      every preset and team member who holds `mentoring.manage` now.
--   3. `incident_reports` keeps each report: what happened and where,
--      encrypted; the day it happened; anonymous or not; her answers to the
--      questions staff added, encrypted; open or closed. Row level security is
--      on and no client role holds a privilege on it.
--   4. `my_incident_form()` gives her phone the form; `send_incident_report`
--      sends a report with its answers (at most ten a day);
--      `list_own_incident_reports` lists hers; `list_staff_incident_reports`
--      and `set_incident_report_status` are the team's, under
--      `incidents.manage`, with no name, no id and no photo for an anonymous
--      report.
--   5. A new report rings the bell of everyone with `incidents.manage`
--      (`incident_report`, naming nobody) and sends them a push with no
--      content (`push_publications.content_type` `incident_report`; the send
--      function words it "Nou incident").
--   6. The erasure registry purges her reports with her account.
--   7. `intake_catalog_with_surveys()` (the dashboard) sends the form apart, as
--      `incident_form`, like the other two; `intake_catalog()` is unchanged for
--      every reader.

-- 1. The third form she sends when she wants -------------------------------------------------------------

-- The app's own forms she sends when she wants, with questions staff add: the
-- suggestions form (RAPP-939), the mentoring request (RAPP-940) and the
-- incident report (RAPP-973).
create or replace function private.on_demand_form_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['feedback', 'mentoring', 'incident'];
$$;
revoke all on function private.on_demand_form_keys() from public, anon, authenticated;

-- How the database names each one in a refusal.
create or replace function private.on_demand_form_name(p_system_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_system_key when 'feedback' then 'the suggestions form'
                           when 'mentoring' then 'the mentoring form'
                           when 'incident' then 'the incident form' end;
$$;

alter table public.custom_forms drop constraint custom_forms_system_key_check;
alter table public.custom_forms add constraint custom_forms_system_key_check
  check (system_key is null
         or system_key = any (array['app_terms', 'season_authorization', 'entity_referral', 'feedback', 'mentoring',
                                    'incident']));

alter table public.custom_forms drop constraint custom_forms_system_form_is_legal;
alter table public.custom_forms add constraint custom_forms_system_form_is_legal
  check (system_key is null
         or (system_key in ('entity_referral', 'feedback', 'mentoring', 'incident') and kind = 'other')
         or (system_key not in ('entity_referral', 'feedback', 'mentoring', 'incident') and kind = 'legal'));

alter table public.custom_forms drop constraint custom_forms_on_demand_form_shape;
alter table public.custom_forms add constraint custom_forms_on_demand_form_shape
  check (system_key is null or system_key not in ('feedback', 'mentoring', 'incident')
         or (filled_by = 'player' and mandatory = 'optional' and deadline is null
             and audience = 'all' and not repeats_each_season and published_at is null));

alter table public.custom_form_screens drop constraint custom_form_screens_system_screen_check;
alter table public.custom_form_screens add constraint custom_form_screens_system_screen_check
  check (system_screen is null
         or system_screen = any (array['terms_sign', 'authorization_sign', 'reregistration',
                                       'reregistration_season', 'feedback_message', 'mentoring_request',
                                       'incident_report']));

-- A form she sends when she wants, made with its fixed screen when the
-- organization has none. The names are the ones each form starts with; staff
-- reword them.
create or replace function private.ensure_on_demand_form(p_org_id uuid, p_system_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_form uuid := private.system_form_id(p_org_id, p_system_key);
  fixed_screen text := case p_system_key when 'feedback' then 'feedback_message'
                                         when 'mentoring' then 'mentoring_request'
                                         when 'incident' then 'incident_report' end;
begin
  if fixed_screen is null then
    raise invalid_parameter_value using message = 'not a form she sends when she wants';
  end if;
  if the_form is null then
    insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                     repeats_each_season, kind, system_key)
    values (p_org_id,
            case p_system_key
              when 'feedback' then
                '{"ca": "Formulari de suggeriments", "es": "Formulario de sugerencias", "en": "Suggestions form"}'::jsonb
              when 'incident' then
                '{"ca": "Formulari d''incidents", "es": "Formulario de incidentes", "en": "Incident form"}'::jsonb
              else '{"ca": "Formulari de mentoria", "es": "Formulario de mentoría", "en": "Mentoring form"}'::jsonb
            end,
            'player', 'optional', null, 'all', false, 'other', p_system_key)
    on conflict (org_id, system_key) where system_key is not null do nothing
    returning id into the_form;
    the_form := coalesce(the_form, private.system_form_id(p_org_id, p_system_key));
  end if;
  if not exists (select 1 from public.custom_form_screens s
                  where s.form_id = the_form and s.system_screen = fixed_screen and not s.is_archived) then
    insert into public.custom_form_screens (org_id, form_id, title, sort_order, system_screen)
    values (p_org_id, the_form,
            case p_system_key
              when 'feedback' then '{"ca": "Nou suggeriment", "es": "Nueva sugerencia", "en": "New suggestion"}'::jsonb
              when 'incident' then
                '{"ca": "Reportar un incident", "es": "Reportar un incidente", "en": "Report an incident"}'::jsonb
              else '{"ca": "Nova sol·licitud", "es": "Nueva solicitud", "en": "New request"}'::jsonb
            end,
            coalesce((select min(s.sort_order) - 1 from public.custom_form_screens s
                       where s.form_id = the_form and not s.is_archived), 0),
            fixed_screen);
  end if;
  return the_form;
end;
$$;
revoke all on function private.ensure_on_demand_form(uuid, text) from public, anon, authenticated;

-- Every organization gets it now; a new one gets it from
-- `organizations_seed_on_demand_forms`, which makes every form of the list.
select private.ensure_on_demand_form(o.id, 'incident') from public.organizations o;

-- 2. The permission that reads the reports -----------------------------------------------------------------

update public.permissions set sort_order = sort_order + 1000;
-- permission-catalog:start
insert into public.permissions (code, area, sort_order) values
  ('participants.view', 'participants', 1),
  ('participants.view_personal', 'participants', 2),
  ('participants.view_sensitive', 'participants', 3),
  ('participants.view_health', 'participants', 4),
  ('consents.collect', 'participants', 5),
  ('participants.notes', 'participants', 6),
  ('participants.invite', 'participants', 7),
  ('participants.deactivate', 'participants', 8),
  ('rgpd.erase', 'participants', 9),
  ('test_players.manage', 'participants', 10),
  ('equipment.handover', 'material', 11),
  ('equipment.receive', 'material', 12),
  ('equipment.count', 'material', 13),
  ('equipment.items', 'material', 14),
  ('attendance.mark', 'attendance', 15),
  ('attendance.reports', 'attendance', 16),
  ('announcements.edit', 'content', 17),
  ('announcements.publish', 'content', 18),
  ('events.edit', 'content', 19),
  ('events.publish', 'content', 20),
  ('knowledge.edit', 'content', 21),
  ('knowledge.publish', 'content', 22),
  ('services.edit', 'content', 23),
  ('services.publish', 'content', 24),
  ('services.review', 'content', 25),
  ('forum.moderate', 'community', 26),
  ('gallery.moderate', 'community', 27),
  ('messages.inbox', 'community', 28),
  ('mentoring.manage', 'community', 29),
  ('incidents.manage', 'community', 30),
  ('feedback.view', 'community', 31),
  ('surveys.manage', 'community', 32),
  ('surveys.results', 'community', 33),
  ('notifications.send', 'community', 34),
  ('referrals.manage', 'entities', 35),
  ('entities.manage', 'entities', 36),
  ('impact.view', 'impact', 37),
  ('export.participants', 'impact', 38),
  ('export.participants_sensitive', 'impact', 39),
  ('export.attendance', 'impact', 40),
  ('export.events', 'impact', 41),
  ('audit.view', 'impact', 42),
  ('settings.organization', 'settings', 43),
  ('onboarding.design', 'settings', 44),
  ('settings.branding', 'settings', 45),
  ('settings.documents', 'settings', 46),
  ('team.manage', 'settings', 47)
on conflict (code) do update set area = excluded.area, sort_order = excluded.sort_order;
-- permission-catalog:end

-- Staff holds every community permission by default, so it holds this one.
-- permission-preset-defaults:start
insert into public.permission_preset_defaults (builtin_key, permission_code) values
  ('staff', 'incidents.manage')
on conflict do nothing;
-- permission-preset-defaults:end
-- Admin holds every permission.
insert into public.permission_preset_defaults (builtin_key, permission_code) values
  ('admin', 'incidents.manage')
on conflict do nothing;

-- Whoever reads mentoring requests now reads incident reports too: every
-- preset and every team member, and every admin.
insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
select grant_row.org_id, grant_row.preset_id, 'incidents.manage'
  from public.permission_preset_permissions as grant_row
 where grant_row.permission_code = 'mentoring.manage'
on conflict do nothing;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select grant_row.org_id, grant_row.profile_id, 'incidents.manage'
  from public.team_member_permissions as grant_row
 where grant_row.permission_code = 'mentoring.manage'
union
select profile.org_id, profile.id, 'incidents.manage'
  from public.profiles as profile
 where profile.role = 'admin'
on conflict do nothing;

-- 3. The reports -------------------------------------------------------------------------------------------

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Whose report: the erasure registry purges by it and the sending limit
  -- counts by it. No staff function returns it for an anonymous report.
  player_id uuid not null,
  is_anonymous boolean not null default false,
  what_encrypted bytea not null,
  happened_on date not null,
  where_encrypted bytea not null,
  answers_encrypted bytea,
  status text not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incident_reports_org_id_id_unique unique (org_id, id),
  constraint incident_reports_player_tenant_fkey foreign key (org_id, player_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint incident_reports_status_check check (status in ('open', 'closed')),
  constraint incident_reports_status_shape check (
    (status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null)),
  constraint incident_reports_what_length check (octet_length(what_encrypted) between 1 and 32768),
  constraint incident_reports_where_length check (octet_length(where_encrypted) between 1 and 4096),
  constraint incident_reports_answers_encrypted_check
    check (answers_encrypted is null or octet_length(answers_encrypted) between 1 and 262144)
);
create index incident_reports_queue_idx on public.incident_reports (org_id, status, created_at desc, id);
create index incident_reports_player_created_idx on public.incident_reports (org_id, player_id, created_at desc, id);
comment on table public.incident_reports is
  'Incidents a player reports to the team (RAPP-973): what happened and where, encrypted; the day; anonymous '
  'or not; her answers to the questions staff added, encrypted. Read only through list_staff_incident_reports '
  '(incidents.manage), which never names the sender of an anonymous report, and list_own_incident_reports.';
comment on column public.incident_reports.answers_encrypted is
  'Her answers to the questions staff added to the incident form, encrypted: a JSON list of '
  '{field_id, question, value}, each question as she read it. Null when she answered none.';
alter table public.incident_reports enable row level security;
alter table public.incident_reports force row level security;
-- No client reads or writes the table: its functions do.
revoke all on table public.incident_reports from public, anon, authenticated;

create trigger incident_reports_set_updated_at
  before update on public.incident_reports
  for each row execute function public.set_updated_at();

-- 4. Her phone and the team's queue ---------------------------------------------------------------------------

-- The incident form as she fills it in.
create or replace function public.my_incident_form()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_on_demand_form('incident');
$$;
revoke all on function public.my_incident_form() from public, anon;
grant execute on function public.my_incident_form() to authenticated, service_role;

-- An incident report with her answers to the questions staff added. What
-- happened is long text, where it happened short text, and the day is today
-- or before, in Madrid. Her answers are checked against the form as it is now,
-- a required question included. At most ten reports in a day: the row keeps
-- her id for this count even when the team never sees it.
create or replace function public.send_incident_report(
  p_what text, p_happened_on date, p_where text, p_is_anonymous boolean default false,
  p_answers jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  clean_what text := nullif(btrim(p_what), '');
  clean_where text := nullif(btrim(p_where), '');
  kept jsonb;
  sent_id uuid;
begin
  select p.* into actor from public.profiles p
   where p.id = (select auth.uid()) and p.role = 'player' and p.is_active;
  if actor.id is null then
    raise insufficient_privilege using message = 'only active players report an incident';
  end if;
  if clean_what is null or length(clean_what) > 4000
     or clean_where is null or length(clean_where) > 500
     or p_happened_on is null or p_happened_on < date '1900-01-01'
     or p_happened_on > (now() at time zone 'Europe/Madrid')::date then
    raise check_violation using message = 'invalid incident report';
  end if;
  if jsonb_typeof(coalesce(nullif(p_answers, 'null'::jsonb), '{}'::jsonb)) <> 'object' then
    raise invalid_parameter_value using message = 'the answers are an object by question';
  end if;
  if (select count(*) from public.incident_reports r
       where r.org_id = actor.org_id and r.player_id = actor.id
         and r.created_at > now() - interval '1 day') >= 10 then
    raise check_violation using message = 'too many incident reports today';
  end if;
  kept := private.on_demand_answers_kept(actor.org_id, 'incident', p_answers);
  insert into public.incident_reports (org_id, player_id, is_anonymous, what_encrypted, happened_on,
                                       where_encrypted, answers_encrypted)
  values (actor.org_id, actor.id, coalesce(p_is_anonymous, false), public.encrypt_field(clean_what),
          p_happened_on, public.encrypt_field(clean_where),
          case when jsonb_array_length(kept) > 0 then public.encrypt_field(kept::text) end)
  returning id into sent_id;
  return sent_id;
end;
$$;
revoke all on function public.send_incident_report(text, date, text, boolean, jsonb) from public, anon;
grant execute on function public.send_incident_report(text, date, text, boolean, jsonb) to authenticated, service_role;

-- Her own reports, newest first: the day, whether anonymous, open or closed.
create or replace function public.list_own_incident_reports()
returns table (id uuid, happened_on date, is_anonymous boolean, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.happened_on, r.is_anonymous, r.status, r.created_at
    from public.incident_reports r
   where r.org_id = (select public.current_org_id())
     and r.player_id = (select auth.uid())
     and (select public.current_app_role()) = 'player'
   order by r.created_at desc, r.id desc;
$$;
revoke all on function public.list_own_incident_reports() from public, anon;
grant execute on function public.list_own_incident_reports() to authenticated, service_role;

-- The team's reports, open first and newest first, under incidents.manage.
-- An anonymous report names nobody: no id, no name.
create or replace function public.list_staff_incident_reports()
returns table (id uuid, is_anonymous boolean, player_id uuid, player_first_name text, player_last_name text,
               what text, happened_on date, where_text text, status text, closed_at timestamptz,
               created_at timestamptz, updated_at timestamptz, answers jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.is_anonymous,
    case when r.is_anonymous then null else r.player_id end,
    case when r.is_anonymous then null else private.shown_name(r.player_id, 'first_name') end,
    case when r.is_anonymous then null else private.shown_name(r.player_id, 'last_name') end,
    public.decrypt_field(r.what_encrypted),
    r.happened_on,
    public.decrypt_field(r.where_encrypted),
    r.status,
    r.closed_at,
    r.created_at,
    r.updated_at,
    coalesce(public.decrypt_field(r.answers_encrypted)::jsonb, '[]'::jsonb)
  from public.incident_reports r
  where r.org_id = (select public.current_org_id())
    and (select public.has_permission('incidents.manage'))
  order by case r.status when 'open' then 0 else 1 end, r.created_at desc, r.id;
$$;
revoke all on function public.list_staff_incident_reports() from public, anon;
grant execute on function public.list_staff_incident_reports() to authenticated, service_role;

-- The team closes a report, or opens it again.
create or replace function public.set_incident_report_status(p_report_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if actor_org is null or not (select public.has_permission('incidents.manage')) then
    raise insufficient_privilege using message = 'only incidents.manage changes an incident report';
  end if;
  if p_status is null or p_status not in ('open', 'closed') then
    raise check_violation using message = 'an incident report is open or closed';
  end if;
  update public.incident_reports
     set status = p_status,
         closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) end
   where org_id = actor_org and id = p_report_id;
  if not found then
    raise no_data_found using message = 'no such incident report';
  end if;
end;
$$;
revoke all on function public.set_incident_report_status(uuid, text) from public, anon;
grant execute on function public.set_incident_report_status(uuid, text) to authenticated, service_role;

-- 5. The bell and the push, naming nobody ------------------------------------------------------------------

alter table public.staff_notifications drop constraint staff_notifications_event_check;
alter table public.staff_notifications add constraint staff_notifications_event_check
  check (event = any (array['message', 'referral', 'walk_in', 'deletion_request', 'mentoring_request',
                            'feedback', 'forum_report', 'gallery_report', 'field_created', 'form_renewal',
                            'incident_report']));

-- Who hears of each event. An incident report: incidents.manage. Its bell
-- names nobody: `private.staff_notification_name` has no case for it and
-- returns null.
CREATE OR REPLACE FUNCTION private.staff_notification_permissions(p_event text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_event
    when 'message' then array['messages.inbox']
    when 'referral' then array['referrals.manage']
    when 'walk_in' then array['participants.invite']
    when 'deletion_request' then array['rgpd.erase']
    when 'mentoring_request' then array['mentoring.manage']
    when 'feedback' then array['feedback.view']
    when 'forum_report' then array['forum.moderate']
    when 'gallery_report' then array['gallery.moderate']
    when 'field_created' then array['settings.organization', 'onboarding.design']
    when 'form_renewal' then array['settings.organization', 'onboarding.design']
    when 'incident_report' then array['incidents.manage']
    else array[]::text[]
  end;
$function$;


-- The bell rings for a new report, as it rings for a new mentoring request.
CREATE OR REPLACE FUNCTION private.staff_notification_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  owner_id uuid;
  owner_org uuid;
begin
  begin
    case tg_table_name
      -- A message in a player's conversation, written by that player.
      when 'messages' then
        select conversation.user_id into owner_id
          from public.conversations as conversation
         where conversation.id = new.conversation_id;
        if owner_id is not null and new.sender_id = owner_id then
          perform private.notify_staff_of_message(new.org_id, new.conversation_id, new.sender_id);
        end if;

      -- A referral waiting for review: status 'pending', the referrals queue's filter.
      when 'entity_referrals' then
        if new.status = 'pending' then
          perform private.notify_staff(new.org_id, 'referral', new.id,
            '/participants/referrals', array[actor, new.entity_user_id]);
        end if;

      -- A tablet signing waiting for review: status 'pending', as list_walk_in_signings.
      when 'walk_in_signings' then
        if new.status = 'pending' then
          perform private.notify_staff(new.org_id, 'walk_in', new.id,
            '/participants/walk-ins', array[actor, new.collected_by]);
        end if;

      -- An open erasure request: state 'open', the requests page's filter.
      when 'deletion_requests' then
        if new.state = 'open' then
          select person.org_id into owner_org
            from public.profiles as person where person.id = new.profile_id;
          if owner_org is not null then
            perform private.notify_staff(owner_org, 'deletion_request', new.id,
              '/participants/deletion-requests', array[actor, new.profile_id]);
          end if;
        end if;

      -- A mentoring request not yet scheduled: status 'requested'.
      when 'mentoring_requests' then
        if new.status = 'requested' then
          perform private.notify_staff(new.org_id, 'mentoring_request', new.id,
            '/mentoring', array[actor, new.player_id]);
        end if;

      -- New feedback: status 'new'.
      when 'feedback_submissions' then
        if new.status = 'new' then
          perform private.notify_staff(new.org_id, 'feedback', new.id,
            '/feedback', array[actor, new.author_id]);
        end if;

      -- A pending report on a post, a reply or a gallery photo.
      when 'forum_flags' then
        if new.state = 'pending' then
          if new.media_id is not null then
            perform private.notify_staff(new.org_id, 'gallery_report', new.id,
              '/forum', array[actor, new.flagger_id], jsonb_build_object('target', 'media'));
          else
            perform private.notify_staff(new.org_id, 'forum_report', new.id,
              '/forum', array[actor, new.flagger_id],
              jsonb_build_object('target', case when new.reply_id is null then 'post' else 'reply' end));
          end if;
        end if;
      -- A new incident report (RAPP-973). Its bell names nobody, so an
      -- anonymous one stays anonymous.
      when 'incident_reports' then
        perform private.notify_staff(new.org_id, 'incident_report', new.id,
          '/incidents', array[actor, new.player_id]);
      else
        null;
    end case;
  exception when others then
    -- The bell is a hint: never refuse her message or request over it.
    raise warning 'staff notification for % % failed: %', tg_table_name, new.id, sqlerrm;
  end;
  return null;
end;
$function$;

create trigger incident_reports_notify_staff
  after insert on public.incident_reports
  for each row execute function private.staff_notification_trigger();

-- The push: one publication per report, one delivery per device of everyone
-- who holds incidents.manage, as a report on the forum reaches its moderators.
-- It carries no content: the send function words it from its catalog.
alter table public.push_publications drop constraint push_publications_content_type_check;
alter table public.push_publications add constraint push_publications_content_type_check
  check (content_type = any (array['announcement', 'event', 'message', 'forum_flag', 'referral_update',
                                   'mentoring_update', 'targeted_notification', 'custom_form',
                                   'incident_report']));

create or replace function private.enqueue_incident_report_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication_id uuid;
begin
  begin
    insert into public.push_publications (org_id, content_type, content_id, scheduled_for, state)
    values (new.org_id, 'incident_report', new.id, new.created_at, 'processing')
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
        and (select private.profile_has_permission(profile.id, 'incidents.manage'))
        and profile.is_active
        and profile.push_notifications_enabled
      on conflict on constraint push_deliveries_publication_token_unique do nothing;
      perform private.invoke_push_dispatch('incident_report');
    end if;
  exception when others then
    -- The push is a hint: never refuse her report over it.
    raise warning 'incident report push for % failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.enqueue_incident_report_push() from public, anon, authenticated;
create trigger incident_reports_enqueue_push
  after insert on public.incident_reports
  for each row execute function private.enqueue_incident_report_push();

-- 6. The erasure registry --------------------------------------------------------------------------------

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
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
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
    ('custom_form_progress', 'profile_id', 'purge', 'Her answers so far to a form she left half way, encrypted, and the screen she left it on. Removed when she sends or deletes the form, and with the ask or her account.'),
    -- Her answers to a survey, kept apart from her record (RAPP-929).
    ('survey_answers', 'profile_id', 'purge', 'Her answers to a survey, encrypted, kept with the response and never on her record. Removed with the ask or her account.'),
    -- Her incident reports (RAPP-973), an anonymous one too.
    ('incident_reports', 'player_id', 'purge', 'Her incident reports, encrypted, with her answers. An anonymous one keeps her id only to go with her account and for the sending limit; the team never reads it.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

-- 7. The dashboard reads the form apart -------------------------------------------------------------------

-- As `20261125090000` left it, with the fallback naming every form she sends
-- when she wants. The form reaches the dashboard as `incident_form` by its key.
CREATE OR REPLACE FUNCTION private.intake_catalog_core(p_with_surveys boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select private.can_design_onboarding());
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'))
    -- The survey builder reads its surveys' drafts (RAPP-929).
    or (p_with_surveys and (select public.has_permission('surveys.results')));
  forms_shown uuid[];
  forms_json jsonb;
  -- The forms she sends when she wants, sent apart to the dashboard by key
  -- (`feedback_form` RAPP-939, `mentoring_form` RAPP-940).
  on_demand_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
  -- The old Health screen an older build draws: the questions of the
  -- authorization she is shown (RAPP-773). Designers read the form itself.
  old_health_json jsonb := case when with_archived then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', private.stable_uuid((x.p ->> 'id') || ':authorization'), 'field_id', x.p -> 'field_id',
             'surface', 'authorization', 'screen_key', null, 'sort_order', x.place,
             'required', x.p -> 'required', 'label_override', x.p -> 'label_override',
             'help_override', x.p -> 'help_override')
           order by x.place)
      from (select value as p, row_number() over (order by (value ->> 'sort_order')::integer) - 1 as place
              from jsonb_array_elements(coalesce(
                     private.authorization_snapshot_for(actor_org, (select auth.uid())) -> 'placements',
                     '[]'::jsonb))) x
      join public.profile_fields f on f.id = (x.p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb) end;
  -- The entity form as an older build reads it (RAPP-938): one order across its screens.
  entity_places jsonb := coalesce((
    select jsonb_object_agg(o.id::text, o.place) from private.entity_form_order(actor_org) o), '{}'::jsonb);
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived)
       -- Surveys only for the dashboard that asks for them (RAPP-929).
       and (p_with_surveys or f.kind <> 'survey')
       -- The referral form is sent as `entity_form` (RAPP-938): an older build lists these.
       and f.system_key is distinct from 'entity_referral'
       -- The suggestions and mentoring forms only for the dashboard that asks
       -- for them (RAPP-939, RAPP-940).
       and (p_with_surveys or f.system_key is null
            or not (f.system_key = any (private.on_demand_form_keys())));
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- A survey's activity and closing time (RAPP-929).
        'event_id', f.event_id, 'closes_at', f.closes_at,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        -- Legal or other, and the app's own legal forms (RAPP-771).
        'kind', f.kind, 'system_key', f.system_key,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id and f.system_key is null), '[]'::jsonb)
          -- The app terms' versions are their ledger's (RAPP-772).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', null, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version_number desc)
            from public.app_terms_versions v
           where f.system_key = 'app_terms' and v.org_id = f.org_id and v.published_at is not null), '[]'::jsonb)
          -- The authorization's are its ledger's, numbered per season (RAPP-773).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.published_at desc, v.version_number desc)
            from public.authorization_versions v
           where f.system_key = 'season_authorization' and v.org_id = f.org_id
             and v.published_at is not null), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons, and its locked part (RAPP-771).
            'texts', s.texts, 'system_screen', s.system_screen,
            -- The season documents (RAPP-773).
            'attachments', s.attachments)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb);
    -- The forms she sends when she wants go apart (RAPP-939, RAPP-940): a
    -- list of forms never shows them.
    on_demand_json := (
      select jsonb_object_agg(k.key || '_form', (
               select e from jsonb_array_elements(forms_json) e where e ->> 'system_key' = k.key limit 1))
        from unnest(private.on_demand_form_keys()) k(key));
    forms_json := coalesce((
      select jsonb_agg(x.e order by x.n) from jsonb_array_elements(forms_json) with ordinality x(e, n)
       where x.e ->> 'system_key' is null
          or not (x.e ->> 'system_key' = any (private.on_demand_form_keys()))), '[]'::jsonb);
    form_placements_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id and not f.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_blocks_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'custom_form_id', b.custom_form_id,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        -- A legal form's own signature and its texts (RAPP-773).
        'settings', b.settings, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        -- The form's own wording of the consent (RAPP-771).
        'body_override', p.body_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in
    -- (RAPP-701); a test player the draft of a legal form (RAPP-771).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_version_for(f.id, (select auth.uid())) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived
         and f.system_key is null
         -- A survey reaches her through my_surveys, never the catalog (RAPP-929).
         and f.kind <> 'survey'
      union all
      -- The terms form as the version she is shown holds it (RAPP-772).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.app_terms_versions x where x.org_id = f.org_id)),
             private.app_terms_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.app_terms_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'app_terms' and v.id is not null
         and private.app_terms_version_snapshot(v) is not null
      union all
      -- The authorization form as the version she is shown holds it (RAPP-773).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.authorization_versions x where x.season_id = v.season_id)),
             private.authorization_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.authorization_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'season_authorization' and v.id is not null
         and private.authorization_version_snapshot(v) is not null)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'kind', l.kind, 'system_key', l.system_key,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        -- A version published before RAPP-770 names no kind: its blocks are signatures.
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', coalesce(b ->> 'kind', 'signature')))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'blocks') b), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'consent_placements') p
          join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived), '[]'::jsonb)
      into forms_json, form_placements_json, form_blocks_json, form_consents_json
      from live l;
  end if;
  return jsonb_build_object(
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived, 'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons (RAPP-771).
            'texts', s.texts)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666).
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', q.question, 'label', p.label_override, 'help', p.help_override,
        'is_hidden', p.id is null) order by q.question)
        from unnest(private.wizard_intake_questions()) q(question)
        join public.profile_fields f
          on f.org_id = actor_org and f.system_key = private.question_system_key(q.question)
        left join public.field_placements p on p.field_id = f.id and p.surface = 'onboarding'
       where p.id is null or p.label_override is not null or p.help_override is not null), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Staff wording of the built-in screens and their hide switch (RAPP-612).
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_deleted', b.is_deleted,
        'is_hidden', b.is_deleted or (b.is_hidden and private.builtin_screen_hideable(b.screen)))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611).
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613, RAPP-772).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number,
                                'content', private.app_terms_version_content(v),
                                'is_draft', v.published_at is null,
                                'form_id', private.app_terms_form_id(actor_org),
                                'legacy_compatible', private.app_terms_version_compatible(v))
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'survey_form_id', f.survey_form_id, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'read_permission', f.read_permission,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived, 'created_at', f.created_at,
        'created_by', case when with_archived then f.created_by end,
        'created_by_name', case when with_archived then (
          select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = f.created_by) end,
        'has_answers', case when with_archived then private.field_has_answers(f.id) end,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        order by f.sort_order, f.created_at)
        from public.profile_fields f
       where f.org_id = actor_org and (with_archived or not f.is_archived)
         -- A survey's questions only for the dashboard that asks for them (RAPP-929).
         and (p_with_surveys or f.kind <> 'survey')), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface,
        -- The entity form as an older build reads it: no screen, one order (RAPP-938).
        'screen_key', case when p.surface = 'entity_form' then null else p.screen_key end,
        'sort_order', case when p.surface = 'entity_form'
                           then coalesce((entity_places ->> p.id::text)::integer, p.sort_order)
                           else p.sort_order end,
        'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb) || old_health_json,
    -- The blocks of each screen and of the entity form (RAPP-690).
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface,
        'screen_key', case when b.surface = 'entity_form' then null else b.screen_key end,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        'sort_order', case when b.surface = 'entity_form'
                           then coalesce((entity_places ->> b.id::text)::integer, b.sort_order)
                           else b.sort_order end)
        order by b.surface, b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
    -- Dades legals (RAPP-699): the consents and where each is asked.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.created_at, c.key)
        from public.consents c
       where c.org_id = actor_org and (with_archived or not c.is_archived)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.org_id = actor_org and p.surface <> 'custom_form'), '[]'::jsonb),
    -- The forms the team created (RAPP-700, RAPP-701), with their screens in order.
    'custom_forms', forms_json,
    'custom_form_placements', form_placements_json,
    'custom_form_blocks', form_blocks_json,
    'custom_form_consent_placements', form_consents_json,
    -- The referral form (RAPP-938): its screens and the screen of each of its
    -- fields and blocks, by id. An older build drops this key.
    'entity_form', (
      select jsonb_build_object(
        'id', f.id, 'name', f.name,
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order, 'texts', s.texts)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'screen_key', i.screen_key))
            from (select p.id, p.screen_key from public.field_placements p
                   where p.org_id = actor_org and p.surface = 'entity_form'
                  union all
                  select b.id, b.screen_key from public.form_blocks b
                   where b.org_id = actor_org and b.surface = 'entity_form') i), '[]'::jsonb))
        from public.custom_forms f
       where f.org_id = actor_org and f.system_key = 'entity_referral')
  )
  -- The suggestions form (RAPP-939) and the mentoring form (RAPP-940), for the
  -- dashboard only, as `feedback_form` and `mentoring_form`: their screens are
  -- in a form's own shape and their questions among the fields and form placements.
  || case when p_with_surveys
          -- Each form she sends when she wants, null where none (RAPP-973).
          then coalesce(on_demand_json, (select jsonb_object_agg(k.key || '_form', null)
                                           from unnest(private.on_demand_form_keys()) k(key)))
          else '{}'::jsonb end;
end;
$function$;

-- RAPP-701: Fabián's review of Nou formulari (forms design §8).
--
-- WHY
--
-- Fabián tried a form the team created and decided, 2026-10-26:
--
--   1. The team edits her data on her page already, so a form the team fills
--      in goes: a form is answered by her on the app (an entity form stays
--      for later).
--   2. "When it appears" becomes two questions: who the form is for (every
--      player, including those who join later, or players the team picks)
--      and whether it repeats every season.
--   3. A form repeating every season belongs to a season, like the season
--      authorization: nothing reaches players next season until someone
--      publishes that season's version. The people who design forms get a
--      reminder 4 weeks before the next season starts.
--   4. Every form saves a draft that never reaches players. Publica is where
--      Correcció or Nova versió, and the season, are chosen.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Team forms become forms she fills in. `audience` (`all`, `chosen`) and
--      `repeats_each_season` replace `appears`: a form that appeared once or
--      every season is for every player, a sent form for the players it was
--      sent to (`public.custom_form_recipients`), and an every-season form
--      repeats.
--   2. `public.custom_form_versions`: each Publica keeps the form as it was
--      published (name, when it must be answered, screens, fields, signature
--      blocks, consents), with its season when it repeats. Her phone, her
--      pending list and her answers read the live published version, so a
--      draft never reaches her. Published forms get their first version from
--      what they hold now.
--   3. Draft saves: `create_custom_form` and `save_custom_form` take the
--      audience and the repeat; `set_custom_form_recipients` picks players one
--      by one or by group (the notification audience). Publishing asks the
--      audience: a Nova versió asks everyone again, a Correcció asks only who
--      was never asked.
--   4. `public.custom_form_reminders` and a daily job: 4 weeks before the
--      next season starts, every repeating form without a version for it
--      rings the bell of everyone who designs forms (`form_renewal`). Ramassà
--      has no email sending path yet, so the email is not sent here.
--   5. The erasure registry knows the new tables.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security,
-- https://supabase.com/docs/guides/cron (pg_cron jobs, as the walk-in purge).

-- 1. Her forms, for every player or the players picked, repeating or not ---------------------------------

update public.custom_forms set filled_by = 'player' where filled_by = 'team';
alter table public.custom_forms drop constraint custom_forms_filled_by_check;
alter table public.custom_forms add constraint custom_forms_filled_by_check
  check (filled_by in ('player', 'entity'));

alter table public.custom_forms
  add column audience text not null default 'all' check (audience in ('all', 'chosen')),
  add column repeats_each_season boolean not null default false;
update public.custom_forms
   set audience = case when appears = 'sent' then 'chosen' else 'all' end,
       repeats_each_season = appears = 'every_season';
comment on column public.custom_forms.audience is
  'Who the form is for (RAPP-701): every player, including those who join later, or the players picked.';
comment on column public.custom_forms.repeats_each_season is
  'A version belongs to a season (RAPP-701): nothing reaches players next season until its version is published.';

create table public.custom_form_recipients (
  form_id uuid not null references public.custom_forms (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (form_id, profile_id)
);
comment on table public.custom_form_recipients is
  'The players a form is for when the team picked them (RAPP-701).';
create index custom_form_recipients_profile_idx on public.custom_form_recipients (profile_id);
create index custom_form_recipients_org_idx on public.custom_form_recipients (org_id);
insert into public.custom_form_recipients (form_id, profile_id, org_id)
select distinct r.form_id, r.profile_id, r.org_id
  from public.custom_form_responses r
  join public.custom_forms f on f.id = r.form_id and f.appears = 'sent';

-- 2. What each Publica published -------------------------------------------------------------------------

create table public.custom_form_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null references public.custom_forms (id) on delete cascade,
  version integer not null check (version >= 1),
  season_id uuid references public.seasons (id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  is_correction boolean not null default false,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  unique (form_id, version)
);
comment on table public.custom_form_versions is
  'A form as each Publica published it (RAPP-701): what her phone asks and her answers are checked against.';
create index custom_form_versions_season_idx on public.custom_form_versions (season_id);
create index custom_form_versions_org_idx on public.custom_form_versions (org_id);
create index custom_form_versions_published_by_idx on public.custom_form_versions (published_by);

create table public.custom_form_reminders (
  form_id uuid not null references public.custom_forms (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (form_id, season_id)
);
comment on table public.custom_form_reminders is
  'The reminder to renew a repeating form before a season (RAPP-701), sent once per form and season.';
create index custom_form_reminders_season_idx on public.custom_form_reminders (season_id);
create index custom_form_reminders_org_idx on public.custom_form_reminders (org_id);

alter table public.custom_form_recipients enable row level security;
alter table public.custom_form_recipients force row level security;
alter table public.custom_form_versions enable row level security;
alter table public.custom_form_versions force row level security;
alter table public.custom_form_reminders enable row level security;
alter table public.custom_form_reminders force row level security;
revoke all on public.custom_form_recipients, public.custom_form_versions, public.custom_form_reminders
  from anon, authenticated;
grant select on public.custom_form_recipients, public.custom_form_versions, public.custom_form_reminders
  to authenticated;
create policy custom_form_recipients_read on public.custom_form_recipients
  for select to authenticated
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('settings.organization'))
              or (select public.has_permission('onboarding.design'))
              or (select public.has_permission('participants.view'))));
create policy custom_form_versions_read on public.custom_form_versions
  for select to authenticated
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('settings.organization'))
              or (select public.has_permission('onboarding.design'))
              or (select public.has_permission('participants.view'))));
create policy custom_form_reminders_read on public.custom_form_reminders
  for select to authenticated
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('settings.organization'))
              or (select public.has_permission('onboarding.design'))));

-- The form as its draft holds it now: what a Publica keeps.
create or replace function private.custom_form_content(p_form_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', f.name, 'mandatory', f.mandatory, 'deadline', f.deadline,
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'intro', s.intro,
                                          'sort_order', s.sort_order)
                       order by s.sort_order, s.created_at)
        from public.custom_form_screens s where s.form_id = f.id and not s.is_archived), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required, 'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order)
        from public.field_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'screen_key', b.screen_key, 'body', b.body,
                                          'sort_order', b.sort_order)
                       order by b.screen_key, b.sort_order)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = f.id
         and private.custom_form_screen_live(b.screen_key)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'consent_id', p.consent_id, 'screen_key', p.screen_key,
                                          'sort_order', p.sort_order, 'required', p.required)
                       order by p.screen_key, p.sort_order)
        from public.consent_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)), '[]'::jsonb))
    from public.custom_forms f where f.id = p_form_id;
$$;
revoke all on function private.custom_form_content(uuid) from public, anon, authenticated;

-- The version her phone asks: the latest one, or for a repeating form the
-- latest one of the current season. None while nothing is published for it.
create or replace function private.custom_form_live_version(p_form_id uuid)
returns setof public.custom_form_versions
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
    from public.custom_form_versions v
    join public.custom_forms f on f.id = v.form_id
   where v.form_id = p_form_id
     and (not f.repeats_each_season or v.season_id = private.current_season_id(f.org_id))
   order by v.version desc
   limit 1;
$$;
revoke all on function private.custom_form_live_version(uuid) from public, anon, authenticated;

-- Published forms keep what they hold now as their first version.
insert into public.custom_form_versions (org_id, form_id, version, season_id, content, published_at)
select f.org_id, f.id, f.version,
       case when f.repeats_each_season then private.current_season_id(f.org_id) end,
       private.custom_form_content(f.id), f.published_at
  from public.custom_forms f
 where f.published_at is not null;

-- The functions that read `appears` go with it, and so do Envia, the old
-- Nova versió and the team's own completion.
drop function public.send_custom_form(uuid, text, jsonb);
drop function public.new_custom_form_version(uuid);
drop function public.complete_participant_custom_form(uuid);
drop function public.publish_custom_form(uuid);
drop function public.create_custom_form(jsonb, text, text, date, text);
drop function public.save_custom_form(uuid, jsonb, text, text, date, text);
drop function private.check_custom_form_choices(jsonb, text, text, date, text);
alter table public.custom_forms drop column appears;


-- 3. Drafts ----------------------------------------------------------------------------------------------

create or replace function private.check_custom_form_choices(
  p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_audience text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_name is null or not private.catalan_text_valid(p_name) or not private.localized_text_valid(p_name) then
    raise check_violation using message = 'a form needs its name in Catalan';
  end if;
  if p_filled_by is null or p_filled_by not in ('player', 'entity') then
    raise check_violation using message = 'a form is filled in by the player or an entity';
  end if;
  -- The entity portal has one referral form today; a form of the team's own
  -- for entities is a later step.
  if p_filled_by = 'entity' then
    raise feature_not_supported using message = 'a form an entity fills in is not available yet';
  end if;
  if p_mandatory is null or p_mandatory not in ('optional', 'required_to_use_app', 'required_from_date') then
    raise check_violation using message = 'a form is optional, required to use the app, or required from a date';
  end if;
  if (p_mandatory = 'required_from_date') <> (p_deadline is not null) then
    raise check_violation using message = 'a form required from a date names the date, and only then';
  end if;
  if p_audience is null or p_audience not in ('all', 'chosen') then
    raise check_violation using message = 'a form is for every player or for the players picked';
  end if;
end;
$$;
revoke all on function private.check_custom_form_choices(jsonb, text, text, date, text) from public, anon, authenticated;

create or replace function public.create_custom_form(
  p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_audience text,
  p_repeats_each_season boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
begin
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_audience);
  insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                   repeats_each_season, created_by)
  values (actor_org, p_name, p_filled_by, p_mandatory, p_deadline, p_audience,
          coalesce(p_repeats_each_season, false), (select auth.uid()))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.create', 'custom_form', saved_id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'audience', p_audience,
                             'repeats_each_season', coalesce(p_repeats_each_season, false)));
  return saved_id;
end;
$$;
revoke all on function public.create_custom_form(jsonb, text, text, date, text, boolean) from public, anon;
grant execute on function public.create_custom_form(jsonb, text, text, date, text, boolean) to authenticated;

-- Desa l'esborrany: the draft changes; players see the published version.
-- Whether it repeats stays once it was published, since its versions belong
-- to seasons or not.
create or replace function public.save_custom_form(
  p_id uuid, p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_audience text,
  p_repeats_each_season boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null then
    raise no_data_found using message = 'no such form';
  end if;
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_audience);
  if coalesce(p_repeats_each_season, false) <> form.repeats_each_season and form.published_at is not null then
    raise check_violation using message = 'whether a form repeats stays once it was published';
  end if;
  update public.custom_forms
     set name = p_name, filled_by = p_filled_by, mandatory = p_mandatory, deadline = p_deadline,
         audience = p_audience, repeats_each_season = coalesce(p_repeats_each_season, false),
         updated_at = now()
   where id = form.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.save', 'custom_form', form.id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'audience', p_audience,
                             'repeats_each_season', coalesce(p_repeats_each_season, false)));
end;
$$;
revoke all on function public.save_custom_form(uuid, jsonb, text, text, date, text, boolean) from public, anon;
grant execute on function public.save_custom_form(uuid, jsonb, text, text, date, text, boolean) to authenticated;

-- The players a form is for, picked one by one (`players`, their ids) or by a
-- notification audience (a group, an entity, an interest, an activity, or
-- every player). The pick replaces the list. Returns how many are on it.
create or replace function public.set_custom_form_recipients(
  p_form_id uuid, p_audience_kind text, p_audience_config jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  chosen uuid[];
begin
  if not exists (select 1 from public.custom_forms f where f.id = p_form_id and f.org_id = actor_org) then
    raise no_data_found using message = 'no such form';
  end if;
  if p_audience_kind = 'players' then
    select coalesce(array_agg(p.id), array[]::uuid[]) into chosen
      from public.profiles p
     where p.org_id = actor_org and p.role = 'player'
       and p.id::text in (select jsonb_array_elements_text(coalesce(p_audience_config -> 'participant_ids', '[]'::jsonb)));
  elsif p_audience_kind in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    select coalesce(array_agg(p.id), array[]::uuid[]) into chosen
      from public.profiles p
     where p.org_id = actor_org and p.role = 'player'
       and private.matches_notification_audience(p.id, p_audience_kind, coalesce(p_audience_config, '{}'::jsonb));
  else
    raise invalid_parameter_value using message = 'NOTIFICATIONS/INVALID_AUDIENCE';
  end if;
  delete from public.custom_form_recipients where form_id = p_form_id;
  insert into public.custom_form_recipients (form_id, profile_id, org_id)
  select p_form_id, unnest(chosen), actor_org;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.recipients', 'custom_form', p_form_id,
          jsonb_build_object('audience_kind', p_audience_kind, 'count', cardinality(chosen)));
  return cardinality(chosen);
end;
$$;
revoke all on function public.set_custom_form_recipients(uuid, text, jsonb) from public, anon;
grant execute on function public.set_custom_form_recipients(uuid, text, jsonb) to authenticated;

-- 4. Publica ---------------------------------------------------------------------------------------------

-- Who a form is for now: every active player, or the active players picked.
create or replace function private.custom_form_audience(p_form_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.id order by p.created_at, p.id), array[]::uuid[])
    from public.custom_forms f
    join public.profiles p on p.org_id = f.org_id and p.role = 'player' and p.is_active
                          and p.anonymized_at is null
   where f.id = p_form_id
     and (f.audience = 'all'
          or exists (select 1 from public.custom_form_recipients r
                      where r.form_id = f.id and r.profile_id = p.id));
$$;
revoke all on function private.custom_form_audience(uuid) from public, anon, authenticated;

-- Publica: keeps the draft as a new version (for a repeating form, of a
-- season: the current one or a future one). When it is live now, it asks
-- its audience: a Nova versió asks everyone again, a Correcció only who was
-- never asked; a pending ask moves to it. Returns how many were asked.
create or replace function public.publish_custom_form(
  p_id uuid, p_is_correction boolean default false, p_season_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
  current_season uuid := private.current_season_id(actor_org);
  next_version integer;
  is_live boolean;
  asked integer := 0;
  everyone uuid[];
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null or form.is_archived then
    raise no_data_found using message = 'no such form';
  end if;
  if not exists (select 1 from public.custom_form_screens s where s.form_id = form.id and not s.is_archived) then
    raise check_violation using message = 'a form needs a screen before it is published';
  end if;
  if form.repeats_each_season then
    if p_season_id is null or not exists (
      select 1 from public.seasons s
       where s.id = p_season_id and s.org_id = actor_org
         and (s.is_current or s.starts_on > coalesce(
               (select c.starts_on from public.seasons c where c.id = current_season), '-infinity'::date))) then
      raise check_violation using message = 'a repeating form is published to the current season or a future one';
    end if;
  elsif p_season_id is not null then
    raise check_violation using message = 'only a repeating form is published to a season';
  end if;
  if coalesce(p_is_correction, false) and not exists (
    select 1 from public.custom_form_versions v
     where v.form_id = form.id and v.season_id is not distinct from p_season_id) then
    raise check_violation using message = 'a correction needs a published version to correct';
  end if;

  select coalesce(max(v.version), 0) + 1 into next_version
    from public.custom_form_versions v where v.form_id = form.id;
  insert into public.custom_form_versions (org_id, form_id, version, season_id, content, is_correction, published_by)
  values (actor_org, form.id, next_version, p_season_id, private.custom_form_content(form.id),
          coalesce(p_is_correction, false), (select auth.uid()));
  update public.custom_forms
     set version = next_version, published_at = coalesce(published_at, now()), updated_at = now()
   where id = form.id;

  is_live := not form.repeats_each_season or p_season_id = current_season;
  if is_live then
    update public.custom_form_responses
       set version = next_version, season_id = p_season_id
     where form_id = form.id and status = 'pending';
    everyone := private.custom_form_audience(form.id);
    if coalesce(p_is_correction, false) then
      -- A correction asks only who was never asked (this season, when it repeats).
      everyone := array(
        select a from unnest(everyone) a
         where not exists (select 1 from public.custom_form_responses r
                            where r.form_id = form.id and r.profile_id = a
                              and r.season_id is not distinct from p_season_id));
    end if;
    asked := private.ask_custom_form(form.id, everyone, p_season_id);
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.publish', 'custom_form', form.id,
          jsonb_build_object('version', next_version, 'season', p_season_id,
                             'is_correction', coalesce(p_is_correction, false), 'asked', asked));
  return asked;
end;
$$;
revoke all on function public.publish_custom_form(uuid, boolean, uuid) from public, anon;
grant execute on function public.publish_custom_form(uuid, boolean, uuid) to authenticated;

-- A new player gets every form for every player that is live now.
create or replace function private.ask_custom_forms_on_joining()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'player' and (tg_op = 'INSERT' or old.role is distinct from 'player') then
    perform private.ask_custom_form(f.id, array[new.id], v.season_id)
       from public.custom_forms f
       cross join lateral private.custom_form_live_version(f.id) v
      where f.org_id = new.org_id and not f.is_archived and f.audience = 'all';
  end if;
  return null;
end;
$$;

-- A season becomes current: a repeating form asks its audience again only
-- when a version was published for that season.
create or replace function private.ask_custom_forms_on_new_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  form record;
begin
  if new.is_current and (tg_op = 'INSERT' or not old.is_current) then
    for form in
      select f.id, v.version
        from public.custom_forms f
        join lateral (select * from public.custom_form_versions x
                       where x.form_id = f.id and x.season_id = new.id
                       order by x.version desc limit 1) v on true
       where f.org_id = new.org_id and f.repeats_each_season and not f.is_archived
    loop
      update public.custom_form_responses
         set season_id = new.id, version = form.version
       where form_id = form.id and status = 'pending';
      update public.custom_forms set version = form.version where id = form.id;
      perform private.ask_custom_form(form.id, private.custom_form_audience(form.id), new.id);
    end loop;
  end if;
  return null;
end;
$$;

-- 5. Her phone reads the published version ---------------------------------------------------------------

create or replace function public.my_custom_forms()
returns table (response_id uuid, form_id uuid, version integer, name jsonb, mandatory text,
               deadline date, is_blocking boolean, asked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, f.id, v.version, v.content -> 'name', v.content ->> 'mandatory',
         (v.content ->> 'deadline')::date,
         private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date),
         r.asked_at
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id
    cross join lateral private.custom_form_live_version(f.id) v
   where r.profile_id = (select auth.uid()) and r.status = 'pending'
     and f.filled_by = 'player' and not f.is_archived
     and jsonb_array_length(v.content -> 'screens') > 0
   order by private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date) desc,
            (v.content ->> 'deadline')::date nulls last, r.asked_at, r.id;
$$;

-- She answers the published version: its required fields, every signature
-- block with the text it published, and its consents with their text.
create or replace function public.complete_custom_form(p_response_id uuid, payload jsonb)
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
  live public.custom_form_versions;
  content jsonb;
  shown_language text;
  ticks jsonb := coalesce(nullif(payload -> 'consents', 'null'::jsonb), '{}'::jsonb);
  signatures jsonb := coalesce(nullif(payload -> 'signatures', 'null'::jsonb), '{}'::jsonb);
  block jsonb;
  given jsonb;
  block_language text;
  asked record;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  select * into live from private.custom_form_live_version(form.id);
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
  shown_language := case when payload ->> 'language' in ('ca', 'es', 'en', 'ar', 'fa')
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
       and (f.show_when_field_id is null or exists (
             select 1 from public.profile_fields gate
              where gate.id = f.show_when_field_id
                and private.field_answer_now(caller, gate) = to_jsonb(f.show_when_option_id::text)))
       and private.field_answer_now(caller, f) is null
  ) then
    raise not_null_violation using message = 'complete_custom_form requires an answer to a required question';
  end if;

  -- Every signature block, with the text the version published.
  for block in select value from jsonb_array_elements(content -> 'blocks') loop
    given := signatures -> (block ->> 'id');
    if given is null or jsonb_typeof(given) <> 'object'
       or given - array['strokes', 'language'] <> '{}'::jsonb
       or not private.app_signature_valid(given -> 'strokes') then
      raise not_null_violation using message = 'complete_custom_form requires her signature on every signature block';
    end if;
    block_language := case when length(btrim(coalesce(block -> 'body' ->> (given ->> 'language'), ''))) > 0
                           then given ->> 'language' else 'ca' end;
    insert into public.form_signatures (
      org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind,
      signer_user_id, signer_name, strokes, custom_form_id)
    values (
      her.org_id, caller, 'custom_form',
      (select b.id from public.form_blocks b where b.id = (block ->> 'id')::uuid),
      block ->> 'screen_key', block -> 'body' ->> block_language, block_language, 'player', caller,
      coalesce(nullif(concat_ws(' ', private.name_answer_text(caller, 'first_name'),
                                     private.name_answer_text(caller, 'last_name')), ''), '-'),
      given -> 'strokes', form.id);
  end loop;

  -- Her ticks of the consents the version asks, each recorded with its text.
  if exists (select 1 from jsonb_each(ticks) t
              where jsonb_typeof(t.value) <> 'boolean'
                 or not exists (
                   select 1 from jsonb_array_elements(content -> 'consent_placements') p
                     join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
                    where c.key = t.key)) then
    raise check_violation using message = 'her consents are ticks of the consents the form asks';
  end if;
  for asked in
    select c.id, c.key, c.body, (p ->> 'required')::boolean as required, p ->> 'screen_key' as screen_key
      from jsonb_array_elements(content -> 'consent_placements') p
      join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
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
$$;

-- An optional form (as published) she does not want to answer leaves her Home.
create or replace function public.dismiss_custom_form(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  response public.custom_form_responses;
begin
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is closed by the player it asks';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if not exists (select 1 from private.custom_form_live_version(response.form_id) v
                  where v.content ->> 'mandatory' = 'optional') then
    raise check_violation using message = 'only an optional form can be closed';
  end if;
  update public.custom_form_responses set status = 'dismissed', answered_at = now(), answered_by = caller
   where id = response.id;
end;
$$;

-- A field she may write is one a published form she fills in asks.
create or replace function private.field_asked_of_her(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.field_placements p
                  where p.field_id = p_field_id
                    and (p.surface in ('onboarding', 'season', 'authorization')
                         or (p.surface = 'custom_form' and exists (
                               select 1 from public.custom_forms f
                                where f.id = p.custom_form_id and f.filled_by = 'player'
                                  and not f.is_archived))))
      or exists (select 1
                   from public.custom_forms f
                   cross join lateral private.custom_form_live_version(f.id) v
                   cross join lateral jsonb_array_elements(v.content -> 'placements') p
                  where f.filled_by = 'player' and not f.is_archived
                    and p ->> 'field_id' = p_field_id::text);
$$;

-- 6. The reminder before a repeating form's next season ---------------------------------------------------

alter table public.staff_notifications drop constraint staff_notifications_event_check;
alter table public.staff_notifications add constraint staff_notifications_event_check check (event in (
  'message', 'referral', 'walk_in', 'deletion_request', 'mentoring_request',
  'feedback', 'forum_report', 'gallery_report', 'field_created', 'form_renewal'
));

-- Every day: a season that starts within 4 weeks rings the bell of everyone
-- who designs forms, once per repeating form with no version for it yet.
create or replace function private.remind_custom_form_renewals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due record;
  total integer := 0;
begin
  for due in
    select f.id as form_id, f.org_id, s.id as season_id
      from public.custom_forms f
      join lateral (select x.id from public.seasons x
                     where x.org_id = f.org_id and not x.is_current
                       and x.starts_on > current_date and x.starts_on <= current_date + 28
                     order by x.starts_on limit 1) s on true
     where f.repeats_each_season and not f.is_archived
       and not exists (select 1 from public.custom_form_versions v
                        where v.form_id = f.id and v.season_id = s.id)
       and not exists (select 1 from public.custom_form_reminders r
                        where r.form_id = f.id and r.season_id = s.id)
  loop
    insert into public.custom_form_reminders (form_id, season_id, org_id)
    values (due.form_id, due.season_id, due.org_id);
    begin
      perform private.notify_staff(due.org_id, 'form_renewal', due.form_id,
                                   '/forms/custom/' || due.form_id::text, array[]::uuid[]);
    exception when others then
      raise warning 'form renewal reminder for % failed: %', due.form_id, sqlerrm;
    end;
    total := total + 1;
  end loop;
  return total;
end;
$$;
revoke all on function private.remind_custom_form_renewals() from public, anon, authenticated;

select cron.schedule('ramassa-custom-form-renewals', '41 6 * * *',
                     $$select private.remind_custom_form_renewals()$$);


-- 7. The bell says which form to renew ------------------------------------------------------------------

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
    else array[]::text[]
  end;
$function$;

CREATE OR REPLACE FUNCTION private.staff_notification_name(p_event text, p_source_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_event
    when 'message' then (
      select person.first_name
        from public.conversations as conversation
        join public.profiles as person on person.id = conversation.user_id
       where conversation.id = p_source_id and person.anonymized_at is null)
    when 'referral' then (
      select entity.name
        from public.entity_referrals as referral
        join public.collaborating_entities as entity
          on entity.org_id = referral.org_id and entity.id = referral.collaborating_entity_id
       where referral.id = p_source_id)
    when 'walk_in' then (
      select signing.first_name from public.walk_in_signings as signing
       where signing.id = p_source_id)
    when 'deletion_request' then (
      select person.first_name
        from public.deletion_requests as request
        join public.profiles as person on person.id = request.profile_id
       where request.id = p_source_id and person.anonymized_at is null)
    when 'mentoring_request' then (
      select person.first_name
        from public.mentoring_requests as request
        join public.profiles as person on person.id = request.player_id
       where request.id = p_source_id and person.anonymized_at is null)
    when 'feedback' then (
      select person.first_name
        from public.feedback_submissions as submission
        join public.profiles as person on person.id = submission.author_id
       where submission.id = p_source_id and person.anonymized_at is null)
    -- The field's own name, never an answer: nothing personal.
    when 'field_created' then (
      select field.label ->> 'ca' from public.profile_fields as field
       where field.id = p_source_id and not field.is_archived)
    -- The form's own name.
    when 'form_renewal' then (
      select form.name ->> 'ca' from public.custom_forms as form where form.id = p_source_id)
    else null
  end;
$function$;


-- 8. The catalog: drafts for the team, the published version for her ------------------------------------

CREATE OR REPLACE FUNCTION public.intake_catalog()
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
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'));
  forms_shown uuid[];
  forms_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived);
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb);
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
        'kind', b.kind, 'body', b.body, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in (RAPP-701).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_live_version(f.id) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', 'signature'))
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
        'sort_order', s.sort_order, 'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666): the wording
    -- of the question's first field on her onboarding, and hidden when that
    -- field is placed nowhere on it.
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
    -- A hide counts only while none of the screen's questions is required.
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_hidden', b.is_hidden and private.builtin_screen_hideable(b.screen))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611): the one list her
    -- phone, her summary and the staff preview read.
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613): the current published version,
    -- or the draft for a test player when there is one (RAPP-619).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content,
                                'is_draft', v.published_at is null)
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    -- Who created a field, and whether it has answers (which fixes its
    -- privacy level), only for the people who design it.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
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
       where f.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb),
    -- The blocks of each screen and of the entity form (RAPP-690), in the
    -- order they share with the placements.
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind,
        'body', b.body, 'sort_order', b.sort_order)
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
    'custom_form_consent_placements', form_consents_json
  );
end;
$function$;


-- 9. The erasure registry and anonymizing ----------------------------------------------------------------

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
    ('form_blocks', null, 'not_personal', 'The signature blocks of the forms and the text each asks to accept.'),
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
    ('onboarding_screen_versions', null, 'not_personal', 'Which Onboarding screens were saved as a new version, and when.'),
    ('custom_forms', null, 'not_personal', 'Forms the team created: their names and choices.'),
    ('custom_form_screens', null, 'not_personal', 'The screens of the forms the team created.'),
    ('custom_form_responses', 'profile_id', 'purge', 'Each time she was asked a form, and when and by whom it was answered.'),
    ('custom_form_recipients', 'profile_id', 'purge', 'The forms the team picked her for.'),
    ('custom_form_versions', null, 'not_personal', 'The forms the team created as each was published.'),
    ('custom_form_reminders', null, 'not_personal', 'When the team was reminded to renew a repeating form.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

CREATE OR REPLACE FUNCTION public.anonymize_participant(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
  birth_field public.profile_fields;
  birth_date date;
begin
  perform private.require_recent_second_factor();
  -- SECURITY DEFINER means RLS is not doing this check, so it runs before any
  -- work, right after the step-up check, and pgTAP asserts it from three roles.
  if not (select public.has_permission('rgpd.erase')) then
    raise exception 'anonymizing a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  -- The tenant scope RLS would normally provide. Without it, SECURITY DEFINER
  -- would let a staff member of one organization anonymize another's roster.
  select p.role, p.anonymized_at into subject_role, subject_anonymized_at
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'ANONYMIZE_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  -- Anonymizing a colleague would strip the name off an account that still signs
  -- in and still acts, which is a different and much worse thing than what this
  -- function is for.
  if subject_role <> 'player' then
    raise exception 'ANONYMIZE_NOT_A_PARTICIPANT: only a participant record can be anonymized'
      using errcode = 'raise_exception';
  end if;

  -- Already done. Silently re-running would rewrite `anonymized_at` and lose the
  -- date the person actually left the record.
  if subject_anonymized_at is not null then
    raise exception 'ANONYMIZE_ALREADY_DONE: this record was already anonymized'
      using errcode = 'raise_exception';
  end if;

  -- The one answer that survives, read before anything goes: her birth year,
  -- from the field the registry names, only while it is still a date (D7, D11).
  birth_field := private.feature_field(actor_org, 'erasure.birth_year');
  if birth_field.id is not null then
    birth_date := (private.field_answer_now(participant_id, birth_field) #>> '{}')::date;
  end if;

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    avatar_url = null,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

  -- Every answer of hers (D11): the app's fields and the team's, every season.
  delete from public.custom_answers where profile_id = participant_id;
  delete from public.referral_custom_answers r
   using public.entity_referrals referral
   where r.referral_id = referral.id and referral.referred_profile_id = participant_id;
  -- What a field change set aside (RAPP-665) is hers too: it leaves with her.
  delete from public.audit_log a
   where a.action = 'intake.answer_set_aside'
     and ((a.target_type = 'profile' and a.target_id = participant_id)
          or (a.target_type = 'entity_referral'
              and a.target_id in (select referral.id from public.entity_referrals referral
                                   where referral.referred_profile_id = participant_id)));

  -- Her signatures of the form blocks (RAPP-690), hers and the entity's for her.
  -- Each time she was asked a form the team created (RAPP-700).
  delete from public.custom_form_responses where profile_id = participant_id;
  delete from public.custom_form_recipients where profile_id = participant_id;
  delete from public.form_signatures g
   where g.profile_id = participant_id
      or g.referral_id in (select referral.id from public.entity_referrals referral
                            where referral.referred_profile_id = participant_id);

  -- Her birth year alone still answers every age band a funder report asks.
  if birth_date is not null then
    begin
      perform private.write_custom_answer(
        participant_id, birth_field,
        to_jsonb(make_date(extract(year from birth_date)::int, 1, 1)::text), 'staff', actor);
    exception when check_violation then
      -- A seasonal date field with no current season keeps nothing.
      null;
    end;
  end if;

  -- Prose about her life, which no column-level anonymization can reach. Deleted
  -- through this function and only through this function: the table has no
  -- DELETE policy precisely so that no staff member can quietly revise the
  -- record, and the right to erasure is a different thing from revising it.
  delete from public.participant_notes where profile_id = participant_id;
  -- Her consent decisions stay as proof of what she agreed to, without her
  -- name (RAPP-699). A staff member's reason for a withdrawal is prose about
  -- her, so it goes.
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  update public.consent_events set reason = null where profile_id = participant_id and reason is not null;
  perform set_config('ramassa.consent_event_erasure', '', true);

  -- A retained device token would keep a channel open to a real phone belonging
  -- to a person this row no longer claims to know.
  delete from public.push_tokens where user_id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.anonymize',
    'profile',
    participant_id,
    -- WHICH things were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'answers_deleted', true, 'notes_deleted', true,
                       'signatures_deleted', true,
                       'birth_year_kept', birth_date is not null)
  );
end;
$function$;

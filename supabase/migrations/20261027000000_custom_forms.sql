-- RAPP-700: Nou formulari, forms the team creates (step 4 of the forms design).
--
-- WHY
--
-- Every place that asks players something is a board of screens (RAPP-696 to
-- RAPP-699). The team also wants forms of its own: a health check before a
-- trip, a satisfaction survey, a form the team fills in about her. Each is a
-- board of screens like Onboarding, holding fields of Dades de les jugadores,
-- consents of Dades legals and signature blocks.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `public.custom_forms`: a form with its name in five languages, who
--      fills it (`player` on her phone, `team` on her page; `entity` is kept
--      for later and refused today), how mandatory it is (`optional`,
--      `required_to_use_app`, `required_from_date` with its deadline), when it
--      appears (`once`, `every_season`, `sent`), its version, when it was
--      published and whether it is archived.
--   2. `public.custom_form_screens`: its screens, in order.
--   3. `public.custom_form_responses`: one row each time she is asked, with
--      the version, the season (an every-season form), the status (`pending`,
--      `done`, or `dismissed` for an optional form she closed), when, and who
--      filled it in. One pending row per form and woman at a time.
--   4. The existing places hold a form's contents, with a reference to it:
--      `field_placements`, `consent_placements` and `form_blocks` take the
--      surface `custom_form` with the screen and `custom_form_id`;
--      `form_signatures` and `consent_events` record the form as their source.
--      A field and a consent are asked once per form, so their unique indexes
--      name the form too, and the functions that insert on them follow.
--   5. Placing fields, consents and signature blocks takes the new surface
--      (a team form holds fields only). A field on a player's form is a field
--      she is asked, so she writes its answer.
--   6. The writers Onboarding uses take the form: the required check, the
--      signatures and the consents shown.
--   7. `intake_catalog` sends the forms under new keys, so an older app build
--      never reads a surface it does not know.
--   8. Design: create, save, archive, publish, screens, Nova versió.
--   9. Asking: publishing a `once` form asks every player, an `every_season`
--      form asks every player when a season becomes current, Envia asks a
--      group (the notification audience), a new player gets the live forms
--      when she joins. Each ask of a player's form is a push notification
--      whose link opens the form.
--  10. Her phone: her pending forms, answering one, dismissing an optional one.
--  11. The team: the responses of a form, her forms on her page, and filling a
--      team form in.
--  12. The audience picker's lists open to whoever may send a form.
--  13. The erasure registry and anonymizing know the new tables.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (RLS on every new table; security definer functions with an empty search
-- path, permission checks inside),
-- https://www.postgresql.org/docs/current/sql-createindex.html (NULLS NOT
-- DISTINCT, so a placement outside a form stays unique per surface) and
-- https://www.postgresql.org/docs/current/plpgsql-control-structures.html
-- (a FOR loop over INSERT ... RETURNING).

-- 1. The forms ----------------------------------------------------------------------------------------------

create table public.custom_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name jsonb not null check (private.catalan_text_valid(name) and private.localized_text_valid(name)),
  filled_by text not null check (filled_by in ('player', 'team', 'entity')),
  mandatory text not null default 'optional'
    check (mandatory in ('optional', 'required_to_use_app', 'required_from_date')),
  deadline date,
  appears text not null check (appears in ('once', 'every_season', 'sent')),
  version integer not null default 1 check (version >= 1),
  published_at timestamptz,
  is_archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_forms_deadline_with_its_level
    check ((mandatory = 'required_from_date') = (deadline is not null))
);
comment on table public.custom_forms is
  'Forms the team creates (RAPP-700): who fills each, how mandatory, when it appears, its version.';
create index custom_forms_org_idx on public.custom_forms (org_id, created_at);
create index custom_forms_created_by_idx on public.custom_forms (created_by);

create table public.custom_form_screens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null references public.custom_forms (id) on delete cascade,
  title jsonb not null check (private.catalan_text_valid(title) and private.localized_text_valid(title)),
  intro jsonb check (intro is null or private.localized_text_valid(intro)),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.custom_form_screens is
  'The screens of a form the team created (RAPP-700), in the order she walks them.';
create index custom_form_screens_form_idx on public.custom_form_screens (form_id, sort_order);
create index custom_form_screens_org_idx on public.custom_form_screens (org_id);

create table public.custom_form_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null references public.custom_forms (id) on delete cascade,
  version integer not null check (version >= 1),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'dismissed')),
  asked_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.profiles (id) on delete set null,
  filled_by text check (filled_by is null or filled_by in ('player', 'team')),
  constraint custom_form_responses_answered_when_closed
    check ((status = 'pending') = (answered_at is null))
);
comment on table public.custom_form_responses is
  'Each time she is asked a form the team created (RAPP-700), and when and by whom it was answered.';
create unique index custom_form_responses_one_pending
  on public.custom_form_responses (form_id, profile_id) where status = 'pending';
create index custom_form_responses_profile_idx on public.custom_form_responses (profile_id, status);
create index custom_form_responses_form_idx on public.custom_form_responses (form_id, status);
create index custom_form_responses_org_idx on public.custom_form_responses (org_id);
create index custom_form_responses_season_idx on public.custom_form_responses (season_id);
create index custom_form_responses_answered_by_idx on public.custom_form_responses (answered_by);

alter table public.custom_forms enable row level security;
alter table public.custom_forms force row level security;
alter table public.custom_form_screens enable row level security;
alter table public.custom_form_screens force row level security;
alter table public.custom_form_responses enable row level security;
alter table public.custom_form_responses force row level security;
-- Written only through the functions below.
revoke all on public.custom_forms, public.custom_form_screens, public.custom_form_responses
  from anon, authenticated;
grant select on public.custom_forms, public.custom_form_screens, public.custom_form_responses
  to authenticated;

-- The people who design forms, and the team who reads the participants.
create policy custom_forms_read on public.custom_forms
  for select to authenticated
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('settings.organization'))
              or (select public.has_permission('onboarding.design'))
              or (select public.has_permission('participants.view'))));
create policy custom_form_screens_read on public.custom_form_screens
  for select to authenticated
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('settings.organization'))
              or (select public.has_permission('onboarding.design'))
              or (select public.has_permission('participants.view'))));
-- Her own responses, and the team's who may read her.
create policy custom_form_responses_read on public.custom_form_responses
  for select to authenticated
  using (profile_id = (select auth.uid())
         or (org_id = (select public.current_org_id())
             and (select public.has_permission('participants.view'))));

-- 2. The existing places hold a form's contents ----------------------------------------------------------

alter table public.field_placements
  add column custom_form_id uuid references public.custom_forms (id) on delete cascade;
alter table public.field_placements drop constraint field_placements_surface_check;
alter table public.field_placements add constraint field_placements_surface_check
  check (surface in ('onboarding', 'entity_form', 'season', 'authorization', 'custom_form'));
alter table public.field_placements drop constraint field_placements_screen_on_onboarding;
alter table public.field_placements add constraint field_placements_screen_on_onboarding
  check ((surface in ('onboarding', 'custom_form')) = (screen_key is not null));
alter table public.field_placements add constraint field_placements_custom_form_named
  check ((surface = 'custom_form') = (custom_form_id is not null));
alter table public.field_placements drop constraint field_placements_one_per_surface;
alter table public.field_placements add constraint field_placements_one_per_surface
  unique nulls not distinct (field_id, surface, custom_form_id);
create index field_placements_custom_form_idx on public.field_placements (custom_form_id)
  where custom_form_id is not null;

alter table public.consent_placements
  add column custom_form_id uuid references public.custom_forms (id) on delete cascade;
alter table public.consent_placements drop constraint consent_placements_surface_check;
alter table public.consent_placements add constraint consent_placements_surface_check
  check (surface in ('authorization', 'onboarding', 'custom_form'));
alter table public.consent_placements drop constraint consent_placements_screen_on_onboarding;
alter table public.consent_placements add constraint consent_placements_screen_on_onboarding
  check ((surface in ('onboarding', 'custom_form')) = (screen_key is not null));
alter table public.consent_placements add constraint consent_placements_custom_form_named
  check ((surface = 'custom_form') = (custom_form_id is not null));
alter table public.consent_placements drop constraint consent_placements_one_per_surface;
alter table public.consent_placements add constraint consent_placements_one_per_surface
  unique nulls not distinct (consent_id, surface, custom_form_id);
create index consent_placements_custom_form_idx on public.consent_placements (custom_form_id)
  where custom_form_id is not null;

alter table public.form_blocks
  add column custom_form_id uuid references public.custom_forms (id) on delete cascade;
alter table public.form_blocks drop constraint form_blocks_surface_check;
alter table public.form_blocks add constraint form_blocks_surface_check
  check (surface in ('onboarding', 'entity_form', 'custom_form'));
alter table public.form_blocks drop constraint form_blocks_screen_on_onboarding;
alter table public.form_blocks add constraint form_blocks_screen_on_onboarding
  check ((surface in ('onboarding', 'custom_form')) = (screen_key is not null));
alter table public.form_blocks add constraint form_blocks_custom_form_named
  check ((surface = 'custom_form') = (custom_form_id is not null));
create index form_blocks_custom_form_idx on public.form_blocks (custom_form_id)
  where custom_form_id is not null;

-- A signature and a consent name the form they came from. Forms are archived,
-- never deleted, so the proof keeps its source.
alter table public.form_signatures
  add column custom_form_id uuid references public.custom_forms (id);
alter table public.form_signatures drop constraint form_signatures_surface_check;
alter table public.form_signatures add constraint form_signatures_surface_check
  check (surface in ('wizard', 'entity_form', 'custom_form'));
alter table public.form_signatures drop constraint form_signatures_signer_fits_surface;
alter table public.form_signatures add constraint form_signatures_signer_fits_surface check (
  (surface = 'wizard' and signer_kind = 'player' and profile_id is not null)
  or (surface = 'entity_form' and signer_kind = 'entity' and referral_id is not null)
  or (surface = 'custom_form' and signer_kind = 'player' and profile_id is not null
      and custom_form_id is not null));
create index form_signatures_custom_form_idx on public.form_signatures (custom_form_id)
  where custom_form_id is not null;

alter table public.consent_events
  add column custom_form_id uuid references public.custom_forms (id);
alter table public.consent_events drop constraint consent_events_form_check;
alter table public.consent_events add constraint consent_events_form_check
  check (form is null or form in ('authorization', 'onboarding', 'custom_form'));
create index consent_events_custom_form_idx on public.consent_events (custom_form_id)
  where custom_form_id is not null;

-- The live screen a placement names, and its form ----------------------------------------------------------

create or replace function private.custom_form_of_screen(p_org_id uuid, p_screen_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.form_id
    from public.custom_form_screens s
    join public.custom_forms f on f.id = s.form_id and not f.is_archived
   where private.is_uuid_text(p_screen_key) and s.id = p_screen_key::uuid
     and s.org_id = p_org_id and not s.is_archived;
$$;
revoke all on function private.custom_form_of_screen(uuid, text) from public, anon, authenticated;

create or replace function private.custom_form_screen_live(p_screen_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.custom_form_screens s
                  where private.is_uuid_text(p_screen_key) and s.id = p_screen_key::uuid
                    and not s.is_archived);
$$;
revoke all on function private.custom_form_screen_live(text) from public, anon, authenticated;


-- 3. Placing on a form's screen ------------------------------------------------------------------------------

-- The body of `20261026210000_health_and_emergency_as_fields.sql`, with the
-- form's screens: a field is asked once per form. A file or a signature field
-- is hers to give, so a team form never asks it.
create or replace function public.place_field(
  p_field_id uuid, p_surface text, p_screen_key text default null, p_required boolean default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  form_id uuid;
  saved_id uuid;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season', 'authorization', 'custom_form') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form, the season, the authorization or a form';
  end if;
  -- Her names live on her account: her identity screen and the entity form ask them.
  if private.is_name_field(field)
     and not (p_surface = 'entity_form' or (p_surface = 'onboarding' and p_screen_key = 'identity')) then
    raise check_violation using message = 'her names are asked on her identity screen';
  end if;
  if p_surface = 'onboarding' then
    if p_screen_key is null or not (
         exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_surface = 'custom_form' then
    form_id := private.custom_form_of_screen(actor_org, p_screen_key);
    if form_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    if private.field_is_hers_only(field.question_type, field.settings)
       and exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
      raise check_violation using message = 'a file or a signature is asked of her only';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if private.field_is_hers_only(field.question_type, field.settings) and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
  if exists (select 1 from public.field_placements
              where field_id = p_field_id and surface = p_surface
                and custom_form_id is not distinct from form_id) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  insert into public.field_placements (org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key, form_id,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'custom_form', form_id));
  return saved_id;
end;
$$;

-- The body of `20261026120000_signature_block_in_the_form_builders.sql`, with
-- a player's form: she signs there. A team form has no signature block.
create or replace function public.save_form_block(p_id uuid, p_surface text, p_screen_key text, p_body jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form_id uuid;
  saved_id uuid;
begin
  if p_body is null or not private.catalan_text_valid(p_body) or not private.localized_text_valid(p_body) then
    raise check_violation using message = 'a signature needs its text in Catalan';
  end if;
  if p_id is null then
    if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'custom_form') then
      raise check_violation using message = 'a signature goes on an onboarding screen, the entity form or a form';
    end if;
    if p_surface = 'onboarding' then
      if p_screen_key is null or not (
           exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key)
           or (private.is_uuid_text(p_screen_key)
               and exists (select 1 from public.intake_screens s
                            where s.id = p_screen_key::uuid and s.org_id = actor_org
                              and not s.is_archived))) then
        raise no_data_found using message = 'no such screen';
      end if;
    elsif p_surface = 'custom_form' then
      form_id := private.custom_form_of_screen(actor_org, p_screen_key);
      if form_id is null then
        raise no_data_found using message = 'no such screen';
      end if;
      if exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
        raise check_violation using message = 'a signature is asked on a form she fills in';
      end if;
    elsif p_screen_key is not null then
      raise check_violation using message = 'only an onboarding block names a screen';
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, custom_form_id, kind, body, sort_order)
    values (actor_org, p_surface, p_screen_key, form_id, 'signature', p_body,
            private.next_form_position(actor_org, p_surface, p_screen_key))
    returning id into saved_id;
  else
    update public.form_blocks set body = p_body, updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such block';
    end if;
  end if;
  -- The text as saved, every time: the audit log is the history of the text.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.block_save', 'form_block', saved_id,
          jsonb_build_object('created', p_id is null, 'kind', 'signature', 'body', p_body));
  return saved_id;
end;
$$;

-- The body of `20261026230000_dades_legals_consents.sql`, with a player's
-- form: a consent is asked once per form. A team form asks no consent: the
-- team records one on paper on her page.
create or replace function public.place_consent(
  p_consent_id uuid, p_surface text, p_screen_key text default null, p_required boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  consent public.consents;
  form_id uuid;
  saved_id uuid;
begin
  select * into consent from public.consents where id = p_consent_id and org_id = actor_org and not is_archived;
  if consent.id is null then
    raise no_data_found using message = 'no such consent';
  end if;
  if p_surface is null or p_surface not in ('authorization', 'onboarding', 'custom_form') then
    raise check_violation using message = 'a consent is asked on the authorization, an onboarding screen or a form';
  end if;
  if p_surface = 'onboarding' then
    if p_screen_key is null or not (
         exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_surface = 'custom_form' then
    form_id := private.custom_form_of_screen(actor_org, p_screen_key);
    if form_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    if exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
      raise check_violation using message = 'a consent is asked on a form she fills in';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  -- Image rights drive the photo consent, which she can always refuse.
  if consent.key = 'image_rights' and coalesce(p_required, false) then
    raise check_violation using message = 'image rights are never required';
  end if;
  if exists (select 1 from public.consent_placements
              where consent_id = consent.id and surface = p_surface
                and custom_form_id is not distinct from form_id) then
    raise unique_violation using message = 'the consent is already asked there';
  end if;
  insert into public.consent_placements (org_id, consent_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, consent.id, p_surface, p_screen_key, form_id,
          private.next_form_position(actor_org, p_surface, p_screen_key), coalesce(p_required, false))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.place', 'consent', consent.id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'required', coalesce(p_required, false), 'custom_form', form_id));
  return saved_id;
end;
$$;

-- A field on a form she fills in is a field she is asked: she writes its answer.
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
                                  and not f.is_archived))));
$$;

-- 4. The Onboarding writers take the form ------------------------------------------------------------------

-- The body of `20261026210000_health_and_emergency_as_fields.sql`, with a
-- form's required fields (`custom_form` and the form).
drop function private.missing_required_custom_answers(uuid, text);
create function private.missing_required_custom_answers(
  p_profile_id uuid, p_placement text, p_custom_form_id uuid default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(f.id order by pl.sort_order, f.sort_order), array[]::uuid[])
    from public.profile_fields f
    join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
    join public.field_placements pl
      on pl.field_id = f.id and pl.required
     and pl.surface = case p_placement when 'wizard' then 'onboarding' when 'season' then 'season'
                                        when 'authorization' then 'authorization'
                                        when 'custom_form' then 'custom_form' end
     and (p_placement <> 'custom_form' or pl.custom_form_id = p_custom_form_id)
   where not f.is_archived
     and f.system_key is distinct from 'first_name'
     and f.system_key is distinct from 'last_name'
     and (pl.surface <> 'onboarding'
          or not private.is_uuid_text(pl.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = pl.screen_key::uuid and s.org_id = f.org_id and not s.is_archived))
     and (pl.surface <> 'custom_form' or private.custom_form_screen_live(pl.screen_key))
     and not (private.field_is_seasonal(f.id) and private.current_season_id(f.org_id) is null)
     and (f.show_when_field_id is null or exists (
           select 1 from public.profile_fields gate
            where gate.id = f.show_when_field_id
              and private.field_answer_now(p_profile_id, gate) = to_jsonb(f.show_when_option_id::text)))
     and (f.system_key is distinct from 'reference_contact_name'
          or private.system_field_answer(p_profile_id, 'reference_entity') is not null)
     and private.field_answer_now(p_profile_id, f) is null;
$$;
revoke all on function private.missing_required_custom_answers(uuid, text, uuid) from public, anon, authenticated;

-- The body of `20261026120000_signature_block_in_the_form_builders.sql`, with
-- a form she fills in (`custom_form` and the form): the signature names it.
drop function private.save_form_signatures(uuid, text, uuid, uuid, uuid, text, jsonb);
create function private.save_form_signatures(
  p_org_id uuid, p_surface text, p_profile_id uuid, p_referral_id uuid, p_signer uuid,
  p_signer_name text, p_signatures jsonb, p_custom_form_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  block public.form_blocks;
  shown_language text;
  shown text;
  saved integer := 0;
begin
  if p_signatures is null or p_signatures = 'null'::jsonb then
    return 0;
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
    block := null;
    select * into block from public.form_blocks b
     where b.id = entry.key::uuid and b.org_id = p_org_id
       and b.surface = case p_surface when 'wizard' then 'onboarding'
                                      when 'custom_form' then 'custom_form' else 'entity_form' end
       and (p_surface <> 'custom_form' or b.custom_form_id = p_custom_form_id);
    if block.id is null then
      continue;
    end if;
    shown_language := case when length(btrim(coalesce(block.body ->> (entry.value ->> 'language'), ''))) > 0
                           then entry.value ->> 'language' else 'ca' end;
    shown := block.body ->> shown_language;
    insert into public.form_signatures (
      org_id, profile_id, referral_id, surface, block_id, screen_key, body, language,
      signer_kind, signer_user_id, signer_name, strokes, custom_form_id)
    values (
      p_org_id, p_profile_id, p_referral_id, p_surface, block.id, block.screen_key, shown, shown_language,
      case when p_surface in ('wizard', 'custom_form') then 'player' else 'entity' end, p_signer,
      coalesce(nullif(btrim(p_signer_name), ''), '-'), entry.value -> 'strokes',
      case when p_surface = 'custom_form' then p_custom_form_id end);
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;
revoke all on function private.save_form_signatures(uuid, text, uuid, uuid, uuid, text, jsonb, uuid)
  from public, anon, authenticated;

-- The body of `20261026233000_dades_legals_tablet_setup_review.sql`, with a
-- form she fills in: its consents on its live screens.
drop function private.onboarding_consents_shown(uuid, jsonb, text, text[]);
create function private.onboarding_consents_shown(
  p_org_id uuid, p_consents jsonb, p_language text, p_screens text[] default null,
  p_custom_form_id uuid default null)
returns table (consent_id uuid, consent_key text, granted boolean, required boolean,
               screen_key text, wording text, language text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shown_language text := case when p_language in ('ca', 'es', 'en', 'ar', 'fa') then p_language else 'ca' end;
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
$$;
revoke all on function private.onboarding_consents_shown(uuid, jsonb, text, text[], uuid)
  from public, anon, authenticated;


-- The unique placement indexes name the form: the functions that insert on
-- them say so (bodies otherwise unchanged).

CREATE OR REPLACE FUNCTION private.seed_profile_layout(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profile_sections (org_id, key, title, sort_order, is_builtin)
  select p_org_id, d.key, d.title, d.sort_order, true from private.default_profile_sections() d
  on conflict (org_id, key) do nothing;

  insert into public.profile_fields (
    org_id, section_id, kind, system_key, question_type, label, privacy, default_required, settings, sort_order)
  select p_org_id, s.id, 'builtin', b.system_key, b.question_type, b.label, b.privacy,
         b.part_of is null and b.question = any (private.default_required_intake_questions()),
         b.settings, b.sort_order
    from private.system_profile_fields() b
    join public.profile_sections s on s.org_id = p_org_id and s.key = b.section_key
  on conflict (org_id, system_key) do nothing;

  insert into public.custom_question_options (org_id, question_id, key, label, sort_order, is_archived)
  select p_org_id, f.id, o.key, o.label, o.sort_order, false
    from private.system_field_options() o
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = o.system_key
  on conflict (question_id, key) where key is not null do nothing;

  -- Where the app asks them: her wizard screen, each season, the entity form.
  -- First parts only: the other parts follow them below.
  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  select p_org_id, f.id, 'onboarding', b.screen,
         (row_number() over (partition by b.screen
                             order by array_position(private.wizard_intake_questions(), b.question)) - 1)::integer,
         b.question = any (private.default_required_intake_questions() || private.locked_required_intake_questions())
    from private.system_profile_fields() b
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = b.system_key
   where b.part_of is null and b.screen is not null
  on conflict (field_id, surface, custom_form_id) do nothing;

  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'season', (q.position - 1)::integer,
         q.question = any (private.default_required_intake_questions())
    from unnest(private.builtin_season_fields()) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = private.question_system_key(q.question)
  on conflict (field_id, surface, custom_form_id) do nothing;

  -- The entity form asks her name always; it requires nothing else (RAPP-300).
  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'entity_form', (q.position - 1)::integer,
         f.system_key = any (private.entity_form_always_asked())
    from unnest(private.system_entity_form_fields()) with ordinality as q(system_key, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = q.system_key
   where private.question_system_key(private.system_key_question(q.system_key)) = q.system_key
  on conflict (field_id, surface, custom_form_id) do nothing;

  perform private.place_system_field_parts(p_org_id);

  -- A part shown on one answer of its first part.
  update public.profile_fields child
     set show_when_field_id = gate.id, show_when_option_id = o.id, updated_at = now()
    from private.system_field_conditions() c
    join public.profile_fields gate on gate.org_id = p_org_id and gate.system_key = c.gate_key
    join public.custom_question_options o on o.question_id = gate.id and o.key = c.option_key
   where child.org_id = p_org_id and child.system_key = c.system_key and child.show_when_field_id is null;

  -- The authorization's Health screen fields (RAPP-698).
  perform private.seed_authorization_fields(p_org_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.seed_authorization_fields(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  questions jsonb := coalesce(
    (private.current_authorization_version(p_org_id)).content -> 'questions',
    '{"health": {"asked": true, "required": true},
      "emergency_contact": {"asked": true, "required": false}}'::jsonb);
begin
  insert into public.profile_fields (
    org_id, section_id, kind, system_key, question_type, label, privacy, default_required, sort_order)
  select p_org_id, s.id, 'custom', d.system_key, d.question_type, d.label, 'sensitive', false,
         coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.section_id = s.id), 0)
           + d.position
    from (values
      ('health_info', 'health_needs', 'long_text', 0,
       '{"ca": "Tens alguna malaltia, al·lèrgia, discapacitat, lesió o tractament mèdic rellevant?", "es": "¿Tienes alguna enfermedad, alergia, discapacidad, lesión o tratamiento médico relevante?", "en": "Do you have any relevant illness, allergy, disability, injury or medical treatment?", "ar": "هل لديكِ أي مرض أو حساسية أو إعاقة أو إصابة أو علاج طبي مهم؟", "fa": "آیا بیماری، حساسیت، معلولیت، آسیب یا درمان پزشکی مهمی دارید؟"}'::jsonb),
      ('emergency_contact_name', 'contact', 'short_text', 0,
       '{"ca": "Contacte d''emergència: nom", "es": "Contacto de emergencia: nombre", "en": "Emergency contact: name", "ar": "جهة اتصال للطوارئ: الاسم", "fa": "تماس اضطراری: نام"}'::jsonb),
      ('emergency_contact_relation', 'contact', 'short_text', 1,
       '{"ca": "Contacte d''emergència: relació amb tu", "es": "Contacto de emergencia: relación contigo", "en": "Emergency contact: relationship to you", "ar": "جهة اتصال للطوارئ: صلته بكِ", "fa": "تماس اضطراری: نسبت با شما"}'::jsonb),
      ('emergency_contact_phone', 'contact', 'phone', 2,
       '{"ca": "Contacte d''emergència: telèfon", "es": "Contacto de emergencia: teléfono", "en": "Emergency contact: phone", "ar": "جهة اتصال للطوارئ: الهاتف", "fa": "تماس اضطراری: تلفن"}'::jsonb)
    ) as d(system_key, section_key, question_type, position, label)
    join public.profile_sections s on s.org_id = p_org_id and s.key = d.section_key
  on conflict (org_id, system_key) do nothing;

  -- Her health is read only with the health permission (RAPP-698).
  update public.profile_fields
     set read_permission = 'participants.view_health'
   where org_id = p_org_id and system_key = 'health_info' and kind = 'custom'
     and read_permission is null;

  -- Placed on the Health screen when the version asks them, required as it did.
  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'authorization', d.position,
         coalesce((questions -> d.question ->> 'required')::boolean, false) and d.can_require
    from (values
      ('health_info', 'health', 0, true),
      ('emergency_contact_name', 'emergency_contact', 1, true),
      ('emergency_contact_relation', 'emergency_contact', 2, false),
      ('emergency_contact_phone', 'emergency_contact', 3, true)
    ) as d(system_key, question, position, can_require)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = d.system_key
   where coalesce((questions -> d.question ->> 'asked')::boolean, true)
  on conflict (field_id, surface, custom_form_id) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION private.consents_from_authorization(p_org_id uuid, p_content jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  has_placements boolean;
begin
  if jsonb_typeof(p_content -> 'consents') is distinct from 'object' then
    return;
  end if;
  insert into public.consents (org_id, key, system_key, name, body)
  select p_org_id, c.key, case when c.key = any (private.system_consent_keys()) then c.key end,
         coalesce(private.system_consent_name(c.key),
                  jsonb_build_object('ca', left(private.localized_text_in(c.value -> 'label', 'ca'), 120))),
         -- The text, Catalan filled from another language when it had none.
         (c.value -> 'label') || jsonb_build_object('ca', private.localized_text_in(c.value -> 'label', 'ca'))
    from jsonb_each(p_content -> 'consents') c
   where private.localized_text_valid(c.value -> 'label')
  on conflict (org_id, key) do update
    set body = excluded.body, updated_at = now()
    where consents.body = consents.name and consents.created_by is null
      and consents.updated_at = consents.created_at;

  select exists (select 1 from public.consent_placements p
                  where p.org_id = p_org_id and p.surface = 'authorization')
    into has_placements;
  if not has_placements then
    insert into public.consent_placements (org_id, consent_id, surface, sort_order, required)
    select p_org_id, k.id, 'authorization', coalesce((c.value ->> 'position')::integer, 0),
           coalesce((c.value ->> 'required')::boolean, false)
      from jsonb_each(p_content -> 'consents') c
      join public.consents k on k.org_id = p_org_id and k.key = c.key
    on conflict (consent_id, surface, custom_form_id) do nothing;
  end if;
end;
$function$;


-- The Onboarding setup file leaves the team's forms out, and importing one
-- leaves their placements alone.

CREATE OR REPLACE FUNCTION private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  section_map jsonb := '{}'::jsonb;
  field_map jsonb := '{}'::jsonb;
  -- A file of an older version is read as version 3 (RAPP-656).
  document jsonb := private.onboarding_setup_as_version_3(p_document, p_org_id);
  new_field uuid;
  placed_screen text;
  item record;
  option_item record;
  new_id uuid;
  new_screen uuid;
  question_count integer := 0;
  option_ties boolean;
  steps text[];
  legal jsonb := private.onboarding_setup_legal_plan(p_document);
  flow_problem text;
begin
  -- A file with nothing to import is refused, or an empty export could be
  -- imported again and again (pending fix 33).
  if private.onboarding_setup_is_empty(p_document) then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import';
  end if;

  -- Ids inside the file are unique per type, or references are ambiguous.
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'screens') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'seasons') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'sections') s)
     or (select count(*) <> count(distinct f ->> 'id') from jsonb_array_elements(document -> 'fields') f)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(document -> 'fields') f, jsonb_array_elements(f -> 'options') o)
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an id appears twice';
  end if;

  -- Seasons.
  for item in select value from jsonb_array_elements(p_document -> 'seasons') loop
    insert into public.seasons (org_id, name, starts_on, is_current)
    values (p_org_id, item.value ->> 'name', (item.value ->> 'starts_on')::date,
            coalesce((item.value ->> 'is_current')::boolean, false))
    returning id into new_id;
    season_map := season_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  -- Ramassà screens. Fields reach them through placements, below.
  for item in select value, ordinality from jsonb_array_elements(document -> 'screens') with ordinality loop
    insert into public.intake_screens (
      org_id, title, intro, after_screen, sort_order, home_after_screen, home_sort_order, is_archived,
      created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      now() + item.ordinality * interval '1 microsecond', now())
    returning id into new_screen;
    screen_map := screen_map || jsonb_build_object(item.value ->> 'id', new_screen);
  end loop;

  -- The profile layout (RAPP-649): built-in sections and fields by their key,
  -- the others new; then where each is asked; then conditions.
  for item in select value from jsonb_array_elements(document -> 'sections') loop
    new_id := null;
    if coalesce((item.value ->> 'is_builtin')::boolean, false) then
      update public.profile_sections
         set title = item.value -> 'title', sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and key = item.value ->> 'key' and is_builtin
      returning id into new_id;
    end if;
    if new_id is null then
      new_id := gen_random_uuid();
      insert into public.profile_sections (id, org_id, key, title, sort_order)
      values (new_id, p_org_id, 'custom_' || replace(new_id::text, '-', ''), item.value -> 'title',
              (item.value ->> 'sort_order')::integer);
    end if;
    section_map := section_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  for item in select value, ordinality from jsonb_array_elements(document -> 'fields') with ordinality loop
    if section_map ->> (item.value ->> 'section_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a question names a section that is not in the file';
    end if;
    if item.value ->> 'kind' = 'builtin' then
      update public.profile_fields
         set label = item.value -> 'label', help = private.json_value_or_null(item.value -> 'help'),
             section_id = (section_map ->> (item.value ->> 'section_id'))::uuid,
             sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and system_key = private.setup_system_key(item.value)
      returning id into new_field;
      if new_field is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
      end if;
      -- Its options are the app's: a condition in the file finds them by key.
      for option_item in select value from jsonb_array_elements(item.value -> 'options') loop
        select o.id into new_id from public.custom_question_options o
         where o.question_id = new_field and o.key = option_item.value ->> 'key';
        if new_id is not null then
          option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
        end if;
      end loop;
    else
      question_count := question_count + 1;
      insert into public.profile_fields (
        org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
        sort_order, created_by, is_archived, created_at, updated_at)
      values (
        p_org_id, (section_map ->> (item.value ->> 'section_id'))::uuid, 'custom', item.value ->> 'question_type',
        item.value -> 'label', private.json_value_or_null(item.value -> 'help'), item.value ->> 'privacy',
        coalesce((item.value ->> 'default_required')::boolean, false),
        coalesce(private.json_value_or_null(item.value -> 'settings'), '{}'::jsonb),
        (item.value ->> 'sort_order')::integer,
        p_actor, coalesce((item.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_field;
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(item.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(item.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_field, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end if;
    field_map := field_map || jsonb_build_object(item.value ->> 'id', new_field);
  end loop;

  -- The built-in fields the file names are placed as the file says. A file
  -- converted from version 1 names none, so theirs stay as they are.
  -- The parts of a split field go with their first part, and the parts shown
  -- on a condition go first, so no condition is left without its field.
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface <> 'custom_form'
     and f.show_when_field_id is not null
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface <> 'custom_form'
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  for item in select value from jsonb_array_elements(document -> 'placements') loop
    if field_map ->> (item.value ->> 'field_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a question that is not in the file';
    end if;
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a screen that is not in the file';
      end if;
    end if;
    insert into public.field_placements (
      org_id, field_id, surface, screen_key, sort_order, required, label_override, help_override)
    values (
      p_org_id, (field_map ->> (item.value ->> 'field_id'))::uuid, item.value ->> 'surface', placed_screen,
      (item.value ->> 'sort_order')::integer, coalesce((item.value ->> 'required')::boolean, false),
      private.json_value_or_null(item.value -> 'label_override'),
      private.json_value_or_null(item.value -> 'help_override'));
  end loop;
  -- The signature blocks (RAPP-690), each on its screen; an older file has none.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'signature_blocks')) loop
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a signature block names a screen that is not in the file';
      end if;
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, kind, body, sort_order)
    values (p_org_id, item.value ->> 'surface', placed_screen, 'signature', item.value -> 'body',
            coalesce((item.value ->> 'sort_order')::integer, 0));
  end loop;
  -- Dades legals (RAPP-699); an older file has none. A system consent takes
  -- the file's wording by key; a staff consent is made by key, or takes the
  -- file's wording when the key exists.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consents')) loop
    insert into public.consents (org_id, key, system_key, name, body, is_archived, created_by)
    values (p_org_id, item.value ->> 'key',
            case when item.value ->> 'key' = any (private.system_consent_keys()) then item.value ->> 'key' end,
            item.value -> 'name', item.value -> 'body', coalesce((item.value ->> 'is_archived')::boolean, false),
            case when item.value ->> 'key' = any (private.system_consent_keys()) then null else p_actor end)
    on conflict (org_id, key) do update
      set name = excluded.name, body = excluded.body, is_archived = excluded.is_archived, updated_at = now();
  end loop;
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consent_placements')) loop
    placed_screen := item.value ->> 'screen_key';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent names a screen that is not in the file';
      end if;
    end if;
    select id into new_id from public.consents
     where org_id = p_org_id and key = item.value ->> 'consent_key' and not is_archived;
    if new_id is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent placement names a consent that is not in the file';
    end if;
    insert into public.consent_placements (org_id, consent_id, surface, screen_key, sort_order, required)
    values (p_org_id, new_id, 'onboarding', placed_screen, coalesce((item.value ->> 'sort_order')::integer, 0),
            coalesce((item.value ->> 'required')::boolean, false)
              and item.value ->> 'consent_key' <> 'image_rights')
    on conflict (consent_id, surface, custom_form_id) do nothing;
  end loop;
  -- A file from before the split places the first parts only.
  perform private.place_system_field_parts(p_org_id);

  for item in
    select value from jsonb_array_elements(document -> 'fields')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or option_map ->> (item.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.profile_fields
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_option_id = (option_map ->> (item.value ->> 'show_when_option_id'))::uuid
     where id = (field_map ->> (item.value ->> 'id'))::uuid;
  end loop;

  -- An older file's required list, then its wording, hiding and option
  -- changes of the app's questions, land on their fields and placements
  -- (RAPP-666). A hide counts only while the question is optional.
  for item in select value from jsonb_array_elements(p_document -> 'required_questions') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a required question this app does not know';
    end if;
    if jsonb_typeof(item.value -> 'is_required') is distinct from 'boolean' then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
    end if;
    continue when item.value ->> 'question' = any (private.locked_required_intake_questions());
    perform private.set_app_question_required(p_org_id, item.value ->> 'question', (item.value ->> 'is_required')::boolean);
  end loop;
  for item in select value from jsonb_array_elements(p_document -> 'builtin_question_overrides') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a change to an app question this app does not know';
    end if;
    perform private.fold_app_option_overrides(
      p_org_id, item.value ->> 'question', private.json_value_or_null(item.value -> 'option_overrides'));
    if coalesce((item.value ->> 'is_hidden')::boolean, false)
       and not (item.value ->> 'question' = any (private.required_intake_questions(p_org_id))) then
      perform private.set_app_question_hidden(p_org_id, item.value ->> 'question', true);
    end if;
    perform private.set_app_question_wording(
      p_org_id, item.value ->> 'question',
      private.json_value_or_null(item.value -> 'label'), private.json_value_or_null(item.value -> 'help'));
  end loop;

  -- The app screens' wording.
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, b ->> 'screen', coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b;

  -- The flow order, staff screens remapped.
  if jsonb_typeof(document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(document -> 'flow_order') with ordinality as step(value, ordinality);
    -- The same checks as save_intake_flow_order (pending fix 31), on the
    -- screens just created with the file's archived flags.
    flow_problem := private.intake_flow_order_problem(p_org_id, coalesce(steps, array[]::text[]));
    if flow_problem is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: ' || case flow_problem
        when 'too_many' then 'the flow order has more than 200 steps'
        when 'repeated' then 'the flow order names a step twice'
        when 'fixed_end' then 'the summary, the terms and the authorization always end the onboarding'
        when 'archived_screen' then 'the flow order names an archived screen'
        else 'the flow order names a step that is not in the file' end;
    end if;
    if cardinality(steps) > 0 then
      insert into public.intake_flow_orders (org_id, step_order, updated_by) values (p_org_id, steps, p_actor);
    end if;
  end if;

  -- Presets and the document step note.
  if exists (
    select 1 from jsonb_array_elements(p_document -> 'presets') p
     where jsonb_typeof(p -> 'states') is distinct from 'object'
        or exists (select 1 from jsonb_each_text(p -> 'states') entry
                    where not (entry.key = any (private.wizard_intake_questions()))
                       or entry.value not in ('ask', 'skip'))
  ) then
    raise check_violation using message = 'ONBOARDING_SETUP/MALFORMED: a preset sets ask or skip on wizard questions';
  end if;
  insert into public.intake_state_presets (org_id, name, states, created_by)
  select p_org_id, btrim(p ->> 'name'), p -> 'states', p_actor
    from jsonb_array_elements(p_document -> 'presets') p;

  update public.organizations
     set document_step_explanation = private.json_value_or_null(p_document -> 'document_step_explanation')
   where id = p_org_id;

  -- The legal texts: drafts only, through the draft functions that validate them.
  if (legal -> 'app_terms' ->> 'imported')::boolean then
    perform public.save_app_terms_draft(legal -> 'app_terms' -> 'content');
  end if;
  if (legal -> 'authorization' ->> 'imported')::boolean then
    perform public.save_authorization_draft(legal -> 'authorization' -> 'content');
  end if;

  return jsonb_build_object(
    'counts', private.onboarding_setup_import_counts(p_document),
    'legal', jsonb_build_object(
      'app_terms', (legal -> 'app_terms') - 'content',
      'authorization', (legal -> 'authorization') - 'content'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document jsonb;
begin
  if not (select private.can_design_onboarding()) or actor_org is null then
    raise insufficient_privilege using message = 'exporting the onboarding setup needs settings.organization or onboarding.design';
  end if;
  if p_app_commit is not null and p_app_commit !~ '^[0-9A-Za-z._-]{1,64}$' then
    raise check_violation using message = 'the app commit is a short version name';
  end if;

  document := jsonb_build_object(
    'format', 'ramassa.onboarding-setup',
    'schema_version', 3,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- The profile layout (RAPP-649): sections, every field with its options, and
    -- where each is asked. Version 3 (RAPP-656) carries nothing else about them.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at, s.id)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        -- The app's fields by key, then Ramassà's in their order: the same
        -- setup always gives the same file.
        order by f.kind, f.system_key, f.sort_order, f.created_at, f.id)
        from public.profile_fields f
       where f.org_id = actor_org
         and not coalesce(f.system_key = any (private.authorization_field_keys()), false)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface not in ('authorization', 'custom_form')), '[]'::jsonb),
    -- Ramassà screens, in the order of their anchors.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    -- The placements above carry the wording, the hiding and the required
    -- flag of the app's questions (RAPP-666). The two lists stay in the file,
    -- empty, so it is still a version 3 file; an older file may fill them.
    'builtin_question_overrides', '[]'::jsonb,
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', '[]'::jsonb,
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'states', p.states) order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb),
    'document_step_explanation', (
      select o.document_step_explanation from public.organizations o where o.id = actor_org),
    'app_terms', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version_number', v.version_number, 'published_at', v.published_at, 'content', v.content)
          order by v.version_number)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is null)),
    -- Real seasons only: a test fixture season is never moved.
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'is_current', s.is_current)
        order by s.starts_on, s.name)
        from public.seasons s where s.org_id = actor_org and not s.is_test_fixture), '[]'::jsonb),
    'authorization', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'season_id', v.season_id, 'version_number', v.version_number,
          'published_at', v.published_at, 'content', v.content)
          order by s.starts_on, v.version_number)
          from public.authorization_versions v
          join public.seasons s on s.id = v.season_id and not s.is_test_fixture
         where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.authorization_versions v where v.org_id = actor_org and v.published_at is null)),
    -- The signature blocks (RAPP-690), in the order they share with the placements.
    'signature_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'surface', b.surface, 'screen_key', b.screen_key, 'body', b.body, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at, b.id)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
    -- Dades legals (RAPP-699): every consent by key, the system ones with
    -- their wording, and where each is asked on Onboarding. The
    -- authorization's consents travel in its draft.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.key)
        from public.consents c where c.org_id = actor_org), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consent_key', c.key, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required)
        order by p.screen_key, p.sort_order, c.key)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id
       where p.org_id = actor_org and p.surface = 'onboarding'), '[]'::jsonb)
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;


-- 4b. The catalog sends the forms under keys of their own, so an older app
-- build never reads a surface it does not know. Designers read every form;
-- the team who reads participants reads the live ones; a player reads the
-- live forms she fills in.

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
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
    from public.custom_forms f
   where f.org_id = actor_org
     and (with_archived
          or (reads_team_forms and not f.is_archived)
          or (f.filled_by = 'player' and not f.is_archived and f.published_at is not null));
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
    -- The forms the team created (RAPP-700), with their screens in order.
    'custom_forms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline, 'appears', f.appears, 'version', f.version,
        'published_at', f.published_at, 'is_archived', f.is_archived,
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb),
    'custom_form_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id and not f.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb),
    'custom_form_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'custom_form_id', b.custom_form_id,
        'kind', b.kind, 'body', b.body, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb),
    'custom_form_consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb)
  );
end;
$function$;


-- 5. Asking her a form ----------------------------------------------------------------------------------------

-- The push of a player's form (the mentoring pattern): one publication per ask,
-- so the link opens her own response.
create or replace function private.notify_custom_form(p_org_id uuid, p_response_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
         case when player.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
              then player.preferred_language else 'ca' end,
         now()
    from public.profiles as player
    join public.push_tokens as push_token on push_token.user_id = player.id
   where player.org_id = p_org_id and player.id = p_profile_id and player.role = 'player'
     and player.is_active and player.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;
end;
$$;
revoke all on function private.notify_custom_form(uuid, uuid, uuid) from public, anon, authenticated;

-- Asks these players the form at its version: a pending response each, unless
-- one is pending already. A player's form sends each a push. Returns how many.
create or replace function private.ask_custom_form(p_form_id uuid, p_profiles uuid[], p_season_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  form public.custom_forms;
  asked record;
  total integer := 0;
begin
  select * into form from public.custom_forms where id = p_form_id;
  if form.id is null or form.is_archived or cardinality(coalesce(p_profiles, array[]::uuid[])) = 0 then
    return 0;
  end if;
  for asked in
    insert into public.custom_form_responses (org_id, form_id, version, profile_id, season_id)
    select form.org_id, form.id, form.version, p.id, p_season_id
      from public.profiles p
     where p.id = any (p_profiles) and p.org_id = form.org_id and p.role = 'player'
       and not exists (select 1 from public.custom_form_responses r
                        where r.form_id = form.id and r.profile_id = p.id and r.status = 'pending')
    returning id, profile_id
  loop
    total := total + 1;
    if form.filled_by = 'player' then
      perform private.notify_custom_form(form.org_id, asked.id, asked.profile_id);
    end if;
  end loop;
  if total > 0 and form.filled_by = 'player' then
    perform private.invoke_push_dispatch('custom_form');
  end if;
  return total;
end;
$$;
revoke all on function private.ask_custom_form(uuid, uuid[], uuid) from public, anon, authenticated;

-- The players a form asks when it starts or a season begins: every active one.
create or replace function private.active_players(p_org_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.id order by p.created_at, p.id), array[]::uuid[])
    from public.profiles p
   where p.org_id = p_org_id and p.role = 'player' and p.is_active and p.anonymized_at is null;
$$;
revoke all on function private.active_players(uuid) from public, anon, authenticated;

-- 6. Designing a form ----------------------------------------------------------------------------------------

create or replace function private.check_custom_form_choices(
  p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_appears text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_name is null or not private.catalan_text_valid(p_name) or not private.localized_text_valid(p_name) then
    raise check_violation using message = 'a form needs its name in Catalan';
  end if;
  if p_filled_by is null or p_filled_by not in ('player', 'team', 'entity') then
    raise check_violation using message = 'a form is filled in by the player, the team or an entity';
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
  if p_appears is null or p_appears not in ('once', 'every_season', 'sent') then
    raise check_violation using message = 'a form appears once, every season, or when the team sends it';
  end if;
end;
$$;
revoke all on function private.check_custom_form_choices(jsonb, text, text, date, text) from public, anon, authenticated;

create or replace function public.create_custom_form(
  p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_appears text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
begin
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_appears);
  insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, appears, created_by)
  values (actor_org, p_name, p_filled_by, p_mandatory, p_deadline, p_appears, (select auth.uid()))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.create', 'custom_form', saved_id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'appears', p_appears));
  return saved_id;
end;
$$;
revoke all on function public.create_custom_form(jsonb, text, text, date, text) from public, anon;
grant execute on function public.create_custom_form(jsonb, text, text, date, text) to authenticated;

-- Who fills it stays once anyone was asked; when it appears stays once it started.
create or replace function public.save_custom_form(
  p_id uuid, p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_appears text)
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
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_appears);
  if p_filled_by <> form.filled_by
     and exists (select 1 from public.custom_form_responses r where r.form_id = form.id) then
    raise check_violation using message = 'who fills a form stays once anyone was asked';
  end if;
  if p_appears <> form.appears and form.published_at is not null then
    raise check_violation using message = 'when a form appears stays once it started';
  end if;
  update public.custom_forms
     set name = p_name, filled_by = p_filled_by, mandatory = p_mandatory, deadline = p_deadline,
         appears = p_appears, updated_at = now()
   where id = form.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.save', 'custom_form', form.id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'appears', p_appears));
end;
$$;
revoke all on function public.save_custom_form(uuid, jsonb, text, text, date, text) from public, anon;
grant execute on function public.save_custom_form(uuid, jsonb, text, text, date, text) to authenticated;

-- An archived form asks nobody: her pending ask leaves Home and the gate.
create or replace function public.archive_custom_form(p_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.custom_forms set is_archived = coalesce(p_archived, true), updated_at = now()
   where id = p_id and org_id = actor_org;
  if not found then
    raise no_data_found using message = 'no such form';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.archive', 'custom_form', p_id,
          jsonb_build_object('archived', coalesce(p_archived, true)));
end;
$$;
revoke all on function public.archive_custom_form(uuid, boolean) from public, anon;
grant execute on function public.archive_custom_form(uuid, boolean) to authenticated;

-- A form that appears once or every season starts here: it asks every active
-- player now (an every-season form, while a season is current). A sent form
-- starts with its first Envia. Returns how many were asked.
create or replace function public.publish_custom_form(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
  season uuid;
  asked integer := 0;
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null or form.is_archived then
    raise no_data_found using message = 'no such form';
  end if;
  if form.appears = 'sent' then
    raise check_violation using message = 'a sent form starts when the team sends it';
  end if;
  if form.published_at is not null then
    raise check_violation using message = 'the form already started';
  end if;
  if not exists (select 1 from public.custom_form_screens s where s.form_id = form.id and not s.is_archived) then
    raise check_violation using message = 'a form needs a screen before it starts';
  end if;
  update public.custom_forms set published_at = now(), updated_at = now() where id = form.id;
  season := private.current_season_id(actor_org);
  if form.appears = 'once' or season is not null then
    asked := private.ask_custom_form(form.id, private.active_players(actor_org),
                                     case when form.appears = 'every_season' then season end);
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.publish', 'custom_form', form.id,
          jsonb_build_object('asked', asked));
  return asked;
end;
$$;
revoke all on function public.publish_custom_form(uuid) from public, anon;
grant execute on function public.publish_custom_form(uuid) to authenticated;

-- Desa's Nova versió: everyone answers again. Her pending ask moves to the new
-- version; whoever answered (this season, on an every-season form) is asked
-- again. Returns how many were asked again.
create or replace function public.new_custom_form_version(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
  season uuid := private.current_season_id(actor_org);
  again uuid[];
  asked integer := 0;
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null then
    raise no_data_found using message = 'no such form';
  end if;
  update public.custom_forms set version = version + 1, updated_at = now()
   where id = form.id returning * into form;
  update public.custom_form_responses set version = form.version
   where form_id = form.id and status = 'pending';
  select coalesce(array_agg(distinct r.profile_id), array[]::uuid[]) into again
    from public.custom_form_responses r
    join public.profiles p on p.id = r.profile_id and p.is_active and p.anonymized_at is null
   where r.form_id = form.id and r.status <> 'pending'
     and (form.appears <> 'every_season' or r.season_id is not distinct from season);
  if form.published_at is not null and not form.is_archived then
    asked := private.ask_custom_form(form.id, again,
                                     case when form.appears = 'every_season' then season end);
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.new_version', 'custom_form', form.id,
          jsonb_build_object('version', form.version, 'asked_again', asked));
  return asked;
end;
$$;
revoke all on function public.new_custom_form_version(uuid) from public, anon;
grant execute on function public.new_custom_form_version(uuid) to authenticated;

create or replace function public.save_custom_form_screen(
  p_id uuid, p_form_id uuid, p_title jsonb, p_intro jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  clean_intro jsonb := nullif(nullif(p_intro, 'null'::jsonb), '{}'::jsonb);
  saved_id uuid;
begin
  if p_title is null or not private.catalan_text_valid(p_title) or not private.localized_text_valid(p_title) then
    raise check_violation using message = 'a screen needs its title in Catalan';
  end if;
  if clean_intro is not null and not private.localized_text_valid(clean_intro) then
    raise check_violation using message = 'an introduction is text in the five languages';
  end if;
  if p_id is null then
    if not exists (select 1 from public.custom_forms f
                    where f.id = p_form_id and f.org_id = actor_org and not f.is_archived) then
      raise no_data_found using message = 'no such form';
    end if;
    insert into public.custom_form_screens (org_id, form_id, title, intro, sort_order)
    values (actor_org, p_form_id, p_title, clean_intro,
            coalesce((select max(s.sort_order) + 1 from public.custom_form_screens s
                       where s.form_id = p_form_id), 0))
    returning id into saved_id;
  else
    update public.custom_form_screens set title = p_title, intro = clean_intro, updated_at = now()
     where id = p_id and org_id = actor_org and not is_archived
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.screen_save', 'custom_form_screen', saved_id,
          jsonb_build_object('created', p_id is null, 'title', p_title, 'intro', clean_intro));
  return saved_id;
end;
$$;
revoke all on function public.save_custom_form_screen(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_custom_form_screen(uuid, uuid, jsonb, jsonb) to authenticated;

-- Archived like an Onboarding screen: its fields and consents leave it and stay
-- in Dades with her answers. Its signature blocks stay, so her signatures keep
-- the block they signed; nothing asks them.
create or replace function public.archive_custom_form_screen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.custom_form_screens set is_archived = true, updated_at = now()
   where id = p_id and org_id = actor_org and not is_archived;
  if not found then
    raise no_data_found using message = 'no such screen';
  end if;
  delete from public.field_placements where org_id = actor_org and surface = 'custom_form' and screen_key = p_id::text;
  delete from public.consent_placements where org_id = actor_org and surface = 'custom_form' and screen_key = p_id::text;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.screen_archive', 'custom_form_screen', p_id, '{}'::jsonb);
end;
$$;
revoke all on function public.archive_custom_form_screen(uuid) from public, anon;
grant execute on function public.archive_custom_form_screen(uuid) to authenticated;

create or replace function public.reorder_custom_form_screens(p_form_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.custom_form_screens s
     set sort_order = array_position(p_ids, s.id) - 1, updated_at = now()
   where s.org_id = actor_org and s.form_id = p_form_id and s.id = any (p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.screens_reorder', 'custom_form', p_form_id,
          jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;
revoke all on function public.reorder_custom_form_screens(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_custom_form_screens(uuid, uuid[]) to authenticated;

-- 7. When forms appear by themselves ---------------------------------------------------------------------------

-- A new player gets the live forms after her Onboarding: she becomes a player
-- when she finishes it.
create or replace function private.ask_custom_forms_on_joining()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  season uuid;
begin
  if new.role = 'player' and (tg_op = 'INSERT' or old.role is distinct from 'player') then
    season := private.current_season_id(new.org_id);
    perform private.ask_custom_form(f.id, array[new.id],
                                    case when f.appears = 'every_season' then season end)
       from public.custom_forms f
      where f.org_id = new.org_id and not f.is_archived and f.published_at is not null
        and (f.appears = 'once' or (f.appears = 'every_season' and season is not null));
  end if;
  return null;
end;
$$;
revoke all on function private.ask_custom_forms_on_joining() from public, anon, authenticated;

create trigger profiles_ask_custom_forms_on_joining
  after insert or update of role on public.profiles
  for each row execute function private.ask_custom_forms_on_joining();

-- A season becomes current: every every-season form asks every active player
-- again. An ask still pending moves to the new season.
create or replace function private.ask_custom_forms_on_new_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_current and (tg_op = 'INSERT' or not old.is_current) then
    update public.custom_form_responses r set season_id = new.id
      from public.custom_forms f
     where f.id = r.form_id and f.org_id = new.org_id and f.appears = 'every_season'
       and r.status = 'pending';
    perform private.ask_custom_form(f.id, private.active_players(new.org_id), new.id)
       from public.custom_forms f
      where f.org_id = new.org_id and f.appears = 'every_season' and not f.is_archived
        and f.published_at is not null;
  end if;
  return null;
end;
$$;
revoke all on function private.ask_custom_forms_on_new_season() from public, anon, authenticated;

create trigger seasons_ask_custom_forms
  after insert or update of is_current on public.seasons
  for each row execute function private.ask_custom_forms_on_new_season();

-- 8. Her phone ---------------------------------------------------------------------------------------------------

-- Whether her pending ask keeps her from the app: required to use it, or
-- required from a date that came.
create or replace function private.custom_form_blocks_her(p_mandatory text, p_deadline date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_mandatory = 'required_to_use_app'
      or (p_mandatory = 'required_from_date' and p_deadline <= current_date);
$$;
revoke all on function private.custom_form_blocks_her(text, date) from public, anon, authenticated;

-- Her pending forms, the ones that keep her from the app first, then by deadline.
create or replace function public.my_custom_forms()
returns table (response_id uuid, form_id uuid, version integer, name jsonb, mandatory text,
               deadline date, is_blocking boolean, asked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, f.id, r.version, f.name, f.mandatory, f.deadline,
         private.custom_form_blocks_her(f.mandatory, f.deadline), r.asked_at
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id
   where r.profile_id = (select auth.uid()) and r.status = 'pending'
     and f.filled_by = 'player' and not f.is_archived and f.published_at is not null
     and exists (select 1 from public.custom_form_screens s where s.form_id = f.id and not s.is_archived)
   order by private.custom_form_blocks_her(f.mandatory, f.deadline) desc, f.deadline nulls last,
            r.asked_at, r.id;
$$;
revoke all on function public.my_custom_forms() from public, anon;
grant execute on function public.my_custom_forms() to authenticated;

-- She answers a form: her answers by field, her signatures and her consent
-- ticks, through the writers Onboarding uses, each naming the form.
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
  ticks jsonb := nullif(payload -> 'consents', 'null'::jsonb);
  shown record;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  if form.filled_by <> 'player' or form.is_archived then
    raise insufficient_privilege using message = 'the team fills in this form';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['answers', 'signatures', 'consents', 'language'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'complete_custom_form takes her answers by field, her signatures, her consents and her language';
  end if;

  perform private.write_field_answers(caller, coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb),
                                      'player', null, true);
  perform private.apply_document_rule(caller, true, true);
  perform private.save_form_signatures(
    her.org_id, 'custom_form', caller, null, caller,
    concat_ws(' ', private.name_answer_text(caller, 'first_name'), private.name_answer_text(caller, 'last_name')),
    payload -> 'signatures', form.id);

  if cardinality(private.missing_required_custom_answers(caller, 'custom_form', form.id)) > 0 then
    raise not_null_violation using message = 'complete_custom_form requires an answer to a required question';
  end if;
  if exists (
    select 1 from public.form_blocks b
     where b.surface = 'custom_form' and b.custom_form_id = form.id
       and private.custom_form_screen_live(b.screen_key)
       and not exists (
         select 1 from public.form_signatures g
          where g.block_id = b.id and g.profile_id = caller
            and g.body = b.body ->> g.language)
  ) then
    raise not_null_violation using message = 'complete_custom_form requires her signature on every signature block';
  end if;

  -- Her ticks: every consent the form asks is recorded, required ones given.
  if ticks is null and exists (select 1 from public.consent_placements p
                                where p.surface = 'custom_form' and p.custom_form_id = form.id) then
    ticks := '{}'::jsonb;
  end if;
  for shown in
    select * from private.onboarding_consents_shown(
      her.org_id, ticks, coalesce(nullif(payload ->> 'language', ''), her.preferred_language), null, form.id)
  loop
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key, custom_form_id)
    values (her.org_id, her.id, shown.consent_id, shown.consent_key, shown.granted, 'app',
            shown.language, shown.wording, shown.required, 'custom_form', shown.screen_key, form.id);
    perform private.apply_consent_effects(her.id, shown.consent_key, shown.granted, her.id);
  end loop;

  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = caller, filled_by = 'player'
   where id = response.id;
end;
$$;
revoke all on function public.complete_custom_form(uuid, jsonb) from public, anon;
grant execute on function public.complete_custom_form(uuid, jsonb) to authenticated;

-- An optional form she does not want to answer leaves her Home.
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
  if not exists (select 1 from public.custom_forms f
                  where f.id = response.form_id and f.mandatory = 'optional' and f.filled_by = 'player') then
    raise check_violation using message = 'only an optional form can be closed';
  end if;
  update public.custom_form_responses set status = 'dismissed', answered_at = now(), answered_by = caller
   where id = response.id;
end;
$$;
revoke all on function public.dismiss_custom_form(uuid) from public, anon;
grant execute on function public.dismiss_custom_form(uuid) to authenticated;

-- 9. The team ------------------------------------------------------------------------------------------------------

-- Who was asked a form and how it stands, for the form's Respostes tab. Her
-- name as the reader may see it.
create or replace function public.custom_form_responses_of(p_form_id uuid)
returns table (response_id uuid, profile_id uuid, display_name text, member_number integer,
               status text, version integer, season_name text, asked_at timestamptz,
               answered_at timestamptz, answered_by_name text, filled_by text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.view')) then
    raise insufficient_privilege using message = 'the responses need participants.view';
  end if;
  return query
  select r.id, r.profile_id, private.display_name(r.profile_id), p.member_number, r.status, r.version,
         s.name, r.asked_at, r.answered_at,
         case when r.answered_by = r.profile_id then private.display_name(r.profile_id)
              else nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), '') end,
         r.filled_by
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id and f.org_id = (select public.current_org_id())
    join public.profiles p on p.id = r.profile_id
    left join public.seasons s on s.id = r.season_id
    left join public.profiles a on a.id = r.answered_by
   where r.form_id = p_form_id
     and (select private.participant_permission(r.profile_id, 'participants.view'))
   order by r.status = 'pending' desc, r.answered_at desc nulls last, r.asked_at desc, r.id;
end;
$$;
revoke all on function public.custom_form_responses_of(uuid) from public, anon;
grant execute on function public.custom_form_responses_of(uuid) to authenticated;

-- Her forms, for her page: every ask, the team's to fill in and hers.
create or replace function public.participant_custom_forms(p_profile_id uuid)
returns table (response_id uuid, form_id uuid, name jsonb, filled_by text, status text, version integer,
               mandatory text, deadline date, asked_at timestamptz, answered_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her forms need participants.view_personal';
  end if;
  return query
  select r.id, f.id, f.name, f.filled_by, r.status, r.version, f.mandatory, f.deadline, r.asked_at, r.answered_at
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id and not f.is_archived
   where r.profile_id = p_profile_id
   order by r.status = 'pending' desc, r.asked_at desc, r.id;
end;
$$;
revoke all on function public.participant_custom_forms(uuid) from public, anon;
grant execute on function public.participant_custom_forms(uuid) to authenticated;

-- The team finished filling in a team form on her page: her answers were
-- saved field by field through her record; this closes the ask once every
-- required field has an answer.
create or replace function public.complete_participant_custom_form(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  response public.custom_form_responses;
  form public.custom_forms;
begin
  select * into response from public.custom_form_responses
   where id = p_response_id and org_id = actor_org for update;
  if response.id is null then
    raise no_data_found using message = 'no such response';
  end if;
  if not (select private.participant_permission(response.profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'filling in her form needs participants.view_personal';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  if form.filled_by <> 'team' or form.is_archived then
    raise insufficient_privilege using message = 'she fills in this form herself';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if cardinality(private.missing_required_custom_answers(response.profile_id, 'custom_form', form.id)) > 0 then
    raise not_null_violation using message = 'complete_participant_custom_form requires an answer to a required question';
  end if;
  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = actor, filled_by = 'team'
   where id = response.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'custom_form.team_filled', 'profile', response.profile_id,
          jsonb_build_object('custom_form', form.id, 'version', response.version));
end;
$$;
revoke all on function public.complete_participant_custom_form(uuid) from public, anon;
grant execute on function public.complete_participant_custom_form(uuid) to authenticated;

-- Envia: a sent form asks a group of players, picked as a notification's
-- audience. Its first Envia starts it. Returns how many were asked.
create or replace function public.send_custom_form(
  p_form_id uuid, p_audience_kind text, p_audience_config jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  form public.custom_forms;
  chosen uuid[];
  asked integer;
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'sending a form needs participants.view_personal';
  end if;
  if p_audience_kind is null or p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    raise invalid_parameter_value using message = 'NOTIFICATIONS/INVALID_AUDIENCE';
  end if;
  select * into form from public.custom_forms where id = p_form_id and org_id = actor_org for update;
  if form.id is null or form.is_archived then
    raise no_data_found using message = 'no such form';
  end if;
  if form.appears <> 'sent' then
    raise check_violation using message = 'only a sent form is sent';
  end if;
  if not exists (select 1 from public.custom_form_screens s where s.form_id = form.id and not s.is_archived) then
    raise check_violation using message = 'a form needs a screen before it starts';
  end if;
  select coalesce(array_agg(p.id), array[]::uuid[]) into chosen
    from public.profiles p
   where p.org_id = actor_org and p.role = 'player'
     and private.matches_notification_audience(p.id, p_audience_kind, coalesce(p_audience_config, '{}'::jsonb));
  update public.custom_forms set published_at = coalesce(published_at, now()), updated_at = now()
   where id = form.id;
  asked := private.ask_custom_form(form.id, chosen, null);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.send', 'custom_form', form.id,
          jsonb_build_object('audience_kind', p_audience_kind, 'audience_config', p_audience_config,
                             'asked', asked));
  return asked;
end;
$$;
revoke all on function public.send_custom_form(uuid, text, jsonb) from public, anon;
grant execute on function public.send_custom_form(uuid, text, jsonb) to authenticated;

-- 10. The audience picker's lists for whoever may send a form ----------------------------------------------------

alter policy custom_notification_groups_select_staff on public.custom_notification_groups
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('notifications.send'))
              or (select public.has_permission('participants.view_personal'))));
alter policy custom_notification_group_members_select_staff on public.custom_notification_group_members
  using (org_id = (select public.current_org_id())
         and ((select public.has_permission('notifications.send'))
              or (select public.has_permission('participants.view_personal'))));

CREATE OR REPLACE FUNCTION public.notification_audience_entities()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct private.entity_audience_text(p.id) as entity
    from public.profiles p
   where p.org_id = (select public.current_org_id())
     and p.role = 'player'
     and p.is_active
     and not p.is_test_account
     and ((select public.has_permission('notifications.send')) or (select public.has_permission('surveys.manage'))
          or (select public.has_permission('participants.view_personal')))
     and private.entity_audience_text(p.id) is not null
   order by 1;
$function$;


-- 11. The push of a form -----------------------------------------------------------------------------------------

alter table public.push_publications drop constraint push_publications_content_type_check;
alter table public.push_publications add constraint push_publications_content_type_check
  check (content_type in ('announcement', 'event', 'message', 'forum_flag', 'referral_update',
                          'mentoring_update', 'targeted_notification', 'custom_form'));
alter table public.push_publications drop constraint push_publications_recipient_shape_check;
alter table public.push_publications add constraint push_publications_recipient_shape_check check (
  (content_type in ('message', 'referral_update', 'mentoring_update', 'custom_form') and recipient_id is not null)
  or (content_type not in ('message', 'referral_update', 'mentoring_update', 'custom_form') and recipient_id is null));

-- The body of the targeted notifications' claim, with a form's name as its title.

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
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
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


-- 12. The erasure registry and anonymizing ------------------------------------------------------------------------

-- The body of `20261026233000_dades_legals_tablet_setup_review.sql`, with the forms.

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
    ('custom_form_responses', 'profile_id', 'purge', 'Each time she was asked a form, and when and by whom it was answered.')
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

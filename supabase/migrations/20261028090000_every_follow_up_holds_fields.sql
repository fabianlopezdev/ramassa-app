-- Every screen fully editable, the app's own follow-ups included (RAPP-720).
--
-- WHY
--
-- Fabián, 2026-10-28: each screen has its own flexibility, whichever it is.
-- Ramassà may later want to know whether a passport is new or old. The
-- app's own follow-up screens (3a NIE, 3b Passaport, 3c Un altre, the
-- "Altres" situation and the specific needs details) only took their texts;
-- their questions were fixed in the phone's code.
--
-- THE MODEL
--
-- A follow-up holds field placements like any screen, with the screen-key
-- model the app's screens use (ADR-031, D14), extended to five keys:
-- `documentation-nie`, `documentation-passport`, `documentation-other`,
-- `applicant-status-details` and `specific-needs-details`. Staff edit,
-- require, remove and add fields there, and place signature blocks and
-- consents there, with the same functions as on any screen.
--
-- Each follow-up starts with the fields it asked before, in the same order
-- and with the flags her phone used (`private.app_follow_up_own_fields()`):
-- the document number on NIE and Passaport, the document name and number on
-- Un altre, the status details, the needs details. They sat beside their
-- question on the parent screen, where nothing drew them; they move to the
-- follow-ups. Her phone draws these own fields with the app's own control
-- (the NIE check, the needs per category) while they are placed there, and
-- every other field with the generic renderer after them.
--
-- One field, one answer, can sit on several sibling follow-ups: the three
-- document screens open on different answers of one question, so she is
-- asked it once (`shared_screen`). "Número de document" is on NIE and
-- Passaport; either one can drop it and ask its own field instead.
--
-- WHAT HER PHONE MUST ANSWER
--
-- A follow-up opens for her when her answer to its question opens it and its
-- parent screen opens (`private.screen_opens_for`). The server requires an
-- answer, a signature or a consent there only then. The follow-ups' own
-- fields keep the rule they had: her phone checks them, the server does not.
--
-- ORDERING RULE
--
-- Apply this migration, then the Control Center and the app update in either
-- order. An older build keeps drawing the fixed fields and never draws a
-- field added to a follow-up. So place a REQUIRED field, a signature block or
-- a required consent on a follow-up only once the app update reached the
-- players: an older build that opens that follow-up could not finish
-- otherwise. Optional fields are safe at any time.
--
-- WHAT THIS MIGRATION DOES
--
--   1. The follow-ups and their own fields, as data.
--   2. The three placement tables take the follow-up keys; one field sits on
--      several sibling follow-ups.
--   3. Placing, requiring and checking a field there.
--   4. Opening and hiding: a follow-up opens on its answer and hides with
--      its parent.
--   5. Seeding a new organization, showing a hidden app question again, and
--      the setup file (an older file's own fields land on the follow-ups).
--   6. The move of today's own fields onto the follow-ups.
--
-- Docs: https://www.postgresql.org/docs/current/ddl-generated-columns.html
--       https://www.postgresql.org/docs/current/sql-createtable.html (UNIQUE NULLS NOT DISTINCT)

-- 1. The follow-ups --------------------------------------------------------------------------------------

-- The app's follow-ups: the screen they follow, the app field whose answer
-- opens them and those answers by option key. `DETAIL_SCREEN_BRANCHES` in
-- `packages/shared/onboarding/screen-texts.ts` holds the same.
create or replace function private.app_follow_ups()
returns table (screen text, parent text, condition_key text, answer_keys text[])
language sql
immutable
set search_path = ''
as $$
  select f.screen, f.parent, f.condition_key, f.answer_keys
    from (values
      -- app-follow-ups:start
      ('documentation-nie', 'documentation', 'document_type', array['nie']),
      ('documentation-passport', 'documentation', 'document_type', array['passport']),
      ('documentation-other', 'documentation', 'document_type', array['other']),
      ('applicant-status-details', 'season', 'applicant_status', array['other']),
      ('specific-needs-details', 'specific-needs', 'specific_needs',
       array['accessibility', 'health', 'communication', 'wellbeing', 'other'])
      -- app-follow-ups:end
    ) as f(screen, parent, condition_key, answer_keys);
$$;
revoke all on function private.app_follow_ups() from public, anon, authenticated;

-- The app's own fields of each follow-up, in their order, with the flag her
-- phone used before. `FOLLOW_UP_OWN_FIELDS` in
-- `packages/shared/onboarding/follow-ups.ts` holds the same.
create or replace function private.app_follow_up_own_fields()
returns table (screen text, system_key text, place integer, required boolean)
language sql
immutable
set search_path = ''
as $$
  select o.screen, o.system_key, o.place, o.required
    from (values
      -- app-follow-up-own-fields:start
      ('documentation-nie', 'document_number', 0, true),
      ('documentation-passport', 'document_number', 0, true),
      ('documentation-other', 'document_name', 0, true),
      ('documentation-other', 'document_number', 1, true),
      ('applicant-status-details', 'applicant_status_details', 0, false),
      ('specific-needs-details', 'specific_needs_details', 0, false)
      -- app-follow-up-own-fields:end
    ) as o(screen, system_key, place, required);
$$;
revoke all on function private.app_follow_up_own_fields() from public, anon, authenticated;

create or replace function private.is_app_follow_up(p_screen_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_screen_key = any (array['documentation-nie', 'documentation-passport', 'documentation-other',
                                            'applicant-status-details', 'specific-needs-details']), false);
$$;
revoke all on function private.is_app_follow_up(text) from public, anon, authenticated;

-- Whether a field placed on one screen may sit on the other one too: the
-- sibling follow-ups of one question, which she never sees together.
create or replace function private.can_share_field(p_placed_on text, p_other text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_placed_on is distinct from p_other
                  and p_placed_on = any (array['documentation-nie', 'documentation-passport', 'documentation-other'])
                  and p_other = any (array['documentation-nie', 'documentation-passport', 'documentation-other']),
                  false);
$$;
revoke all on function private.can_share_field(text, text) from public, anon, authenticated;

-- An app screen of Onboarding a placement, a block or a consent can name: a
-- question screen, or a follow-up.
create or replace function private.is_onboarding_app_screen(p_screen_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_app_follow_up(p_screen_key)
      or exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key);
$$;
revoke all on function private.is_onboarding_app_screen(text) from public, anon, authenticated;

-- 2. The tables --------------------------------------------------------------------------------------------

alter table public.field_placements drop constraint field_placements_screen_key_check;
alter table public.field_placements add constraint field_placements_screen_key_check
  check (screen_key is null or private.is_uuid_text(screen_key) or screen_key = any (array[
    'identity', 'background', 'documentation', 'logistics', 'equipment', 'season',
    'supporting-entities', 'participation-support', 'specific-needs',
    'documentation-nie', 'documentation-passport', 'documentation-other',
    'applicant-status-details', 'specific-needs-details']));
alter table public.form_blocks drop constraint form_blocks_screen_key_check;
alter table public.form_blocks add constraint form_blocks_screen_key_check
  check (screen_key is null or private.is_uuid_text(screen_key) or screen_key = any (array[
    'identity', 'background', 'documentation', 'logistics', 'equipment', 'season',
    'supporting-entities', 'participation-support', 'specific-needs',
    'documentation-nie', 'documentation-passport', 'documentation-other',
    'applicant-status-details', 'specific-needs-details']));
alter table public.consent_placements drop constraint consent_placements_screen_key_check;
alter table public.consent_placements add constraint consent_placements_screen_key_check
  check (screen_key is null or private.is_uuid_text(screen_key) or screen_key = any (array[
    'identity', 'background', 'documentation', 'logistics', 'equipment', 'season',
    'supporting-entities', 'participation-support', 'specific-needs',
    'documentation-nie', 'documentation-passport', 'documentation-other',
    'applicant-status-details', 'specific-needs-details']));

-- A field sits once per surface (and per form), or once on each sibling
-- follow-up of one question.
alter table public.field_placements
  add column shared_screen text generated always as (
    case when surface = 'onboarding'
          and screen_key = any (array['documentation-nie', 'documentation-passport', 'documentation-other'])
         then screen_key end) stored;
comment on column public.field_placements.shared_screen is
  'The sibling follow-up a shared field sits on (RAPP-720): one field, one answer, on several of them.';
alter table public.field_placements drop constraint field_placements_one_per_surface;
alter table public.field_placements add constraint field_placements_one_per_surface
  unique nulls not distinct (field_id, surface, custom_form_id, shared_screen);

-- The guard: a field's condition is asked on its screen or, on a follow-up,
-- on the screen it follows; a field sits on two screens of her onboarding
-- only across sibling follow-ups.
create or replace function private.guard_field_placement()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  field public.profile_fields%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE')
     and (tg_op = 'DELETE' or old.surface is distinct from new.surface
          or old.screen_key is distinct from new.screen_key)
     and exists (select 1 from public.profile_fields child
                   join public.field_placements theirs on theirs.field_id = child.id
                  where child.show_when_field_id = old.field_id
                    and theirs.surface = old.surface
                    and (theirs.screen_key is not distinct from old.screen_key
                         -- Or on a follow-up of that screen (RAPP-720).
                         or (old.surface = 'onboarding' and theirs.screen_key in (
                               select f.screen from private.app_follow_ups() f where f.parent = old.screen_key))))
     -- A field that is being deleted takes its conditions' placements along.
     and exists (select 1 from public.profile_fields f where f.id = old.field_id) then
    raise check_violation using message = 'a conditional question must stay with its controlling question';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select * into field from public.profile_fields where id = new.field_id;
  if field.org_id is distinct from new.org_id then
    raise check_violation using message = 'a placement belongs to its field''s organization';
  end if;
  if field.show_when_field_id is not null
     and not exists (select 1 from public.field_placements theirs
                      where theirs.field_id = field.show_when_field_id and theirs.surface = new.surface
                        and (theirs.screen_key is not distinct from new.screen_key
                             -- A follow-up opens on an answer of the screen it follows (RAPP-720).
                             or (new.surface = 'onboarding' and theirs.screen_key = (
                                   select f.parent from private.app_follow_ups() f where f.screen = new.screen_key)))) then
    raise check_violation using message = 'a condition needs an option of a single-choice question on the same screen and organisation';
  end if;
  if new.surface = 'onboarding'
     and exists (select 1 from public.field_placements other
                  where other.field_id = new.field_id and other.surface = 'onboarding'
                    and other.id <> new.id
                    and not private.can_share_field(other.screen_key, new.screen_key)) then
    raise unique_violation using message = 'the field is already asked there';
  end if;
  return new;
end;
$function$;


-- 3. Placing a field, a block or a consent on a follow-up, and what she must answer -----------------------

create or replace function public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- An app screen or one of the app's follow-ups (RAPP-720).
    if p_screen_key is null or not (
         private.is_onboarding_app_screen(p_screen_key)
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
  -- Once per surface, or once on each sibling follow-up (RAPP-720).
  if exists (select 1 from public.field_placements
              where field_id = p_field_id and surface = p_surface
                and custom_form_id is not distinct from form_id
                and (p_surface <> 'onboarding' or not private.can_share_field(screen_key, p_screen_key))) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  -- A hidden screen asks nothing required (RAPP-711): a field placed on it is optional.
  if private.screen_is_hidden(actor_org, p_surface, p_screen_key) and coalesce(p_required, false) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  insert into public.field_placements (org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key, form_id,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required)
            and not private.screen_is_hidden(actor_org, p_surface, p_screen_key))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'custom_form', form_id));
  return saved_id;
end;
$function$;

create or replace function public.save_placement(p_placement_id uuid, p_required boolean, p_label_override jsonb DEFAULT NULL::jsonb, p_help_override jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
  field public.profile_fields;
  clean_label jsonb := nullif(nullif(p_label_override, 'null'::jsonb), '{}'::jsonb);
  clean_help jsonb := nullif(nullif(p_help_override, 'null'::jsonb), '{}'::jsonb);
  new_required boolean;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  select * into field from public.profile_fields where id = placement.field_id;
  if (clean_label is not null and not private.localized_text_valid(clean_label))
     or (clean_help is not null and not private.localized_text_valid(clean_help)) then
    raise check_violation using message = 'a wording is text in the five languages';
  end if;
  new_required := coalesce(p_required, placement.required);
  if new_required and not placement.required
     and private.screen_is_hidden(actor_org, placement.surface, placement.screen_key) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  if field.kind = 'builtin' and placement.surface <> 'entity_form' then
    -- The field that stands for an app question carries its required flag,
    -- on her onboarding and her season form alike; the other parts of a
    -- split field follow the app's own rules.
    if private.question_system_key(private.system_key_question(field.system_key)) = field.system_key then
      if new_required is distinct from placement.required then
        perform public.save_builtin_question_required(private.system_key_question(field.system_key), new_required);
      end if;
      select p.required into new_required from public.field_placements p where p.id = p_placement_id;
    elsif not (placement.surface = 'onboarding' and private.is_app_follow_up(placement.screen_key)) then
      -- On an app follow-up every field is required as staff say (RAPP-720).
      new_required := false;
    end if;
  end if;
  if placement.surface = 'entity_form' and field.system_key = any (private.entity_form_always_asked()) then
    new_required := true;
  end if;
  update public.field_placements
     set required = new_required, label_override = clean_label, help_override = clean_help, updated_at = now()
   where id = p_placement_id;
  -- The field names only: the wording is in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_save', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'required', new_required,
                             'label_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_label) k), '[]'::jsonb),
                             'help_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_help) k), '[]'::jsonb)));
end;
$function$;

create or replace function public.place_consent(p_consent_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- An app screen or one of the app's follow-ups (RAPP-720).
    if p_screen_key is null or not (
         private.is_onboarding_app_screen(p_screen_key)
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
  if coalesce(p_required, false) and private.screen_is_hidden(actor_org, p_surface, p_screen_key) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
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
$function$;

create or replace function public.save_form_block(p_id uuid, p_surface text, p_screen_key text, p_body jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- An app screen or one of the app's follow-ups (RAPP-720).
      if p_screen_key is null or not (
           private.is_onboarding_app_screen(p_screen_key)
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
    if private.screen_is_hidden(actor_org, p_surface, p_screen_key) then
      raise check_violation using message = 'a hidden screen holds no signature';
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
$function$;

create or replace function private.missing_required_custom_answers(p_profile_id uuid, p_placement text, p_custom_form_id uuid DEFAULT NULL::uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     -- A follow-up's own field is checked on her phone by the app's own
     -- control, as before (RAPP-720).
     and not (pl.surface = 'onboarding' and exists (
           select 1 from private.app_follow_up_own_fields() o
            where o.screen = pl.screen_key and o.system_key = f.system_key))
     -- Only on a screen that opens for her (RAPP-715).
     and (pl.surface not in ('onboarding', 'custom_form')
          or private.screen_opens_for(p_profile_id, f.org_id, pl.surface, pl.screen_key))
     and private.field_answer_now(p_profile_id, f) is null;
$function$;


-- 4. A follow-up opens on its answer and hides with its parent -------------------------------------------

-- Whether her stored answer to a follow-up's question opens it.
create or replace function private.app_follow_up_opens_for(p_profile_id uuid, p_org_id uuid, p_screen text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  follow record;
  field public.profile_fields;
begin
  select * into follow from private.app_follow_ups() u where u.screen = p_screen;
  if follow.screen is null then
    return false;
  end if;
  select * into field from public.profile_fields f
   where f.org_id = p_org_id and f.system_key = follow.condition_key;
  if field.id is null or field.is_archived then
    return false;
  end if;
  return private.answer_matches(
    private.field_answer_now(p_profile_id, field),
    array(select o.id::text from public.custom_question_options o
           where o.question_id = field.id and o.key = any (follow.answer_keys)));
end;
$$;
revoke all on function private.app_follow_up_opens_for(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.screen_is_hidden_at(p_org_id uuid, p_surface text, p_screen_key text, p_depth integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_screen_key is null or p_depth > 64 then
    return false;
  end if;
  if p_surface = 'onboarding' and private.is_uuid_text(p_screen_key) then
    if exists (select 1 from public.intake_screens s
                where s.id = p_screen_key::uuid and s.org_id = p_org_id and s.is_hidden) then
      return true;
    end if;
  elsif p_surface = 'onboarding' and private.is_app_follow_up(p_screen_key) then
    -- An app follow-up hides with the screen it follows (RAPP-720).
    return private.screen_is_hidden_at(p_org_id, p_surface,
      (select f.parent from private.app_follow_ups() f where f.screen = p_screen_key), p_depth + 1);
  elsif p_surface = 'onboarding' then
    return exists (select 1 from public.intake_builtin_screens b
                    where b.org_id = p_org_id and b.screen = p_screen_key and b.is_hidden)
           and private.builtin_screen_hideable(p_screen_key);
  elsif p_surface = 'custom_form' and private.is_uuid_text(p_screen_key) then
    if exists (select 1 from public.custom_form_screens s
                where s.id = p_screen_key::uuid and s.org_id = p_org_id and s.is_hidden) then
      return true;
    end if;
  else
    return false;
  end if;
  return private.screen_is_hidden_at(p_org_id, p_surface,
                                     private.screen_parent_key(p_org_id, p_surface, p_screen_key), p_depth + 1);
end;
$function$;

create or replace function private.screen_opens_for(p_profile_id uuid, p_org_id uuid, p_surface text, p_screen_key text, p_depth integer DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  is_live boolean;
  hidden boolean;
  depends_on uuid;
  opening text[];
  field public.profile_fields;
begin
  if p_screen_key is null then
    return true;
  end if;
  -- An app follow-up opens on her answer to its question, under its parent (RAPP-720).
  if p_surface = 'onboarding' and private.is_app_follow_up(p_screen_key) then
    return private.app_follow_up_opens_for(p_profile_id, p_org_id, p_screen_key)
       and private.screen_opens_for(p_profile_id, p_org_id, p_surface,
             (select f.parent from private.app_follow_ups() f where f.screen = p_screen_key), p_depth + 1);
  end if;
  if not private.is_uuid_text(p_screen_key) then
    return not private.screen_is_hidden(p_org_id, p_surface, p_screen_key);
  end if;
  if p_depth > 64 then
    return false;
  end if;
  if p_surface = 'onboarding' then
    select not s.is_archived, s.is_hidden, s.show_when_field_id, s.show_when_values
      into is_live, hidden, depends_on, opening
      from public.intake_screens s where s.id = p_screen_key::uuid and s.org_id = p_org_id;
  elsif p_surface = 'custom_form' then
    select not s.is_archived, s.is_hidden, s.show_when_field_id, s.show_when_values
      into is_live, hidden, depends_on, opening
      from public.custom_form_screens s where s.id = p_screen_key::uuid and s.org_id = p_org_id;
  else
    return true;
  end if;
  if not coalesce(is_live, false) or hidden then
    return false;
  end if;
  if depends_on is not null then
    select * into field from public.profile_fields where id = depends_on;
    if field.id is null or field.is_archived
       or not private.answer_matches(private.field_answer_now(p_profile_id, field), opening) then
      return false;
    end if;
  end if;
  return private.screen_opens_for(p_profile_id, p_org_id, p_surface,
                                  private.screen_parent_key(p_org_id, p_surface, p_screen_key), p_depth + 1);
end;
$function$;

create or replace function private.onboarding_open_screens(p_profile_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with her as (select p.org_id from public.profiles p where p.id = p_profile_id)
  select coalesce(array_agg(k.screen_key), array[]::text[])
    from (select distinct s.screen as screen_key from private.system_profile_fields() s
          union
          -- The app's follow-ups (RAPP-720).
          select f.screen from private.app_follow_ups() f
          union
          select i.id::text from public.intake_screens i, her
           where i.org_id = her.org_id and not i.is_archived) k, her
   where private.screen_opens_for(p_profile_id, her.org_id, 'onboarding', k.screen_key);
$function$;


-- 5. Seeding, showing a question again, the setup file ----------------------------------------------------

-- Places a follow-up's own fields (by system key) where the follow-up starts
-- with them: in their order and with their flags, on each follow-up whose
-- question is asked on her onboarding and that does not hold them yet.
create or replace function private.seed_follow_up_fields(p_org_id uuid, p_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  own record;
begin
  for own in
    select o.screen, o.place, o.required, f.id as field_id
      from private.app_follow_up_own_fields() o
      join private.app_follow_ups() u on u.screen = o.screen
      join public.profile_fields f on f.org_id = p_org_id and f.system_key = o.system_key and not f.is_archived
     where o.system_key = any (coalesce(p_keys, array[]::text[]))
       and exists (select 1 from public.field_placements h
                     join public.profile_fields head on head.id = h.field_id
                    where head.org_id = p_org_id and head.system_key = u.condition_key
                      and h.surface = 'onboarding')
       and not exists (select 1 from public.field_placements p
                        where p.field_id = f.id and p.surface = 'onboarding'
                          and (p.screen_key = o.screen or not private.can_share_field(p.screen_key, o.screen)))
     order by o.screen, o.place
  loop
    update public.field_placements
       set sort_order = sort_order + 1, updated_at = now()
     where org_id = p_org_id and surface = 'onboarding' and screen_key = own.screen
       and sort_order >= own.place;
    insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
    values (p_org_id, own.field_id, 'onboarding', own.screen, own.place, own.required);
  end loop;
end;
$$;
revoke all on function private.seed_follow_up_fields(uuid, text[]) from public, anon, authenticated;

create or replace function private.place_system_field_parts(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  part record;
  spot record;
  after_order integer;
begin
  for part in
    select f.id, f.system_key, s.part_of, s.question
      from private.system_profile_fields() s
      join public.profile_fields f on f.org_id = p_org_id and f.system_key = s.system_key
     where s.part_of is not null
     order by s.question, s.sort_order
  loop
    for spot in
      select p.surface, p.screen_key
        from public.field_placements p
        join public.profile_fields head on head.id = p.field_id
       where head.org_id = p_org_id and head.system_key = part.part_of
         and (p.surface <> 'entity_form' or part.system_key = any (private.system_entity_form_fields()))
         -- A follow-up's own field sits on the follow-up (RAPP-720).
         and (p.surface <> 'onboarding'
              or not exists (select 1 from private.app_follow_up_own_fields() o where o.system_key = part.system_key))
         and not exists (select 1 from public.field_placements mine
                          where mine.field_id = part.id and mine.surface = p.surface)
    loop
      select max(p.sort_order) into after_order
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = p_org_id and p.surface = spot.surface
         and p.screen_key is not distinct from spot.screen_key
         and private.system_key_question(f.system_key) = part.question;
      update public.field_placements
         set sort_order = sort_order + 1, updated_at = now()
       where org_id = p_org_id and surface = spot.surface
         and screen_key is not distinct from spot.screen_key and sort_order > after_order;
      insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
      values (p_org_id, part.id, spot.surface, spot.screen_key, after_order + 1, false);
    end loop;
  end loop;
end;
$function$;

create or replace function private.place_app_question(p_org_id uuid, p_question text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  head public.profile_fields := private.app_question_field(p_org_id, p_question);
  own_screen text := (select s.screen from private.system_profile_fields() s
                       where s.question = p_question and s.part_of is null);
begin
  if head.id is null then
    raise invalid_parameter_value using message = 'not a question of the wizard';
  end if;
  if not exists (select 1 from public.field_placements p where p.field_id = head.id and p.surface = 'onboarding') then
    insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
    values (p_org_id, head.id, 'onboarding', own_screen,
            coalesce((select max(p.sort_order) + 1 from public.field_placements p
                       where p.org_id = p_org_id and p.surface = 'onboarding' and p.screen_key = own_screen), 0),
            false);
  end if;
  if p_question = any (private.builtin_season_fields())
     and not exists (select 1 from public.field_placements p where p.field_id = head.id and p.surface = 'season') then
    insert into public.field_placements (org_id, field_id, surface, sort_order, required)
    values (p_org_id, head.id, 'season',
            coalesce((select max(p.sort_order) + 1 from public.field_placements p
                       where p.org_id = p_org_id and p.surface = 'season'), 0),
            false);
  end if;
  perform private.place_system_field_parts(p_org_id);
  -- And the follow-ups' own fields of the question (RAPP-720).
  perform private.seed_follow_up_fields(p_org_id, array(
    select s.system_key from private.system_profile_fields() s where s.question = p_question));
end;
$function$;

create or replace function private.seed_profile_layout(p_org_id uuid)
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
  on conflict (field_id, surface, custom_form_id, shared_screen) do nothing;

  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'season', (q.position - 1)::integer,
         q.question = any (private.default_required_intake_questions())
    from unnest(private.builtin_season_fields()) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = private.question_system_key(q.question)
  on conflict (field_id, surface, custom_form_id, shared_screen) do nothing;

  -- The entity form asks her name always; it requires nothing else (RAPP-300).
  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'entity_form', (q.position - 1)::integer,
         f.system_key = any (private.entity_form_always_asked())
    from unnest(private.system_entity_form_fields()) with ordinality as q(system_key, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = q.system_key
   where private.question_system_key(private.system_key_question(q.system_key)) = q.system_key
  on conflict (field_id, surface, custom_form_id, shared_screen) do nothing;

  perform private.place_system_field_parts(p_org_id);

  -- A part shown on one answer of its first part.
  update public.profile_fields child
     set show_when_field_id = gate.id, show_when_option_id = o.id, updated_at = now()
    from private.system_field_conditions() c
    join public.profile_fields gate on gate.org_id = p_org_id and gate.system_key = c.gate_key
    join public.custom_question_options o on o.question_id = gate.id and o.key = c.option_key
   where child.org_id = p_org_id and child.system_key = c.system_key and child.show_when_field_id is null;

  -- The follow-ups' own fields (RAPP-720).
  perform private.seed_follow_up_fields(p_org_id, array(
    select o.system_key from private.app_follow_up_own_fields() o));

  -- The authorization's Health screen fields (RAPP-698).
  perform private.seed_authorization_fields(p_org_id);
end;
$function$;

create or replace function private.seed_authorization_fields(p_org_id uuid)
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
  on conflict (field_id, surface, custom_form_id, shared_screen) do nothing;
end;
$function$;

create or replace function private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
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
  opening text[];
  -- An older file's follow-up fields, by system key (RAPP-720).
  older_own_fields text[] := array[]::text[];
  placed_key text;
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
      is_hidden, created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      -- An older file has no hide flag: the screen shows (RAPP-711).
      coalesce((item.value ->> 'is_hidden')::boolean, false),
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
  -- The follow-ups after the screens they follow, so a field's condition is
  -- placed before it (RAPP-720).
  for item in
    select value from jsonb_array_elements(document -> 'placements') with ordinality as p(value, place)
     order by private.is_app_follow_up(value ->> 'screen_key'), place
  loop
    if field_map ->> (item.value ->> 'field_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a question that is not in the file';
    end if;
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    -- An older file asks a follow-up's own field beside its question, where
    -- nothing drew it: it lands on its follow-ups as they start (RAPP-720).
    select f.system_key into placed_key from public.profile_fields f
     where f.id = (field_map ->> (item.value ->> 'field_id'))::uuid;
    if item.value ->> 'surface' = 'onboarding' and not private.is_app_follow_up(placed_screen)
       and exists (select 1 from private.app_follow_up_own_fields() o where o.system_key = placed_key) then
      older_own_fields := array_append(older_own_fields, placed_key);
      continue;
    end if;
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
  perform private.seed_follow_up_fields(p_org_id, older_own_fields);

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

  -- The screens that depend on an answer (RAPP-715): the question and its
  -- answers of the file, as this organization's. An older file has none.
  for item in
    select value from jsonb_array_elements(document -> 'screens')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    opening := array(
      select coalesce(option_map ->> v.value, case when v.value in ('yes', 'no', 'maybe') then v.value end)
        from jsonb_array_elements_text(
               case when jsonb_typeof(item.value -> 'show_when_values') = 'array'
                    then item.value -> 'show_when_values' else '[]'::jsonb end) with ordinality as v(value, n)
       order by v.n);
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or cardinality(opening) = 0 or array_position(opening, null) is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a screen depends on a question or answer that is not in the file';
    end if;
    update public.intake_screens
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_values = opening
     where id = (screen_map ->> (item.value ->> 'id'))::uuid;
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

  -- The app screens' wording. An older file's single document follow-up
  -- lands on the three document screens (RAPP-715).
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, coalesce(split.screen, b ->> 'screen'),
         coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b
    left join lateral unnest(
      case when b ->> 'screen' = 'documentation-details'
           then array['documentation-nie', 'documentation-passport', 'documentation-other'] end) as split(screen)
      on true
  on conflict (org_id, screen) do nothing;

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
  -- Every follow-up right after its parent (RAPP-715).
  perform private.keep_branches_after_parents(p_org_id, p_actor);

  -- A screen that asks something required or holds a signature shows (RAPP-711).
  update public.intake_screens s set is_hidden = false
   where s.org_id = p_org_id and s.is_hidden
     and private.screen_must_show(p_org_id, 'onboarding', s.id::text);

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


-- 6. Today's own fields move onto the follow-ups ------------------------------------------------------------
--
-- Each one sat beside its question on the question's own screen. It moves
-- to the follow-ups that draw it, in their order, with the flag her phone
-- used, and keeps any wording it had. One placed anywhere else (its question
-- asked off its own control) stays where it is.
do $$
declare
  org record;
  moved record;
  keys text[];
  wording jsonb;
begin
  for org in select o.id from public.organizations o loop
    keys := array[]::text[];
    wording := '{}'::jsonb;
    for moved in
      delete from public.field_placements p
       using public.profile_fields f, private.system_profile_fields() s
       where f.id = p.field_id and p.org_id = org.id and p.surface = 'onboarding'
         and s.system_key = f.system_key and p.screen_key = s.screen
         and f.system_key in (select o.system_key from private.app_follow_up_own_fields() o)
      returning f.system_key, p.label_override, p.help_override
    loop
      keys := array_append(keys, moved.system_key);
      wording := wording || jsonb_build_object(moved.system_key,
        jsonb_build_object('label', moved.label_override, 'help', moved.help_override));
    end loop;
    perform private.seed_follow_up_fields(org.id, keys);
    update public.field_placements p
       set label_override = private.json_value_or_null(wording -> f.system_key -> 'label'),
           help_override = private.json_value_or_null(wording -> f.system_key -> 'help')
      from public.profile_fields f
     where f.id = p.field_id and p.org_id = org.id and p.surface = 'onboarding'
       and private.is_app_follow_up(p.screen_key) and wording ? f.system_key
       and (wording -> f.system_key -> 'label' <> 'null'::jsonb or wording -> f.system_key -> 'help' <> 'null'::jsonb);
  end loop;
end;
$$;

-- Form kind, screen texts and legal-proof snapshots (RAPP-771).
--
-- WHY
--
-- Phase 1 of moving the legal forms (the app terms, the season authorization)
-- onto the form engine of Onboarding and Altres formularis. The engine has to
-- hold a legal document before the two forms move onto it (Phases 2 and 3):
--
--   - A form is Legal (listed under Condicions legals) or Altre (under Altres
--     formularis). The two legal forms will be rows of their own, each with a
--     system key, and are never archived.
--   - A legal form is published by an admin (settings.organization), she can
--     never put it off, and a test player sees its draft, as with the terms.
--   - A screen has a help line and its own button labels, like an app screen.
--   - What a version publishes is what she reads: the wording of every field,
--     consent and block is frozen in the version, and her consents are
--     recorded with the wording the version shows.
--   - Every signature offers "No puc signar".
--
-- WHAT THIS MIGRATION DOES
--
--   1. `custom_forms.kind` ('legal' | 'other', 'other' by default) and
--      `custom_forms.system_key` ('app_terms' | 'season_authorization'), one
--      per organization, only on a legal form, never archived.
--      `create_custom_form` takes the kind (the six-argument call still makes
--      an Altre form); `save_custom_form` changes it while the form was never
--      published.
--   2. `custom_form_screens.texts` and `intake_screens.texts` (help,
--      continue_label, decline_label), validated as `intake_builtin_screens.texts`
--      is. `custom_form_screens.system_screen` (terms_sign,
--      authorization_sign, reregistration, reregistration_season; set by the
--      later phases only): such a screen is never deleted and keeps its place.
--      `save_custom_form_screen` and `save_intake_screen` take the texts (the
--      four-argument calls keep them as they are).
--   3. `consent_placements.body_override`: a form's own wording of a consent,
--      saved with `save_consent_placement_wording`.
--   4. `form_signatures.unable_to_draw`: she said she cannot draw; the strokes
--      are then empty. `private.save_form_signatures` and
--      `complete_custom_form` take `{unable_to_draw: true, language}`, and
--      her page lists it (`participant_form_signatures`).
--   5. `private.custom_form_content` writes `schema: 2`: each screen's texts
--      and system screen, each field placement's wording as shown (`field`:
--      label, help, question type, settings, options), each consent
--      placement's key, name and text as shown (`consent`), and each block's
--      settings. Every key a version had before stays, so an older parser
--      reads it.
--   6. `publish_custom_form`: a legal form needs settings.organization. A
--      Correcció that adds a required question, a required consent or a
--      signature compared to the version it corrects is refused: players who
--      answered would never be asked it.
--   7. Her phone: `private.custom_form_version_for` gives a test player the
--      draft of a legal form, and `my_custom_forms` asks her it.
--      `dismiss_custom_form` refuses a legal form. `complete_custom_form`
--      records each consent with the key, text and requiredness of the
--      version. `intake_catalog` sends the kind, the system key, the texts,
--      and a placement's own consent wording.
--
-- AN OLDER APP BUILD
--
-- Every change is additive: the old calls work, the version keeps its old
-- keys, and an older build never sends "No puc signar". It reads a form's
-- live wording, as before.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html,
-- https://www.postgresql.org/docs/current/ddl-constraints.html,
-- https://www.postgresql.org/docs/current/sql-createfunction.html (default
-- arguments; an old call with fewer named arguments reaches the new function)
-- and https://supabase.com/docs/guides/database/functions (security definer
-- functions with an empty search path).

-- 1. The kind of a form -------------------------------------------------------------------------------------

alter table public.custom_forms
  add column kind text not null default 'other',
  add column system_key text,
  add constraint custom_forms_kind_check check (kind in ('legal', 'other')),
  add constraint custom_forms_system_key_check
    check (system_key is null or system_key in ('app_terms', 'season_authorization')),
  -- The two legal forms of the app are legal forms, and stay.
  add constraint custom_forms_system_form_is_legal check (system_key is null or kind = 'legal'),
  add constraint custom_forms_system_form_never_archived check (system_key is null or not is_archived);
create unique index custom_forms_one_system_form on public.custom_forms (org_id, system_key)
  where system_key is not null;
create index custom_forms_kind_idx on public.custom_forms (org_id, kind);
comment on column public.custom_forms.kind is
  'Legal (listed under Condicions legals, published by an admin, never put off) or other (RAPP-771).';
comment on column public.custom_forms.system_key is
  'The app terms or the season authorization as a form of their own (RAPP-771): one each, never archived.';

-- 2. Screen texts and system screens ------------------------------------------------------------------------

-- The help line and the button labels of a screen: the help may be cleared in
-- a language; a button label is a text in any language. The same rule as an
-- app screen's (`private.builtin_screen_texts_valid`).
create or replace function private.form_screen_texts_valid(p_texts jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_texts) = 'object'
    and not exists (
      select 1 from jsonb_each(p_texts) entry
       where not (entry.key = any (array['help', 'continue_label', 'decline_label']))
          or case
               when entry.key = 'help' then not private.optional_screen_text_valid(entry.value)
               when private.localized_text_valid(entry.value)
                 then exists (select 1 from jsonb_each_text(entry.value) language
                               where length(language.value) > 2000)
               else true
             end),
    false);
$$;
revoke all on function private.form_screen_texts_valid(jsonb) from public, anon, authenticated;

alter table public.custom_form_screens
  add column texts jsonb not null default '{}'::jsonb,
  add column system_screen text,
  add constraint custom_form_screens_texts_valid check (private.form_screen_texts_valid(texts)),
  add constraint custom_form_screens_system_screen_check check (system_screen is null or system_screen in (
    'terms_sign', 'authorization_sign', 'reregistration', 'reregistration_season'));
create unique index custom_form_screens_one_system_screen on public.custom_form_screens (form_id, system_screen)
  where system_screen is not null and not is_archived;
comment on column public.custom_form_screens.texts is
  'The screen''s help line and button labels (RAPP-771), as an app screen''s.';
comment on column public.custom_form_screens.system_screen is
  'A locked part of a legal form (RAPP-771): never deleted, never moved.';

alter table public.intake_screens
  add column texts jsonb not null default '{}'::jsonb,
  add constraint intake_screens_texts_valid check (private.form_screen_texts_valid(texts));
comment on column public.intake_screens.texts is
  'The Ramassà screen''s help line and button labels (RAPP-771), as an app screen''s.';

-- A system screen stays: archiving it (a delete) is refused, wherever it comes from.
create or replace function private.system_screen_stays()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_screen is not null and new.is_archived and not old.is_archived then
    raise check_violation using message = 'a system screen of a legal form is never deleted';
  end if;
  if old.system_screen is distinct from new.system_screen and old.system_screen is not null then
    raise check_violation using message = 'a system screen stays one';
  end if;
  return new;
end;
$$;
revoke all on function private.system_screen_stays() from public, anon, authenticated;
create trigger custom_form_screens_system_screen_stays
  before update on public.custom_form_screens
  for each row execute function private.system_screen_stays();

-- 3. A form's own wording of a consent ----------------------------------------------------------------------

alter table public.consent_placements
  add column body_override jsonb,
  add constraint consent_placements_body_override_valid
    check (body_override is null or private.localized_text_valid(body_override)),
  -- Onboarding and the authorization record the consent's own text; a form
  -- records the wording its version froze.
  add constraint consent_placements_body_override_on_a_form
    check (body_override is null or surface = 'custom_form');
comment on column public.consent_placements.body_override is
  'A form''s own wording of the consent (RAPP-771), per language; the consent''s text in a language left out.';

-- Rewords the consent on this form; null or an empty text gives back the consent's own.
create or replace function public.save_consent_placement_wording(p_placement_id uuid, p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  placement public.consent_placements;
  clean jsonb := (
    select nullif(coalesce(jsonb_object_agg(entry.key, btrim(entry.value #>> '{}')), '{}'::jsonb), '{}'::jsonb)
      from jsonb_each(case when jsonb_typeof(p_body) = 'object' then p_body else '{}'::jsonb end) entry
     where jsonb_typeof(entry.value) = 'string' and length(btrim(entry.value #>> '{}')) > 0);
begin
  select * into placement from public.consent_placements where id = p_placement_id and org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  if placement.surface <> 'custom_form' then
    raise check_violation using message = 'a consent is reworded on a form';
  end if;
  if clean is not null and not private.localized_text_valid(clean) then
    raise check_violation using message = 'a consent''s wording is text in the five languages';
  end if;
  update public.consent_placements set body_override = clean, updated_at = now() where id = placement.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.placement_wording', 'consent', placement.consent_id,
          jsonb_build_object('placement_id', placement.id, 'custom_form', placement.custom_form_id,
                             'body', clean));
end;
$$;
revoke all on function public.save_consent_placement_wording(uuid, jsonb) from public, anon;
grant execute on function public.save_consent_placement_wording(uuid, jsonb) to authenticated;

-- 4. "No puc signar" ----------------------------------------------------------------------------------------

alter table public.form_signatures
  add column unable_to_draw boolean not null default false;
alter table public.form_signatures alter column strokes drop not null;
alter table public.form_signatures drop constraint form_signatures_strokes_check;
alter table public.form_signatures
  add constraint form_signatures_strokes_check
    check (case when unable_to_draw then strokes is null else private.app_signature_valid(strokes) end);
comment on column public.form_signatures.unable_to_draw is
  'She said she cannot draw (RAPP-771): the text she accepted is kept, with no strokes.';

-- One signature as a form sends it: `{strokes, language}`, or `{unable_to_draw: true, language}`.
create or replace function private.form_signature_given_valid(p_given jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_given) = 'object'
    and coalesce(p_given ->> 'language', '') in ('ca', 'es', 'en', 'ar', 'fa')
    and case when p_given ? 'unable_to_draw'
             then p_given - array['unable_to_draw', 'language'] = '{}'::jsonb
                  and p_given -> 'unable_to_draw' = 'true'::jsonb
             else p_given - array['strokes', 'language'] = '{}'::jsonb
                  and private.app_signature_valid(p_given -> 'strokes') end,
    false);
$$;
revoke all on function private.form_signature_given_valid(jsonb) from public, anon, authenticated;

-- The body of `20261104130000_text_and_points_blocks.sql`, with "No puc signar".
create or replace function private.save_form_signatures(
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
  is_unable boolean;
begin
  if p_signatures is null or p_signatures = 'null'::jsonb then
    return 0;
  end if;
  if jsonb_typeof(p_signatures) <> 'object' then
    raise check_violation using message = 'signatures are sent by block';
  end if;
  for entry in select key, value from jsonb_each(p_signatures) loop
    if not private.is_uuid_text(entry.key) or not private.form_signature_given_valid(entry.value) then
      raise check_violation using message = 'a signature is its strokes and the language it was shown in';
    end if;
    -- The entity signs on the team's referral form: it always draws.
    is_unable := coalesce((entry.value ->> 'unable_to_draw')::boolean, false);
    if is_unable and p_surface not in ('wizard', 'custom_form') then
      raise check_violation using message = 'only a player says she cannot draw';
    end if;
    block := null;
    -- Only a signature block takes a signature (RAPP-770); any other is left out.
    select * into block from public.form_blocks b
     where b.id = entry.key::uuid and b.org_id = p_org_id and b.kind = 'signature'
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
      signer_kind, signer_user_id, signer_name, strokes, unable_to_draw, custom_form_id)
    values (
      p_org_id, p_profile_id, p_referral_id, p_surface, block.id, block.screen_key, shown, shown_language,
      case when p_surface in ('wizard', 'custom_form') then 'player' else 'entity' end, p_signer,
      coalesce(nullif(btrim(p_signer_name), ''), '-'),
      case when is_unable then null else entry.value -> 'strokes' end, is_unable,
      case when p_surface = 'custom_form' then p_custom_form_id end);
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;

-- Her signatures on her page, with "No puc signar".
drop function public.participant_form_signatures(uuid);
create function public.participant_form_signatures(p_profile_id uuid)
returns table (id uuid, surface text, block_id uuid, screen_key text, body text, language text,
               signer_kind text, signer_name text, strokes jsonb, signed_at timestamptz,
               signed_on_tablet boolean, witnessed_by_name text, unable_to_draw boolean)
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
  select g.id, g.surface, g.block_id, g.screen_key, g.body, g.language, g.signer_kind,
         -- The name she signed with, to a viewer who may read her name (RAPP-693).
         case when g.signer_kind = 'player' and g.profile_id is not null
                   and not private.can_read_name(g.profile_id, (select auth.uid()), 'first_name')
              then private.display_name(g.profile_id) else g.signer_name end,
         g.strokes, g.signed_at, g.signed_on_tablet,
         (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = g.witnessed_by),
         g.unable_to_draw
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

-- 5. Designing a form ---------------------------------------------------------------------------------------

-- The kind joins the choices. The six-argument call makes an Altre form.
drop function public.create_custom_form(jsonb, text, text, date, text, boolean);
create function public.create_custom_form(
  p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_audience text,
  p_repeats_each_season boolean, p_kind text default 'other')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
  form_kind text := coalesce(p_kind, 'other');
begin
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_audience);
  if form_kind not in ('legal', 'other') then
    raise check_violation using message = 'a form is legal or other';
  end if;
  insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                   repeats_each_season, kind, created_by)
  values (actor_org, p_name, p_filled_by, p_mandatory, p_deadline, p_audience,
          coalesce(p_repeats_each_season, false), form_kind, (select auth.uid()))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.create', 'custom_form', saved_id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'audience', p_audience,
                             'repeats_each_season', coalesce(p_repeats_each_season, false),
                             'kind', form_kind));
  return saved_id;
end;
$$;
revoke all on function public.create_custom_form(jsonb, text, text, date, text, boolean, text) from public, anon;
grant execute on function public.create_custom_form(jsonb, text, text, date, text, boolean, text) to authenticated;

-- The kind changes while the form was never published (null keeps it); a
-- system form stays legal.
drop function public.save_custom_form(uuid, jsonb, text, text, date, text, boolean);
create function public.save_custom_form(
  p_id uuid, p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_audience text,
  p_repeats_each_season boolean, p_kind text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
  form_kind text;
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null then
    raise no_data_found using message = 'no such form';
  end if;
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_audience);
  if coalesce(p_repeats_each_season, false) <> form.repeats_each_season and form.published_at is not null then
    raise check_violation using message = 'whether a form repeats stays once it was published';
  end if;
  form_kind := coalesce(p_kind, form.kind);
  if form_kind not in ('legal', 'other') then
    raise check_violation using message = 'a form is legal or other';
  end if;
  if form_kind <> form.kind and (form.published_at is not null or form.system_key is not null) then
    raise check_violation using message = 'a form keeps its kind once it was published';
  end if;
  update public.custom_forms
     set name = p_name, filled_by = p_filled_by, mandatory = p_mandatory, deadline = p_deadline,
         audience = p_audience, repeats_each_season = coalesce(p_repeats_each_season, false),
         kind = form_kind, updated_at = now()
   where id = form.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.save', 'custom_form', form.id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'audience', p_audience,
                             'repeats_each_season', coalesce(p_repeats_each_season, false),
                             'kind', form_kind));
end;
$$;
revoke all on function public.save_custom_form(uuid, jsonb, text, text, date, text, boolean, text) from public, anon;
grant execute on function public.save_custom_form(uuid, jsonb, text, text, date, text, boolean, text) to authenticated;

-- A system form stays, so Arxiva refuses it with its own message.
create or replace function public.archive_custom_form(p_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  if coalesce(p_archived, true) and exists (
    select 1 from public.custom_forms f where f.id = p_id and f.org_id = actor_org and f.system_key is not null) then
    raise check_violation using message = 'a system legal form is never archived';
  end if;
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

-- A screen's title, intro and texts. Texts left out (null) stay as they are;
-- `{}` clears them.
drop function public.save_custom_form_screen(uuid, uuid, jsonb, jsonb);
create function public.save_custom_form_screen(
  p_id uuid, p_form_id uuid, p_title jsonb, p_intro jsonb, p_texts jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  clean_intro jsonb := nullif(nullif(p_intro, 'null'::jsonb), '{}'::jsonb);
  clean_texts jsonb := nullif(p_texts, 'null'::jsonb);
  saved_id uuid;
begin
  if p_title is null or not private.catalan_text_valid(p_title) or not private.localized_text_valid(p_title) then
    raise check_violation using message = 'a screen needs its title in Catalan';
  end if;
  if clean_intro is not null and not private.localized_text_valid(clean_intro) then
    raise check_violation using message = 'an introduction is text in the five languages';
  end if;
  if clean_texts is not null and not private.form_screen_texts_valid(clean_texts) then
    raise check_violation using message = 'a screen''s texts are its help and its button labels';
  end if;
  if p_id is null then
    if not exists (select 1 from public.custom_forms f
                    where f.id = p_form_id and f.org_id = actor_org and not f.is_archived) then
      raise no_data_found using message = 'no such form';
    end if;
    insert into public.custom_form_screens (org_id, form_id, title, intro, texts, sort_order)
    values (actor_org, p_form_id, p_title, clean_intro, coalesce(clean_texts, '{}'::jsonb),
            coalesce((select max(s.sort_order) + 1 from public.custom_form_screens s
                       where s.form_id = p_form_id), 0))
    returning id into saved_id;
  else
    update public.custom_form_screens
       set title = p_title, intro = clean_intro, texts = coalesce(clean_texts, texts), updated_at = now()
     where id = p_id and org_id = actor_org and not is_archived
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.screen_save', 'custom_form_screen', saved_id,
          jsonb_build_object('created', p_id is null, 'title', p_title, 'intro', clean_intro,
                             'texts', clean_texts));
  return saved_id;
end;
$$;
revoke all on function public.save_custom_form_screen(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_custom_form_screen(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

-- The body of `20261022110000_flow_reset_restores_anchors.sql`, with the texts.
drop function public.save_intake_screen(uuid, jsonb, jsonb, text);
create function public.save_intake_screen(
  p_id uuid, p_title jsonb, p_intro jsonb, p_after_screen text, p_texts jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  clean_texts jsonb := nullif(p_texts, 'null'::jsonb);
  saved_id uuid;
  previous_anchor text;
begin
  if not private.catalan_text_valid(p_title) then
    raise check_violation using message = 'a screen needs a title in Catalan';
  end if;
  if clean_texts is not null and not private.form_screen_texts_valid(clean_texts) then
    raise check_violation using message = 'a screen''s texts are its help and its button labels';
  end if;
  if p_id is null then
    insert into public.intake_screens (org_id, title, intro, texts, after_screen, sort_order)
    values (actor_org, p_title, nullif(p_intro, 'null'::jsonb), coalesce(clean_texts, '{}'::jsonb), p_after_screen,
            coalesce((select max(sort_order) + 1 from public.intake_screens
                       where org_id = actor_org and after_screen = p_after_screen), 0))
    returning id into saved_id;
  else
    select after_screen into previous_anchor from public.intake_screens
     where id = p_id and org_id = actor_org;
    update public.intake_screens
       set title = p_title, intro = nullif(p_intro, 'null'::jsonb), texts = coalesce(clean_texts, texts),
           after_screen = p_after_screen,
           home_after_screen = case when previous_anchor is distinct from p_after_screen
                                    then p_after_screen else home_after_screen end,
           home_sort_order = case when previous_anchor is distinct from p_after_screen
                                  then sort_order else home_sort_order end,
           updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    if previous_anchor is distinct from p_after_screen then
      perform private.drop_from_intake_flow_order(actor_org, array[saved_id]);
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_save', 'intake_screen', saved_id,
          jsonb_build_object('after_screen', p_after_screen, 'created', p_id is null, 'texts', clean_texts));
  return saved_id;
end;
$$;
revoke all on function public.save_intake_screen(uuid, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.save_intake_screen(uuid, jsonb, jsonb, text, jsonb) to authenticated;

-- The body of `20261027060000_screens_that_depend_on_an_answer.sql`: a system
-- screen keeps its place.
create or replace function public.reorder_custom_form_screens(p_form_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  if exists (
    select 1
      from (select s.id, s.system_screen,
                   row_number() over (order by s.sort_order, s.created_at) - 1 as place
              from public.custom_form_screens s
             where s.org_id = actor_org and s.form_id = p_form_id and not s.is_archived) shown
     where shown.system_screen is not null
       and array_position(p_ids, shown.id) is distinct from (shown.place + 1)::integer) then
    raise check_violation using message = 'a system screen of a legal form keeps its place';
  end if;
  update public.custom_form_screens s
     set sort_order = array_position(p_ids, s.id) - 1, updated_at = now()
   where s.org_id = actor_org and s.form_id = p_form_id and s.id = any (p_ids);
  -- A follow-up stays right after its parent (RAPP-715).
  if exists (select 1 from public.custom_forms f where f.id = p_form_id and f.org_id = actor_org) then
    perform private.keep_form_branches_after_parents(p_form_id);
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.screens_reorder', 'custom_form', p_form_id,
          jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

-- 6. What a version publishes -------------------------------------------------------------------------------

-- A form's content as the draft holds it now: what a Publica freezes. Schema 2
-- (RAPP-771) adds the wording she reads; every key of schema 1 stays.
create or replace function private.custom_form_content(p_form_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema', 2,
    'name', f.name, 'mandatory', f.mandatory, 'deadline', f.deadline, 'kind', f.kind,
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'intro', s.intro,
                                          'sort_order', s.sort_order,
                                          -- The answer that opens it (RAPP-715).
                                          'show_when_field_id', s.show_when_field_id,
                                          'show_when_values', to_jsonb(s.show_when_values),
                                          -- Its help line and buttons, and its locked part (RAPP-771).
                                          'texts', s.texts, 'system_screen', s.system_screen)
                       order by s.sort_order, s.created_at)
        from public.custom_form_screens s
       where s.form_id = f.id and not s.is_archived
         -- A hidden screen, and the follow-ups of a hidden screen, are left out.
         and not private.screen_is_hidden(f.org_id, 'custom_form', s.id::text)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required, 'label_override', p.label_override, 'help_override', p.help_override,
        -- The question as she reads it, whatever the Fitxa says later (RAPP-771).
        'field', jsonb_build_object(
          'label', coalesce(fd.label, '{}'::jsonb) || coalesce(p.label_override, '{}'::jsonb),
          'help', case when fd.help is null and p.help_override is null then null
                       else coalesce(fd.help, '{}'::jsonb) || coalesce(p.help_override, '{}'::jsonb) end,
          'question_type', fd.question_type, 'settings', fd.settings,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object('id', o.id, 'key', o.key, 'label', o.label,
                                                'sort_order', o.sort_order)
                             order by o.sort_order, o.id)
              from public.custom_question_options o
             where o.question_id = fd.id and not o.is_archived), '[]'::jsonb)))
        order by p.screen_key, p.sort_order)
        from public.field_placements p
        join public.profile_fields fd on fd.id = p.field_id
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'screen_key', b.screen_key, 'kind', b.kind,
                                          'body', b.body, 'title', b.title, 'points', b.points,
                                          'settings', b.settings, 'sort_order', b.sort_order)
                       order by b.screen_key, b.sort_order)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = f.id
         and private.custom_form_screen_live(b.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', b.screen_key)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'consent_id', p.consent_id, 'screen_key', p.screen_key,
                                          'sort_order', p.sort_order, 'required', p.required,
                                          'body_override', p.body_override,
                                          -- The consent as she reads it (RAPP-771).
                                          'consent', jsonb_build_object(
                                            'key', c.key, 'name', c.name,
                                            'body', c.body || coalesce(p.body_override, '{}'::jsonb)))
                       order by p.screen_key, p.sort_order)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb))
    from public.custom_forms f where f.id = p_form_id;
$$;

-- 7. Publica ------------------------------------------------------------------------------------------------

-- What a Correcció may not add (RAPP-771): a required question, a required
-- consent, or a signature the corrected version did not ask. Null when it adds none.
create or replace function private.correction_adds_a_requirement(p_previous jsonb, p_next jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
           select 1 from jsonb_array_elements(coalesce(p_next -> 'placements', '[]'::jsonb)) p
            where (p ->> 'required')::boolean
              and not exists (select 1 from jsonb_array_elements(coalesce(p_previous -> 'placements', '[]'::jsonb)) q
                               where q ->> 'field_id' = p ->> 'field_id' and (q ->> 'required')::boolean))
      or exists (
           select 1 from jsonb_array_elements(coalesce(p_next -> 'consent_placements', '[]'::jsonb)) p
            where (p ->> 'required')::boolean
              and not exists (select 1 from jsonb_array_elements(coalesce(p_previous -> 'consent_placements', '[]'::jsonb)) q
                               where q ->> 'consent_id' = p ->> 'consent_id' and (q ->> 'required')::boolean))
      or exists (
           select 1 from jsonb_array_elements(coalesce(p_next -> 'blocks', '[]'::jsonb)) b
            where coalesce(b ->> 'kind', 'signature') = 'signature'
              and not exists (select 1 from jsonb_array_elements(coalesce(p_previous -> 'blocks', '[]'::jsonb)) c
                               where c ->> 'id' = b ->> 'id' and coalesce(c ->> 'kind', 'signature') = 'signature'));
$$;
revoke all on function private.correction_adds_a_requirement(jsonb, jsonb) from public, anon, authenticated;

-- The body of `20261027051100_screens_hidden_on_every_form.sql`, with the
-- legal rules and the Correcció rule.
create or replace function public.publish_custom_form(p_id uuid, p_is_correction boolean default false,
                                                      p_season_id uuid default null)
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
  next_content jsonb;
  corrected jsonb;
  is_live boolean;
  asked integer := 0;
  everyone uuid[];
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null or form.is_archived then
    raise no_data_found using message = 'no such form';
  end if;
  -- A legal form asks every player again: an admin decision, as the terms (RAPP-771).
  if form.kind = 'legal' and not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing a legal form needs settings.organization';
  end if;
  if not exists (select 1 from public.custom_form_screens s
                  where s.form_id = form.id and not s.is_archived and not s.is_hidden) then
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
  next_content := private.custom_form_content(form.id);
  if coalesce(p_is_correction, false) then
    select v.content into corrected
      from public.custom_form_versions v
     where v.form_id = form.id and v.season_id is not distinct from p_season_id
     order by v.version desc limit 1;
    if corrected is null then
      raise check_violation using message = 'a correction needs a published version to correct';
    end if;
    -- Who answered is not asked again: a correction may not ask her more (RAPP-771).
    if private.correction_adds_a_requirement(corrected, next_content) then
      raise check_violation
        using message = 'a correction adds no required question, consent or signature: publish a new version';
    end if;
  end if;

  select coalesce(max(v.version), 0) + 1 into next_version
    from public.custom_form_versions v where v.form_id = form.id;
  insert into public.custom_form_versions (org_id, form_id, version, season_id, content, is_correction, published_by)
  values (actor_org, form.id, next_version, p_season_id, next_content,
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

-- 8. Her phone ----------------------------------------------------------------------------------------------

-- The version she is shown: the live one, or for a test player the draft of a
-- legal form (as `private.app_terms_version_for`). The draft row stands for
-- the draft only: its id is the form's, its number the next one, and it is
-- never written.
create or replace function private.custom_form_version_for(p_form_id uuid, p_profile_id uuid)
returns setof public.custom_form_versions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  form public.custom_forms;
  draft public.custom_form_versions;
begin
  select * into form from public.custom_forms where id = p_form_id;
  if form.kind = 'legal' and private.sees_onboarding_drafts(p_profile_id)
     and exists (select 1 from public.profiles p where p.id = p_profile_id and p.org_id = form.org_id)
     and exists (select 1 from public.custom_form_screens s
                  where s.form_id = form.id and not s.is_archived and not s.is_hidden) then
    draft.id := form.id;
    draft.org_id := form.org_id;
    draft.form_id := form.id;
    draft.version := coalesce((select max(v.version) from public.custom_form_versions v
                                where v.form_id = form.id), 0) + 1;
    draft.season_id := case when form.repeats_each_season then private.current_season_id(form.org_id) end;
    draft.content := private.custom_form_content(form.id) || jsonb_build_object('is_draft', true);
    draft.is_correction := false;
    draft.published_at := now();
    return next draft;
    return;
  end if;
  return query select * from private.custom_form_live_version(p_form_id);
end;
$$;
revoke all on function private.custom_form_version_for(uuid, uuid) from public, anon, authenticated;

-- Her pending forms, as before, with their kind: she never puts off a legal
-- one. A test player is asked every legal form with a draft she was never
-- asked, so she sees the draft as players will.
drop function public.my_custom_forms();
create function public.my_custom_forms()
returns table (response_id uuid, form_id uuid, version integer, name jsonb, mandatory text,
               deadline date, is_blocking boolean, asked_at timestamptz, kind text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if private.sees_onboarding_drafts(caller) then
    insert into public.custom_form_responses (org_id, form_id, version, profile_id, season_id)
    select f.org_id, f.id, v.version, caller, v.season_id
      from public.custom_forms f
      join public.profiles me on me.id = caller and me.org_id = f.org_id and me.role = 'player'
      cross join lateral private.custom_form_version_for(f.id, caller) v
     where f.kind = 'legal' and f.filled_by = 'player' and not f.is_archived
       and caller = any (private.custom_form_audience(f.id))
       and not exists (select 1 from public.custom_form_responses r
                        where r.form_id = f.id and r.profile_id = caller)
    on conflict do nothing;
  end if;
  return query
  select r.id, f.id, v.version, v.content -> 'name', v.content ->> 'mandatory',
         (v.content ->> 'deadline')::date,
         private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date),
         r.asked_at, f.kind
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id
    cross join lateral private.custom_form_version_for(f.id, caller) v
   where r.profile_id = caller and r.status = 'pending'
     and f.filled_by = 'player' and not f.is_archived
     and jsonb_array_length(v.content -> 'screens') > 0
   order by private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date) desc,
            (v.content ->> 'deadline')::date nulls last, r.asked_at, r.id;
end;
$$;
revoke all on function public.my_custom_forms() from public, anon;
grant execute on function public.my_custom_forms() to authenticated;

-- A legal form is never put off (RAPP-771); an optional other form is, as before.
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
  if exists (select 1 from public.custom_forms f where f.id = response.form_id and f.kind = 'legal') then
    raise check_violation using message = 'a legal form cannot be put off';
  end if;
  if not exists (select 1 from private.custom_form_live_version(response.form_id) v
                  where v.content ->> 'mandatory' = 'optional') then
    raise check_violation using message = 'only an optional form can be closed';
  end if;
  update public.custom_form_responses set status = 'dismissed', answered_at = now(), answered_by = caller
   where id = response.id;
end;
$$;

-- The body of `20261104130000_text_and_points_blocks.sql`: the version she is
-- shown (a test player's legal draft too), "No puc signar", and each consent
-- recorded with the key, the text and the requiredness of the version.
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
$$;

-- The catalog: the kind and the system key of each form, each screen's texts
-- and system screen, a placement's own consent wording, the texts of a
-- Ramassà screen, and for a test player the draft of a legal form.
create or replace function public.intake_catalog()
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
        -- Legal or other, and the app's own legal forms (RAPP-771).
        'kind', f.kind, 'system_key', f.system_key,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons, and its locked part (RAPP-771).
            'texts', s.texts, 'system_screen', s.system_screen)
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
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        'sort_order', b.sort_order)
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
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived)
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
        'is_deleted', b.is_deleted,
        'is_hidden', b.is_deleted or (b.is_hidden and private.builtin_screen_hideable(b.screen)))
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
        'body', b.body, 'title', b.title, 'points', b.points, 'sort_order', b.sort_order)
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

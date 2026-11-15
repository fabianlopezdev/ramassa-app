-- The app terms as a legal form (RAPP-772).
--
-- WHY
--
-- Phase 2 of moving the legal forms onto the form engine (RAPP-770, RAPP-771).
-- "Condicions de l'app" were two fixed screens with fixed fields. Staff now
-- build them as any form: screens they add, reorder and delete, each with its
-- texts and its blocks (Text, Punts, questions of the Fitxa, consents of
-- Dades legals, signatures). The last screen stays: it holds the acceptance
-- she ticks and her signature, and neither can go.
--
-- The legal record does not move. `app_terms_versions`, `terms_acceptances`
-- and `app_terms_signatures` stay the ledger: a publish numbers a version
-- there (Correcció or Nova versió, RAPP-696), an acceptance names it, and her
-- signature hangs from her acceptance. What changes is where the text comes
-- from: the system form `custom_forms` (kind 'legal', system_key 'app_terms')
-- is the draft, and a publish freezes it into the version.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `app_terms_versions.form_snapshot` (the form as the version published
--      it, `private.custom_form_content`, schema 2) and `legacy_compatible`
--      (its old `content` says all of it, so an older app build may still
--      show and accept it). A published version always has both.
--   2. A system consent `app_terms` in Dades legals: "He llegit i accepto les
--      condicions", with its own history in `consent_events`.
--   3. The system form of each organization, built from its current draft or
--      else its current version: the introduction (title, intro, its points,
--      its help and button) unless staff deleted it (RAPP-761), then the
--      locked screen `terms_sign` (the title, the photo note as intro, the
--      text, the acceptance, the photo and video choice worded by the form,
--      the signature with "No puc signar", its help and buttons). Every
--      version gets its snapshot by the same converter; its `content` is
--      left exactly as it was. A new organization gets the form with its
--      version 1.
--   4. Locks: the `terms_sign` screen is never deleted, hidden, moved or made
--      to depend on an answer, and a new screen goes before it; its signature
--      and its acceptance are never removed, and the acceptance stays
--      required and asked on the terms only. The form keeps its choices.
--   5. Any change to the form keeps the organization's one draft row, so a
--      test player sees it (RAPP-619) and Publica has something to publish.
--      `save_app_terms_draft` (the setup import) rebuilds the form from old
--      content; `discard_app_terms_draft` puts the form back as the current
--      version published it.
--   6. `publish_app_terms_draft` freezes the form into the version, writes the
--      old `content` from it for older builds (the first text and points, the
--      acceptance and photo wording, the last screen's intro), refuses a
--      Correcció that asks more, clears a test player's records of the
--      draft, and copies the screens' help and buttons where an older build
--      reads them. Help and button texts reach players with the publish now
--      (they went live at once before, RAPP-761).
--   7. Her finish stays one transaction (`private.complete_onboarding_signed`)
--      and her new acceptance one call (`accept_current_app_terms`); both take
--      the form's answers, consents and signatures with the version she was
--      shown. The old calls keep working for a version whose old content
--      says all of it; otherwise they are refused with
--      `APP_TERMS/UPDATE_THE_APP`.
--   8. The form engine: the system form is never asked as a pending form,
--      never published with `publish_custom_form`, and her phone reads it
--      from the version she is shown (`intake_catalog`). A test player's
--      answers to a legal form's draft go when it is published (RAPP-771 left
--      them). The Onboarding screen keys 'terms-intro' and 'terms' take no
--      new deletion or texts: they are the form's screens now.
--
-- AN OLDER APP BUILD
--
-- It reads `terms.content` and the Ramassà texts of 'terms-intro' and
-- 'terms', which every publish keeps written, and finishes with the old call.
-- While a version is legacy compatible nothing changes for her. A version
-- with more than the old screens can be accepted only from the new build.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html (DISABLE
-- TRIGGER, as 20261022140000 did for the published-row guard),
-- https://www.postgresql.org/docs/current/sql-insert.html (ON CONFLICT with a
-- partial unique index), https://www.postgresql.org/docs/current/plpgsql-trigger.html
-- and https://supabase.com/docs/guides/database/functions (security definer
-- functions with an empty search path).

-- 1. The version keeps the form it published -----------------------------------------------------------------

alter table public.app_terms_versions
  add column form_snapshot jsonb,
  add column legacy_compatible boolean,
  add constraint app_terms_versions_form_snapshot_object
    check (form_snapshot is null or jsonb_typeof(form_snapshot) = 'object');
comment on column public.app_terms_versions.form_snapshot is
  'The terms form as this version published it (RAPP-772): private.custom_form_content, schema 2. Null on the draft, which is the form itself.';
comment on column public.app_terms_versions.legacy_compatible is
  'Its old content says all of the form (RAPP-772): an older app build may show and accept it. Null on the draft.';

-- 2. The acceptance as a consent of Dades legals -------------------------------------------------------------

create or replace function private.system_consent_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['participation', 'data_processing', 'code_of_conduct', 'health_data',
               'image_rights', 'newsletter', 'messaging_groups', 'app_terms']::text[];
$$;

create or replace function private.system_consent_name(p_key text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'participation' then '{"ca": "Participació i veracitat de les dades", "es": "Participación y veracidad de los datos", "en": "Participation and true information", "ar": "المشاركة وصحة البيانات", "fa": "مشارکت و درستی اطلاعات"}'::jsonb
    when 'data_processing' then '{"ca": "Tractament de dades", "es": "Tratamiento de datos", "en": "Data processing", "ar": "معالجة البيانات", "fa": "پردازش داده‌ها"}'::jsonb
    when 'code_of_conduct' then '{"ca": "Guia de temporada, protecció i codi de conducta", "es": "Guía de temporada, protección y código de conducta", "en": "Season guide, safeguarding and code of conduct", "ar": "دليل الموسم والحماية ومدونة السلوك", "fa": "راهنمای فصل، حفاظت و آیین‌نامه رفتاری"}'::jsonb
    when 'health_data' then '{"ca": "Dades de salut", "es": "Datos de salud", "en": "Health data", "ar": "البيانات الصحية", "fa": "داده‌های سلامت"}'::jsonb
    when 'image_rights' then '{"ca": "Drets d''imatge", "es": "Derechos de imagen", "en": "Image rights", "ar": "حقوق الصورة", "fa": "حق تصویر"}'::jsonb
    when 'newsletter' then '{"ca": "Butlletí i comunicacions", "es": "Boletín y comunicaciones", "en": "Newsletter and communications", "ar": "النشرة والمراسلات", "fa": "خبرنامه و ارتباطات"}'::jsonb
    when 'messaging_groups' then '{"ca": "Grups de missatgeria de l''equip", "es": "Grupos de mensajería del equipo", "en": "Team messaging groups", "ar": "مجموعات رسائل الفريق", "fa": "گروه‌های پیام‌رسان تیم"}'::jsonb
    -- The acceptance of the app terms (RAPP-772).
    when 'app_terms' then '{"ca": "Condicions de l''app", "es": "Condiciones de la aplicación", "en": "App terms", "ar": "شروط التطبيق", "fa": "شرایط برنامه"}'::jsonb
  end;
$$;

-- 3. The system form -----------------------------------------------------------------------------------------

-- The ids of the parts the converter writes: the same for every version of an
-- organization, so the form and each version's snapshot name the same screens.
-- A uuid that is always the same for one source text and that every uuid
-- reader accepts: the md5 of the text with the version (5, name based) and
-- the RFC 4122 variant set, as a strict reader such as zod's checks both.
create or replace function private.stable_uuid(p_source text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select (substr(h, 1, 12) || '5' || substr(h, 14, 3)
          || substr('89ab', (('x' || substr(h, 17, 1))::bit(4)::integer % 4) + 1, 1)
          || substr(h, 18))::uuid
    from (select md5(p_source) as h) source;
$$;
revoke all on function private.stable_uuid(text) from public, anon, authenticated;

create or replace function private.app_terms_stable_id(p_org_id uuid, p_part text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select private.stable_uuid(p_org_id::text || ':app_terms:' || p_part);
$$;
revoke all on function private.app_terms_stable_id(uuid, text) from public, anon, authenticated;

-- The text of the terms' own signature, which the old screen never showed.
create or replace function private.app_terms_signature_text()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"ca": "Amb la meva signatura accepto les condicions de l''app.", "es": "Con mi firma acepto las condiciones de la aplicación.", "en": "With my signature I accept the app terms.", "ar": "بتوقيعي أوافق على شروط التطبيق.", "fa": "با امضای خود شرایط برنامه را می‌پذیرم."}'::jsonb;
$$;
revoke all on function private.app_terms_signature_text() from public, anon, authenticated;

-- The organization's terms form; null before this migration built it.
create or replace function private.app_terms_form_id(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id from public.custom_forms f where f.org_id = p_org_id and f.system_key = 'app_terms';
$$;
revoke all on function private.app_terms_form_id(uuid) from public, anon, authenticated;

-- Creates the terms form (no screens yet) and returns it.
create or replace function private.ensure_app_terms_form(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  terms_form uuid := private.app_terms_form_id(p_org_id);
begin
  if terms_form is null then
    insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                     repeats_each_season, kind, system_key)
    values (p_org_id, private.system_consent_name('app_terms'), 'player', 'required_to_use_app', null, 'all',
            false, 'legal', 'app_terms')
    returning id into terms_form;
  end if;
  return terms_form;
end;
$$;
revoke all on function private.ensure_app_terms_form(uuid) from public, anon, authenticated;

-- A screen's texts as a form screen holds them: help, main button, decline.
create or replace function private.app_terms_screen_texts(p_texts jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when private.form_screen_texts_valid(clean.texts) then clean.texts else '{}'::jsonb end
    from (select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb) as texts
            from jsonb_each(case when jsonb_typeof(p_texts) = 'object' then p_texts else '{}'::jsonb end) entry
           where entry.key in ('help', 'continue_label', 'decline_label')) clean;
$$;
revoke all on function private.app_terms_screen_texts(jsonb) from public, anon, authenticated;

-- The old content of a version as the form's content (schema 2): the
-- introduction (unless deleted) and the locked last screen. The one converter
-- of this migration, the setup import and a new organization.
create or replace function private.app_terms_snapshot_from_content(
  p_org_id uuid, p_form_id uuid, p_content jsonb, p_intro_texts jsonb, p_sign_texts jsonb, p_with_intro boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select private.app_terms_stable_id(p_org_id, 'intro_screen') as intro_screen,
           private.app_terms_stable_id(p_org_id, 'sign_screen') as sign_screen,
           private.app_terms_stable_id(p_org_id, 'points_block') as points_block,
           private.app_terms_stable_id(p_org_id, 'text_block') as text_block,
           private.app_terms_stable_id(p_org_id, 'signature_block') as signature_block,
           private.app_terms_stable_id(p_org_id, 'accept_placement') as accept_placement,
           private.app_terms_stable_id(p_org_id, 'media_placement') as media_placement),
  accept as (select c.* from public.consents c where c.org_id = p_org_id and c.key = 'app_terms'),
  media as (select c.* from public.consents c
             where c.org_id = p_org_id and c.key = 'image_rights' and not c.is_archived)
  select jsonb_build_object(
    'schema', 2,
    'name', f.name, 'mandatory', f.mandatory, 'deadline', f.deadline, 'kind', f.kind,
    'screens',
      case when p_with_intro then jsonb_build_array(jsonb_build_object(
        'id', ids.intro_screen, 'title', p_content -> 'intro_title', 'intro', p_content -> 'intro',
        'sort_order', 0, 'show_when_field_id', null, 'show_when_values', null,
        'texts', private.app_terms_screen_texts(p_intro_texts) - 'decline_label', 'system_screen', null))
      else '[]'::jsonb end
      || jsonb_build_array(jsonb_build_object(
        'id', ids.sign_screen, 'title', p_content -> 'title', 'intro', p_content -> 'media_hint',
        'sort_order', 1, 'show_when_field_id', null, 'show_when_values', null,
        'texts', private.app_terms_screen_texts(p_sign_texts), 'system_screen', 'terms_sign')),
    'placements', '[]'::jsonb,
    'blocks',
      case when p_with_intro then jsonb_build_array(jsonb_build_object(
        'id', ids.points_block, 'screen_key', ids.intro_screen::text, 'kind', 'points', 'body', null,
        'title', null, 'points', p_content -> 'points', 'settings', '{}'::jsonb, 'sort_order', 0))
      else '[]'::jsonb end
      || jsonb_build_array(
        jsonb_build_object(
          'id', ids.text_block, 'screen_key', ids.sign_screen::text, 'kind', 'text', 'body', p_content -> 'body',
          'title', null, 'points', null, 'settings', '{}'::jsonb, 'sort_order', 0),
        jsonb_build_object(
          'id', ids.signature_block, 'screen_key', ids.sign_screen::text, 'kind', 'signature',
          'body', private.app_terms_signature_text(), 'title', null, 'points', null,
          'settings', '{"system": "terms_signature"}'::jsonb, 'sort_order', 3)),
    'consent_placements',
      coalesce((select jsonb_build_array(jsonb_build_object(
        'id', ids.accept_placement, 'consent_id', accept.id, 'screen_key', ids.sign_screen::text,
        'sort_order', 1, 'required', true, 'body_override', null,
        'consent', jsonb_build_object('key', 'app_terms', 'name', accept.name,
                                      'body', p_content -> 'accept_label'))) from accept), '[]'::jsonb)
      || coalesce((select jsonb_build_array(jsonb_build_object(
        'id', ids.media_placement, 'consent_id', media.id, 'screen_key', ids.sign_screen::text,
        'sort_order', 2, 'required', false, 'body_override', p_content -> 'media_label',
        'consent', jsonb_build_object('key', 'image_rights', 'name', media.name,
                                      'body', media.body || (p_content -> 'media_label')))) from media), '[]'::jsonb))
    from public.custom_forms f cross join ids
   where f.id = p_form_id;
$$;
revoke all on function private.app_terms_snapshot_from_content(uuid, uuid, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated;

-- Writes the form as a snapshot holds it: its screens, questions, blocks and
-- consents, by the snapshot's ids, so a signature already given keeps its
-- block. A screen out of the snapshot is archived; an item out of it goes.
create or replace function private.restore_app_terms_form(p_form_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  form public.custom_forms;
  changed integer;
begin
  select * into form from public.custom_forms where id = p_form_id for update;
  if form.id is null or form.system_key is distinct from 'app_terms' then
    raise no_data_found using message = 'no app terms form';
  end if;
  -- The form's own writes: no draft is opened, and its locked parts may move.
  perform set_config('ramassa.app_terms_form_sync', 'on', true);

  update public.custom_form_screens s set is_archived = true, updated_at = now()
   where s.form_id = form.id and not s.is_archived and s.system_screen is null
     and not exists (select 1 from jsonb_array_elements(p_snapshot -> 'screens') x where x ->> 'id' = s.id::text);
  insert into public.custom_form_screens (id, org_id, form_id, title, intro, sort_order, texts, system_screen)
  select (x ->> 'id')::uuid, form.org_id, form.id, x -> 'title', private.json_value_or_null(x -> 'intro'),
         (x ->> 'sort_order')::integer, coalesce(private.json_value_or_null(x -> 'texts'), '{}'::jsonb),
         x ->> 'system_screen'
    from jsonb_array_elements(p_snapshot -> 'screens') x
  on conflict (id) do update
    set title = excluded.title, intro = excluded.intro, sort_order = excluded.sort_order,
        texts = excluded.texts, is_archived = false, is_hidden = false,
        show_when_field_id = null, show_when_values = null, updated_at = now();

  -- Questions: the ones out of the snapshot go, a conditional one before its controlling one.
  loop
    delete from public.field_placements p
     where p.custom_form_id = form.id and p.surface = 'custom_form'
       and not exists (select 1 from jsonb_array_elements(p_snapshot -> 'placements') x where x ->> 'id' = p.id::text)
       and not exists (
         select 1 from public.profile_fields child
           join public.field_placements theirs on theirs.field_id = child.id
          where child.show_when_field_id = p.field_id and theirs.surface = p.surface
            and theirs.screen_key is not distinct from p.screen_key
            and theirs.custom_form_id is not distinct from p.custom_form_id);
    get diagnostics changed = row_count;
    exit when changed = 0;
  end loop;
  update public.field_placements p
     set sort_order = (x ->> 'sort_order')::integer, required = (x ->> 'required')::boolean,
         label_override = private.json_value_or_null(x -> 'label_override'),
         help_override = private.json_value_or_null(x -> 'help_override'), updated_at = now()
    from jsonb_array_elements(p_snapshot -> 'placements') x
   where p.id = (x ->> 'id')::uuid and p.custom_form_id = form.id;
  -- A controlling question comes back before the questions it opens.
  loop
    insert into public.field_placements (id, org_id, field_id, surface, screen_key, custom_form_id, sort_order,
                                         required, label_override, help_override)
    select (x ->> 'id')::uuid, form.org_id, f.id, 'custom_form', x ->> 'screen_key', form.id,
           (x ->> 'sort_order')::integer, (x ->> 'required')::boolean,
           private.json_value_or_null(x -> 'label_override'), private.json_value_or_null(x -> 'help_override')
      from jsonb_array_elements(p_snapshot -> 'placements') x
      join public.profile_fields f on f.id = (x ->> 'field_id')::uuid and f.org_id = form.org_id and not f.is_archived
     where not exists (select 1 from public.field_placements e where e.id = (x ->> 'id')::uuid)
       and not exists (select 1 from public.field_placements e
                        where e.field_id = f.id and e.surface = 'custom_form' and e.custom_form_id = form.id)
       and (f.show_when_field_id is null or exists (
             select 1 from public.field_placements g
              where g.field_id = f.show_when_field_id and g.custom_form_id = form.id
                and g.screen_key = x ->> 'screen_key'));
    get diagnostics changed = row_count;
    exit when changed = 0;
  end loop;

  delete from public.form_blocks b
   where b.custom_form_id = form.id and b.surface = 'custom_form'
     and not exists (select 1 from jsonb_array_elements(p_snapshot -> 'blocks') x where x ->> 'id' = b.id::text);
  insert into public.form_blocks (id, org_id, surface, screen_key, custom_form_id, kind, body, title, points,
                                  settings, sort_order)
  select (x ->> 'id')::uuid, form.org_id, 'custom_form', x ->> 'screen_key', form.id,
         coalesce(x ->> 'kind', 'signature'), private.json_value_or_null(x -> 'body'),
         private.json_value_or_null(x -> 'title'), private.json_value_or_null(x -> 'points'),
         coalesce(private.json_value_or_null(x -> 'settings'), '{}'::jsonb), (x ->> 'sort_order')::integer
    from jsonb_array_elements(p_snapshot -> 'blocks') x
  on conflict (id) do update
    set screen_key = excluded.screen_key, body = excluded.body, title = excluded.title,
        points = excluded.points, settings = excluded.settings, sort_order = excluded.sort_order,
        updated_at = now();

  delete from public.consent_placements p
   where p.custom_form_id = form.id and p.surface = 'custom_form'
     and not exists (select 1 from jsonb_array_elements(p_snapshot -> 'consent_placements') x
                      where x ->> 'id' = p.id::text);
  insert into public.consent_placements (id, org_id, consent_id, surface, screen_key, custom_form_id,
                                         sort_order, required, body_override)
  select (x ->> 'id')::uuid, form.org_id, c.id, 'custom_form', x ->> 'screen_key', form.id,
         (x ->> 'sort_order')::integer, (x ->> 'required')::boolean,
         private.json_value_or_null(x -> 'body_override')
    from jsonb_array_elements(p_snapshot -> 'consent_placements') x
    join public.consents c on c.id = (x ->> 'consent_id')::uuid and c.org_id = form.org_id and not c.is_archived
  on conflict (id) do update
    set screen_key = excluded.screen_key, sort_order = excluded.sort_order, required = excluded.required,
        body_override = excluded.body_override, updated_at = now();

  -- The answers that open a screen (RAPP-715), once their questions are back.
  update public.custom_form_screens s
     set show_when_field_id = (x ->> 'show_when_field_id')::uuid,
         show_when_values = array(select jsonb_array_elements_text(x -> 'show_when_values'))
    from jsonb_array_elements(p_snapshot -> 'screens') x
   where s.id = (x ->> 'id')::uuid and s.form_id = form.id
     and private.json_value_or_null(x -> 'show_when_field_id') is not null
     and exists (select 1 from public.profile_fields f
                  where f.id = (x ->> 'show_when_field_id')::uuid and not f.is_archived);
  perform set_config('ramassa.app_terms_form_sync', '', true);
end;
$$;
revoke all on function private.restore_app_terms_form(uuid, jsonb) from public, anon, authenticated;

-- A text of the old content: written in Catalan, in the five languages only.
create or replace function private.app_terms_text_or(p_text jsonb, p_fallback jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_text) = 'object' and length(btrim(coalesce(p_text ->> 'ca', ''))) > 0 then (
      select jsonb_object_agg(entry.key, btrim(entry.value #>> '{}'))
        from jsonb_each(p_text) entry
       where entry.key in ('ca', 'es', 'en', 'ar', 'fa') and jsonb_typeof(entry.value) = 'string'
         and length(btrim(entry.value #>> '{}')) > 0)
    else p_fallback end;
$$;
revoke all on function private.app_terms_text_or(jsonb, jsonb) from public, anon, authenticated;

-- What an older build reads of a snapshot (`content`), and whether that says
-- all of it (`compatible`). A part the old screens cannot hold keeps the
-- fallback's text, and the version is then not compatible.
create or replace function private.app_terms_form_legacy(p_snapshot jsonb, p_fallback jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  screens jsonb := (select coalesce(jsonb_agg(s order by (s ->> 'sort_order')::integer), '[]'::jsonb)
                      from jsonb_array_elements(coalesce(p_snapshot -> 'screens', '[]'::jsonb)) s);
  blocks jsonb := coalesce(p_snapshot -> 'blocks', '[]'::jsonb);
  asks jsonb := coalesce(p_snapshot -> 'consent_placements', '[]'::jsonb);
  sign jsonb;
  intro jsonb;
  text_block jsonb;
  points_block jsonb;
  signature_block jsonb;
  accept jsonb;
  media jsonb;
  content jsonb;
  compatible boolean;
begin
  select s into sign from jsonb_array_elements(screens) s where s ->> 'system_screen' = 'terms_sign' limit 1;
  if jsonb_array_length(screens) > 0 and private.json_value_or_null(screens -> 0 -> 'system_screen') is null then
    intro := screens -> 0;
  end if;
  select b into text_block from jsonb_array_elements(blocks) b
   where b ->> 'kind' = 'text'
   order by (b ->> 'screen_key' is not distinct from sign ->> 'id') desc, (b ->> 'sort_order')::integer limit 1;
  select b into points_block from jsonb_array_elements(blocks) b
   where b ->> 'kind' = 'points'
   order by (b ->> 'screen_key' is not distinct from intro ->> 'id') desc, (b ->> 'sort_order')::integer limit 1;
  select b into signature_block from jsonb_array_elements(blocks) b
   where b -> 'settings' ->> 'system' = 'terms_signature' limit 1;
  select p into accept from jsonb_array_elements(asks) p where p -> 'consent' ->> 'key' = 'app_terms' limit 1;
  select p into media from jsonb_array_elements(asks) p where p -> 'consent' ->> 'key' = 'image_rights' limit 1;

  content := jsonb_build_object(
    'title', private.app_terms_text_or(sign -> 'title', p_fallback -> 'title'),
    'body', private.app_terms_text_or(text_block -> 'body', p_fallback -> 'body'),
    'intro_title', private.app_terms_text_or(intro -> 'title', p_fallback -> 'intro_title'),
    'intro', private.app_terms_text_or(intro -> 'intro', p_fallback -> 'intro'),
    'points', case when private.form_points_valid(points_block -> 'points') then points_block -> 'points'
                   else p_fallback -> 'points' end,
    'accept_label', private.app_terms_text_or(accept -> 'consent' -> 'body', p_fallback -> 'accept_label'),
    'media_label', private.app_terms_text_or(media -> 'consent' -> 'body', p_fallback -> 'media_label'),
    'media_hint', private.app_terms_text_or(sign -> 'intro', p_fallback -> 'media_hint'));

  compatible := sign is not null
    -- The old screens: the introduction (unless deleted), then the terms.
    and sign = screens -> (jsonb_array_length(screens) - 1)
    and jsonb_array_length(screens) = case when intro is null then 1 else 2 end
    and not exists (select 1 from jsonb_array_elements(screens) s
                     where private.json_value_or_null(s -> 'show_when_field_id') is not null)
    and jsonb_array_length(coalesce(p_snapshot -> 'placements', '[]'::jsonb)) = 0
    -- The acceptance and the photo choice, on the terms.
    and jsonb_array_length(asks) = 2
    and accept is not null and (accept ->> 'required')::boolean and accept ->> 'screen_key' = sign ->> 'id'
    and media is not null and not (media ->> 'required')::boolean and media ->> 'screen_key' = sign ->> 'id'
    and private.app_terms_text_or(accept -> 'consent' -> 'body', null) is not null
    and private.app_terms_text_or(media -> 'consent' -> 'body', null) is not null
    -- The text and the signature on the terms, the points on the introduction.
    and jsonb_array_length(blocks) = case when intro is null then 2 else 3 end
    and text_block is not null and text_block ->> 'screen_key' = sign ->> 'id'
    and private.json_value_or_null(text_block -> 'title') is null
    and private.app_terms_text_or(text_block -> 'body', null) is not null
    and signature_block is not null and signature_block ->> 'screen_key' = sign ->> 'id'
    and signature_block -> 'body' = private.app_terms_signature_text()
    and private.app_terms_text_or(sign -> 'title', null) is not null
    and private.app_terms_text_or(sign -> 'intro', null) is not null
    and (intro is null or (
      points_block is not null and points_block ->> 'screen_key' = intro ->> 'id'
      and private.form_points_valid(points_block -> 'points')
      and private.app_terms_text_or(intro -> 'title', null) is not null
      and private.app_terms_text_or(intro -> 'intro', null) is not null));
  return jsonb_build_object('content', content, 'compatible', coalesce(compatible, false));
end;
$$;
revoke all on function private.app_terms_form_legacy(jsonb, jsonb) from public, anon, authenticated;

-- What a version shows: its snapshot, or the form itself for the draft.
create or replace function private.app_terms_version_snapshot(p_version public.app_terms_versions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_version.id is null then null
    when p_version.published_at is null then (
      select private.custom_form_content(f.id) || jsonb_build_object('is_draft', true)
        from public.custom_forms f where f.org_id = p_version.org_id and f.system_key = 'app_terms')
    else p_version.form_snapshot end;
$$;
revoke all on function private.app_terms_version_snapshot(public.app_terms_versions) from public, anon, authenticated;

-- Whether an older build may show and accept the version.
create or replace function private.app_terms_version_compatible(p_version public.app_terms_versions)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_version.id is null then true
    when p_version.published_at is not null then coalesce(p_version.legacy_compatible, true)
    else coalesce((private.app_terms_form_legacy(private.app_terms_version_snapshot(p_version),
                                                 p_version.content) ->> 'compatible')::boolean, true) end;
$$;
revoke all on function private.app_terms_version_compatible(public.app_terms_versions) from public, anon, authenticated;

-- What an older build reads as the version's content: the draft's, from the form.
create or replace function private.app_terms_version_content(p_version public.app_terms_versions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_version.published_at is null and private.app_terms_version_snapshot(p_version) is not null
      then private.app_terms_form_legacy(private.app_terms_version_snapshot(p_version), p_version.content) -> 'content'
    else p_version.content end;
$$;
revoke all on function private.app_terms_version_content(public.app_terms_versions) from public, anon, authenticated;

-- 4. The locked parts ----------------------------------------------------------------------------------------

-- The body of `20261104140000_form_kind_and_legal_snapshot.sql`: a system
-- screen is also never hidden and never depends on an answer (RAPP-772).
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
  if old.system_screen is not null and new.is_hidden and not old.is_hidden then
    raise check_violation using message = 'a system screen of a legal form is never hidden';
  end if;
  if old.system_screen is not null and new.show_when_field_id is not null
     and old.show_when_field_id is null then
    raise check_violation using message = 'a system screen of a legal form always shows';
  end if;
  return new;
end;
$$;

-- A new screen of a legal form goes before its closing system screen (the
-- terms she signs, the authorization's signature), which stays the last one.
create or replace function private.form_screen_before_closing_screen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  closing public.custom_form_screens;
begin
  if new.system_screen is not null or current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return new;
  end if;
  select * into closing from public.custom_form_screens s
   where s.form_id = new.form_id and not s.is_archived and s.system_screen in ('terms_sign', 'authorization_sign');
  if closing.id is not null and new.sort_order >= closing.sort_order then
    new.sort_order := closing.sort_order;
    update public.custom_form_screens set sort_order = closing.sort_order + 1, updated_at = now()
     where id = closing.id;
  end if;
  return new;
end;
$$;
revoke all on function private.form_screen_before_closing_screen() from public, anon, authenticated;
create trigger custom_form_screens_before_closing_screen
  before insert on public.custom_form_screens
  for each row execute function private.form_screen_before_closing_screen();

-- The terms' signature stays on its screen: never removed, its kind and its
-- mark kept. The form's own writes move it; an organization that goes takes it.
create or replace function private.locked_form_block_stays()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.settings ->> 'system' is null or current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise check_violation using message = 'the signature of the app terms is never removed';
    end if;
    return old;
  end if;
  if new.settings is distinct from old.settings or new.kind <> old.kind or new.screen_key is distinct from old.screen_key then
    raise check_violation using message = 'the signature of the app terms stays where it is';
  end if;
  return new;
end;
$$;
revoke all on function private.locked_form_block_stays() from public, anon, authenticated;
create trigger form_blocks_locked_stays
  before update or delete on public.form_blocks
  for each row execute function private.locked_form_block_stays();

-- The acceptance (`app_terms`) is asked on the terms only, on its screen,
-- always required, and never removed.
create or replace function private.app_terms_acceptance_stays()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_acceptance boolean;
  on_terms boolean;
begin
  if current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select c.key = 'app_terms' into is_acceptance from public.consents c
   where c.id = case when tg_op = 'DELETE' then old.consent_id else new.consent_id end;
  if not coalesce(is_acceptance, false) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    select exists (select 1 from public.custom_forms f where f.id = new.custom_form_id and f.system_key = 'app_terms')
      into on_terms;
    if new.surface <> 'custom_form' or not on_terms then
      raise check_violation using message = 'the acceptance of the app terms is asked on the app terms only';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise check_violation using message = 'the acceptance of the app terms is never removed';
    end if;
    return old;
  end if;
  if not new.required or new.screen_key is distinct from old.screen_key then
    raise check_violation using message = 'the acceptance of the app terms stays required, on its screen';
  end if;
  return new;
end;
$$;
revoke all on function private.app_terms_acceptance_stays() from public, anon, authenticated;
create trigger consent_placements_app_terms_acceptance_stays
  before insert or update or delete on public.consent_placements
  for each row execute function private.app_terms_acceptance_stays();

-- The acceptance consent itself is never archived.
create or replace function private.app_terms_consent_stays()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.key = 'app_terms' and new.is_archived and not old.is_archived then
    raise check_violation using message = 'the acceptance of the app terms is never archived';
  end if;
  return new;
end;
$$;
revoke all on function private.app_terms_consent_stays() from public, anon, authenticated;
create trigger consents_app_terms_stays
  before update on public.consents
  for each row execute function private.app_terms_consent_stays();

-- The terms form is asked of every player, to use the app, once: its choices stay.
create or replace function private.app_terms_form_choices_stay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_key = 'app_terms'
     and (new.filled_by <> old.filled_by or new.mandatory <> old.mandatory
          or new.deadline is distinct from old.deadline or new.audience <> old.audience
          or new.repeats_each_season <> old.repeats_each_season) then
    raise check_violation using message = 'the app terms are asked of every player, to use the app';
  end if;
  return new;
end;
$$;
revoke all on function private.app_terms_form_choices_stay() from public, anon, authenticated;
create trigger custom_forms_app_terms_choices_stay
  before update on public.custom_forms
  for each row execute function private.app_terms_form_choices_stay();

-- 5. A change to the form opens the draft ------------------------------------------------------------------

-- The organization's one draft row: what a test player is shown and what
-- Publica numbers. Its content stays the version's until the publish.
create or replace function private.touch_app_terms_draft(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return;
  end if;
  insert into public.app_terms_versions (org_id, content, updated_by)
  select p_org_id, current_version.content, (select auth.uid())
    from private.current_app_terms_version(p_org_id) current_version
   where current_version.id is not null
  on conflict (org_id) where published_at is null
  do update set updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
revoke all on function private.touch_app_terms_draft(uuid) from public, anon, authenticated;

create or replace function private.app_terms_form_touched()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  terms_form uuid;
  touched_org uuid;
begin
  if current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return null;
  end if;
  if tg_table_name = 'consents' then
    select p.custom_form_id into terms_form
      from public.consent_placements p join public.custom_forms f on f.id = p.custom_form_id
     where p.consent_id = new.id and f.system_key = 'app_terms' limit 1;
  elsif tg_table_name = 'custom_form_screens' then
    if tg_op = 'DELETE' then terms_form := old.form_id; else terms_form := new.form_id; end if;
  elsif tg_op = 'DELETE' then
    terms_form := old.custom_form_id;
  else
    terms_form := new.custom_form_id;
  end if;
  if terms_form is null then
    return null;
  end if;
  select f.org_id into touched_org from public.custom_forms f where f.id = terms_form and f.system_key = 'app_terms';
  if touched_org is not null then
    perform private.touch_app_terms_draft(touched_org);
  end if;
  return null;
end;
$$;
revoke all on function private.app_terms_form_touched() from public, anon, authenticated;

-- 6. The ledger: draft, discard, publish, a new organization -------------------------------------------------

-- The old call (the Onboarding setup import): the form is rebuilt from the
-- old content, keeping its screens' texts, and the draft holds it.
create or replace function public.save_app_terms_draft(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  terms_form uuid;
  saved uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the app terms need settings.organization or onboarding.design';
  end if;
  if not private.app_terms_content_valid(p_content) then
    raise check_violation using message = 'app terms need every field, in Catalan at least';
  end if;
  terms_form := private.ensure_app_terms_form(actor_org);
  perform private.restore_app_terms_form(terms_form, private.app_terms_snapshot_from_content(
    actor_org, terms_form, p_content,
    (select s.texts from public.custom_form_screens s
      where s.id = private.app_terms_stable_id(actor_org, 'intro_screen') and s.form_id = terms_form),
    (select s.texts from public.custom_form_screens s
      where s.form_id = terms_form and s.system_screen = 'terms_sign' and not s.is_archived),
    -- The introduction comes back unless the form went without it.
    not exists (select 1 from public.custom_form_screens s where s.form_id = terms_form and not s.is_archived)
      or exists (select 1 from public.custom_form_screens s
                  where s.form_id = terms_form and not s.is_archived and s.system_screen is null)));
  update public.app_terms_versions
     set content = p_content, updated_at = now(), updated_by = actor
   where org_id = actor_org and published_at is null
  returning id into saved;
  if saved is null then
    insert into public.app_terms_versions (org_id, content, updated_by)
    values (actor_org, p_content, actor)
    returning id into saved;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'app_terms.draft_saved', 'app_terms_version', saved,
          jsonb_build_object('languages', (
            select jsonb_agg(distinct language order by language)
              from jsonb_object_keys(p_content -> 'body') language)));
  return saved;
end;
$$;

-- The form goes back to the current version, and the draft row goes with
-- the test players' acceptances of it.
create or replace function public.discard_app_terms_draft()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  current_version public.app_terms_versions;
  terms_form uuid;
  discarded uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the app terms need settings.organization or onboarding.design';
  end if;
  perform 1 from public.organizations where id = actor_org for update;
  current_version := private.current_app_terms_version(actor_org);
  terms_form := private.app_terms_form_id(actor_org);
  if terms_form is not null and current_version.form_snapshot is not null then
    perform private.restore_app_terms_form(terms_form, current_version.form_snapshot);
  end if;
  delete from public.app_terms_versions
   where org_id = actor_org and published_at is null
  returning id into discarded;
  if discarded is not null then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (actor_org, (select auth.uid()), 'app_terms.draft_discarded', 'app_terms_version', discarded,
            '{}'::jsonb);
  end if;
end;
$$;

-- The body of `20261022060000_app_terms_versions.sql` (RAPP-696 corrections):
-- the version freezes the form, writes the old content from it, and keeps
-- the screens' texts where an older build reads them.
create or replace function public.publish_app_terms_draft(p_is_correction boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.app_terms_versions;
  previous public.app_terms_versions;
  next_number integer;
  draft_acceptances integer;
  terms_form uuid;
  snapshot jsonb;
  legacy jsonb;
  sign jsonb;
  intro jsonb;
begin
  -- Publishing asks every player again: an admin decision, not a design one.
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the app terms needs settings.organization';
  end if;
  if p_is_correction is null then
    raise invalid_parameter_value using message = 'say whether this is a correction';
  end if;
  select * into draft from public.app_terms_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  -- One publish at a time per organization.
  perform 1 from public.organizations where id = actor_org for update;
  previous := private.current_app_terms_version(actor_org);
  -- A correction fixes a published version (RAPP-696).
  if p_is_correction and previous.id is null then
    raise object_not_in_prerequisite_state
      using message = 'a correction needs a published version to correct';
  end if;

  terms_form := private.app_terms_form_id(actor_org);
  if terms_form is not null then
    snapshot := private.custom_form_content(terms_form);
    if not exists (select 1 from jsonb_array_elements(snapshot -> 'screens') s
                    where s ->> 'system_screen' = 'terms_sign') then
      raise check_violation using message = 'the app terms end on the screen she signs';
    end if;
    -- Who accepted is not asked again: a correction may not ask her more (RAPP-771).
    if p_is_correction and previous.form_snapshot is not null
       and private.correction_adds_a_requirement(previous.form_snapshot, snapshot) then
      raise check_violation
        using message = 'a correction adds no required question, consent or signature: publish a new version';
    end if;
    legacy := private.app_terms_form_legacy(snapshot, coalesce(previous.content, draft.content));
  end if;

  -- Test players' records of the draft go: a published version never carries
  -- one (RAPP-619), nor their ticks and signatures of its form.
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  delete from public.consent_events e
   using public.terms_acceptances t
   where t.version_id = draft.id and e.profile_id = t.profile_id
     -- recorded with her acceptance of the draft, in the same transaction.
     and e.custom_form_id = terms_form and e.decided_at = t.accepted_at;
  perform set_config('ramassa.consent_event_erasure', '', true);
  delete from public.form_signatures g
   using public.terms_acceptances t
   where t.version_id = draft.id and g.profile_id = t.profile_id
     and g.custom_form_id = terms_form and g.signed_at = t.accepted_at;
  delete from public.terms_acceptances where version_id = draft.id;
  get diagnostics draft_acceptances = row_count;

  select coalesce(max(version_number), 0) + 1 into next_number
    from public.app_terms_versions where org_id = actor_org;
  update public.app_terms_versions
     set version_number = next_number, published_at = now(), published_by = actor,
         is_correction = p_is_correction,
         content = coalesce(legacy -> 'content', content),
         form_snapshot = coalesce(snapshot, form_snapshot),
         legacy_compatible = coalesce((legacy ->> 'compatible')::boolean, true)
   where id = draft.id;

  if terms_form is not null then
    update public.custom_forms
       set version = next_number, published_at = coalesce(published_at, now()), updated_at = now()
     where id = terms_form;
    -- An older build reads the help and buttons of 'terms-intro' and 'terms',
    -- and leaves out a deleted introduction (RAPP-761).
    select s into sign from jsonb_array_elements(snapshot -> 'screens') s where s ->> 'system_screen' = 'terms_sign';
    select s into intro from jsonb_array_elements(snapshot -> 'screens') s
     where private.json_value_or_null(s -> 'system_screen') is null
     order by (s ->> 'sort_order')::integer limit 1;
    insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, is_deleted, updated_by)
    select actor_org, 'terms', texts.value, false, false, actor
      from (select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb) as value
              from jsonb_each(coalesce(sign -> 'texts', '{}'::jsonb)) entry
             where entry.key = any (private.builtin_screen_text_fields('terms'))) texts
     where private.builtin_screen_texts_valid('terms', texts.value)
    on conflict (org_id, screen) do update
      set texts = excluded.texts, updated_at = now(), updated_by = excluded.updated_by;
    insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, is_deleted, updated_by)
    select actor_org, 'terms-intro', case when intro is null then '{}'::jsonb else texts.value end,
           intro is null, intro is null, actor
      from (select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb) as value
              from jsonb_each(coalesce(intro -> 'texts', '{}'::jsonb)) entry
             where entry.key = any (private.builtin_screen_text_fields('terms-intro'))) texts
     where intro is null or private.builtin_screen_texts_valid('terms-intro', texts.value)
    on conflict (org_id, screen) do update
      set texts = excluded.texts, is_hidden = excluded.is_hidden, is_deleted = excluded.is_deleted,
          updated_at = now(), updated_by = excluded.updated_by;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'app_terms.publish', 'app_terms_version', draft.id,
          jsonb_build_object('version_number', next_number, 'is_correction', p_is_correction,
                             'test_acceptances_dropped', draft_acceptances,
                             'legacy_compatible', coalesce((legacy ->> 'compatible')::boolean, true)));
  return next_number;
end;
$$;

-- A new organization: its consents, its terms form and version 1, the text
-- the app bundled, as one.
create or replace function private.create_app_terms_version_one()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  terms_form uuid;
  snapshot jsonb;
begin
  perform set_config('ramassa.app_terms_form_sync', 'on', true);
  perform private.seed_system_consents(new.id);
  update public.consents set body = private.app_terms_version_one() -> 'accept_label'
   where org_id = new.id and key = 'app_terms' and body = private.system_consent_name('app_terms');
  terms_form := private.ensure_app_terms_form(new.id);
  snapshot := private.app_terms_snapshot_from_content(new.id, terms_form, private.app_terms_version_one(),
                                                      '{}'::jsonb, '{}'::jsonb, true);
  perform private.restore_app_terms_form(terms_form, snapshot);
  insert into public.app_terms_versions (org_id, version_number, content, published_at, form_snapshot,
                                         legacy_compatible)
  values (new.id, 1, private.app_terms_version_one(), now(), snapshot, true)
  on conflict (org_id, version_number) do nothing;
  update public.custom_forms set version = 1, published_at = now() where id = terms_form;
  perform set_config('ramassa.app_terms_form_sync', '', true);
  return new;
end;
$$;

-- 7. Her acceptance ------------------------------------------------------------------------------------------

-- What her phone sends for the terms form: her answers by field, her ticks by
-- consent key, her signatures by block (`{strokes, language}` or
-- `{unable_to_draw: true, language}`), the language she read, the device and,
-- when she joins, the version she was shown.
create or replace function private.app_terms_given_valid(p_given jsonb, p_names_version boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_given) = 'object'
    and p_given - array['version_id', 'language', 'answers', 'consents', 'signatures', 'device'] = '{}'::jsonb
    and (not p_names_version or private.is_uuid_text(p_given ->> 'version_id'))
    and coalesce(p_given ->> 'language', '') in ('ca', 'es', 'en', 'ar', 'fa')
    and jsonb_typeof(p_given -> 'consents') = 'object'
    and not exists (select 1 from jsonb_each(p_given -> 'consents') t where jsonb_typeof(t.value) <> 'boolean')
    and jsonb_typeof(p_given -> 'signatures') = 'object'
    and coalesce(jsonb_typeof(p_given -> 'answers'), 'object') in ('object', 'null')
    and length(coalesce(p_given ->> 'device', '')) <= 200,
    false);
$$;
revoke all on function private.app_terms_given_valid(jsonb, boolean) from public, anon, authenticated;

-- Her acceptance of the terms form, once her acceptance row exists: every
-- required question answered, every signature given (the terms' own one is
-- her signature of the acceptance), every consent recorded with the wording
-- the version froze. Her answers are already saved.
create or replace function private.record_app_terms_form(
  p_profile_id uuid, p_form_id uuid, p_snapshot jsonb, p_given jsonb, p_acceptance_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  her public.profiles;
  ticks jsonb := p_given -> 'consents';
  signatures jsonb := p_given -> 'signatures';
  shown_language text := p_given ->> 'language';
  block jsonb;
  given jsonb;
  block_language text;
  is_unable boolean;
  main_given jsonb;
  asked record;
  media boolean;
begin
  select * into her from public.profiles where id = p_profile_id;
  if p_snapshot is null then
    raise object_not_in_prerequisite_state using message = 'the app terms have no form to accept';
  end if;
  -- Every required question the version asks has an answer (shown on its condition).
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_snapshot -> 'placements', '[]'::jsonb)) p
      join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived
     where (p ->> 'required')::boolean
       and private.content_screen_opens(p_profile_id, p_snapshot, p ->> 'screen_key')
       and (f.show_when_field_id is null or exists (
             select 1 from public.profile_fields gate
              where gate.id = f.show_when_field_id
                and private.field_answer_now(p_profile_id, gate) = to_jsonb(f.show_when_option_id::text)))
       and private.field_answer_now(p_profile_id, f) is null
  ) then
    raise not_null_violation using message = 'the app terms require an answer to a required question';
  end if;

  -- Her ticks: only of the consents the version asks, each required one given.
  if exists (select 1 from jsonb_each(ticks) t
              where not exists (
                select 1 from jsonb_array_elements(p_snapshot -> 'consent_placements') p
                 where p -> 'consent' ->> 'key' = t.key)) then
    raise check_violation using message = 'her consents are ticks of the consents the terms ask';
  end if;
  for asked in
    select c.id, p -> 'consent' ->> 'key' as key, coalesce(p -> 'consent' -> 'body', c.body) as body,
           (p ->> 'required')::boolean as required, p ->> 'screen_key' as screen_key
      from jsonb_array_elements(p_snapshot -> 'consent_placements') p
      join public.consents c on c.id = (p ->> 'consent_id')::uuid
     where private.content_screen_opens(p_profile_id, p_snapshot, p ->> 'screen_key')
     order by p ->> 'screen_key', (p ->> 'sort_order')::integer
  loop
    if (asked.required or asked.key = 'app_terms') and (ticks -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'explicit terms acceptance required';
    end if;
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key, custom_form_id)
    values (her.org_id, her.id, asked.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), 'app',
            shown_language, private.localized_text_in(asked.body, shown_language), asked.required,
            'custom_form', asked.screen_key, p_form_id);
    perform private.apply_consent_effects(her.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), her.id);
    if asked.key = 'image_rights' then
      media := coalesce((ticks ->> asked.key)::boolean, false);
    end if;
  end loop;

  -- Every signature the version asks, with the text it published.
  for block in select value from jsonb_array_elements(p_snapshot -> 'blocks')
                where coalesce(value ->> 'kind', 'signature') = 'signature'
                  and private.content_screen_opens(p_profile_id, p_snapshot, value ->> 'screen_key') loop
    given := signatures -> (block ->> 'id');
    if given is null or not private.form_signature_given_valid(given) then
      raise check_violation using message = 'draw a valid signature or use the cannot-draw alternative';
    end if;
    is_unable := coalesce((given ->> 'unable_to_draw')::boolean, false);
    if block -> 'settings' ->> 'system' = 'terms_signature' then
      main_given := given;
      continue;
    end if;
    block_language := case when length(btrim(coalesce(block -> 'body' ->> (given ->> 'language'), ''))) > 0
                           then given ->> 'language' else 'ca' end;
    insert into public.form_signatures (
      org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind,
      signer_user_id, signer_name, strokes, unable_to_draw, custom_form_id)
    values (
      her.org_id, her.id, 'custom_form',
      (select b.id from public.form_blocks b where b.id = (block ->> 'id')::uuid),
      block ->> 'screen_key', block -> 'body' ->> block_language, block_language, 'player', her.id,
      coalesce(nullif(concat_ws(' ', private.name_answer_text(her.id, 'first_name'),
                                     private.name_answer_text(her.id, 'last_name')), ''), '-'),
      case when is_unable then null else given -> 'strokes' end, is_unable, p_form_id);
  end loop;
  if main_given is null then
    raise check_violation using message = 'draw a valid signature or use the cannot-draw alternative';
  end if;
  -- Her signature of the acceptance: the ledger's, as before.
  is_unable := coalesce((main_given ->> 'unable_to_draw')::boolean, false);
  insert into public.app_terms_signatures
    (acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device)
  values (p_acceptance_id, her.id, her.org_id, case when is_unable then null else main_given -> 'strokes' end,
          is_unable, coalesce(media, her.media_consent_at is not null), nullif(p_given ->> 'device', ''));
end;
$$;
revoke all on function private.record_app_terms_form(uuid, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;

-- An older build's acceptance: the acceptance consent's history, with the
-- wording of the version she was shown.
create or replace function private.record_app_terms_acceptance_consent(
  p_profile_id uuid, p_version public.app_terms_versions, p_language text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  her public.profiles;
  acceptance public.consents;
  snapshot jsonb := private.app_terms_version_snapshot(p_version);
begin
  select * into her from public.profiles where id = p_profile_id;
  select * into acceptance from public.consents where org_id = her.org_id and key = 'app_terms';
  if acceptance.id is null then
    return;
  end if;
  insert into public.consent_events
    (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
     form, screen_key, custom_form_id)
  values (her.org_id, her.id, acceptance.id, 'app_terms', true, 'app', p_language,
          private.localized_text_in(private.app_terms_version_content(p_version) -> 'accept_label', p_language),
          true, 'custom_form',
          (select p ->> 'screen_key' from jsonb_array_elements(snapshot -> 'consent_placements') p
            where p -> 'consent' ->> 'key' = 'app_terms' limit 1),
          private.app_terms_form_id(her.org_id));
end;
$$;
revoke all on function private.record_app_terms_acceptance_consent(uuid, public.app_terms_versions, text)
  from public, anon, authenticated;

-- The body of `20261026230000_dades_legals_consents.sql`. Her finish stays one
-- transaction. A build of RAPP-772 sends the terms form (`p_signing` names
-- the version she was shown); an older build sends its acceptance and photo
-- choice as before, for a version it can show.
create or replace function private.complete_onboarding_signed(payload jsonb, p_signing jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  stored public.profiles;
  her_org uuid;
  previous_ids uuid[];
  acceptance uuid;
  drawing jsonb := nullif(p_signing->'signature','null'::jsonb);
  cannot_draw boolean;
  -- Her signatures of the Onboarding blocks (RAPP-690), by block id.
  signatures jsonb := payload -> 'signatures';
  unsigned uuid[];
  is_form boolean := jsonb_typeof(p_signing) = 'object' and p_signing ? 'version_id';
  shown public.app_terms_versions;
  snapshot jsonb;
begin
  if caller is null then raise insufficient_privilege using message='authenticated signing required'; end if;
  select * into stored from public.profiles where id = caller;
  her_org := coalesce(stored.org_id, (select public.default_organization_id()));
  if is_form then
    if not private.app_terms_given_valid(p_signing, true) then
      raise check_violation using message = 'the terms form takes her answers, consents, signatures, language and the version she was shown';
    end if;
    perform 1 from public.app_terms_versions where id = (p_signing ->> 'version_id')::uuid for share;
    shown := private.app_terms_version_for(her_org, caller);
    if shown.id is null or shown.id <> (p_signing ->> 'version_id')::uuid then
      raise object_not_in_prerequisite_state using message = 'accept the current version';
    end if;
    snapshot := private.app_terms_version_snapshot(shown);
    -- Her answers on the terms' screens travel with the rest of hers; the
    -- version and language come from what she was shown; her photo choice
    -- is a consent of the form.
    payload := (payload - 'media_consent') || jsonb_build_object(
      'terms_version', coalesce(shown.version_number::text, 'draft'),
      'locale_shown', p_signing ->> 'language',
      'answers', coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb)
                 || coalesce(nullif(p_signing -> 'answers', 'null'::jsonb), '{}'::jsonb));
  else
    if jsonb_typeof(p_signing) is distinct from 'object'
      or (p_signing->'terms_accepted') is distinct from 'true'::jsonb
      or jsonb_typeof(p_signing->'media_consent') is distinct from 'boolean'
      or jsonb_typeof(p_signing->'unable_to_draw') is distinct from 'boolean'
      or (payload->'media_consent') is distinct from (p_signing->'media_consent')
      or length(coalesce(p_signing->>'device',''))>200
    then raise check_violation using message='explicit terms acceptance and matching media choice required'; end if;
    cannot_draw := (p_signing->>'unable_to_draw')::boolean;
    if (cannot_draw and drawing is not null) or
      (not cannot_draw and not private.app_signature_valid(drawing))
    then raise check_violation using message='draw a valid signature or use the cannot-draw alternative'; end if;
    -- The version an older build names: it shows only the old content (RAPP-772).
    select v.* into shown from public.app_terms_versions v
     where v.org_id = her_org
       and case when payload ->> 'terms_version' = 'draft' then v.published_at is null
                else v.published_at is not null
                     and v.version_number = case when payload ->> 'terms_version' ~ '^[0-9]{1,6}$'
                                                 then (payload ->> 'terms_version')::integer else 1 end end;
    if shown.id is not null and not private.app_terms_version_compatible(shown) then
      raise feature_not_supported using message = 'APP_TERMS/UPDATE_THE_APP: these app terms need the new app';
    end if;
  end if;

  -- Serialize calls for an existing account and identify this acceptance exactly,
  -- including two acceptances made in one transaction with the same timestamp.
  perform 1 from public.profiles where id=caller for update;
  select coalesce(array_agg(id),'{}'::uuid[]) into previous_ids
    from public.terms_acceptances where profile_id=caller;
  -- Every answer, the staff fields' included, travels in `answers` (RAPP-661)
  -- and is saved and checked in the same transaction as her account.
  saved := public.complete_onboarding(payload - 'signatures' - 'consents');
  select id into strict acceptance from public.terms_acceptances
    where profile_id=caller and not (id=any(previous_ids));
  if is_form then
    perform private.record_app_terms_form(caller, private.app_terms_form_id(saved.org_id), snapshot,
                                          p_signing, acceptance);
  else
    insert into public.app_terms_signatures
      (acceptance_id,profile_id,org_id,signature,unable_to_draw,media_consent,device)
    values (acceptance,caller,saved.org_id,drawing,cannot_draw,(p_signing->>'media_consent')::boolean,nullif(p_signing->>'device',''));
    if shown.id is not null then
      perform private.record_app_terms_acceptance_consent(caller, shown, payload ->> 'locale_shown');
    end if;
  end if;
  -- Every signature block of her Onboarding is signed by her (RAPP-690), in
  -- the same transaction as her account.
  perform private.save_form_signatures(
    saved.org_id, 'wizard', caller, null, caller,
    -- The name she signs with is her answer, whatever its level (RAPP-693).
    concat_ws(' ', private.name_answer_text(caller, 'first_name'), private.name_answer_text(caller, 'last_name')),
    signatures);
  -- Her ticks of the consents her Onboarding asks (RAPP-699), in her language.
  perform private.record_onboarding_consents(
    caller, payload -> 'consents', coalesce(payload ->> 'preferred_language', payload ->> 'locale_shown'));
  unsigned := private.unsigned_form_blocks(saved.org_id, 'wizard', caller, null);
  if cardinality(unsigned) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires her signature on every signature block';
  end if;
  return saved;
end $$;

-- The body of `20261022160000_test_players_see_drafts.sql`. She accepts the
-- new version on its own: the terms form from a build of RAPP-772
-- (`p_signing` holds her answers, consents and signatures), the old
-- acceptance and photo choice for a version an older build can show.
create or replace function public.accept_current_app_terms(p_version_id uuid, p_locale_shown text, p_signing jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_locale_shown is null or p_locale_shown not in ('ca', 'es', 'en', 'ar', 'fa') then
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
$$;

-- 8. The form engine ----------------------------------------------------------------------------------------

-- The terms are never asked as a pending form: the terms gate asks them.
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
  if form.id is null or form.is_archived or form.system_key = 'app_terms'
     or cardinality(coalesce(p_profiles, array[]::uuid[])) = 0 then
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

-- The Ramassà texts of the terms' old screens are the form's now.
create or replace function public.save_builtin_screen(p_screen text, p_texts jsonb, p_is_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  texts jsonb := coalesce(nullif(p_texts, 'null'::jsonb), '{}'::jsonb);
  hidden boolean := coalesce(p_is_hidden, false);
begin
  if p_screen in ('terms-intro', 'terms') then
    raise check_violation using message = 'the app terms'' screens are edited on their form';
  end if;
  if exists (select 1 from public.intake_builtin_screens b where b.org_id = actor_org and b.screen = p_screen and b.is_deleted) then
    raise check_violation using message = 'this screen has been deleted';
  end if;
  if private.builtin_screen_text_fields(p_screen) is null then
    raise check_violation using message = 'not a built-in screen';
  end if;
  if not private.builtin_screen_texts_valid(p_screen, texts) then
    raise check_violation using message = 'only this screen''s fields, as text in the five languages';
  end if;
  if hidden and not private.builtin_screen_hideable(p_screen) then
    raise check_violation using message = 'a screen with a required question, the summary or the terms cannot be hidden';
  end if;
  if texts = '{}'::jsonb and not hidden then
    delete from public.intake_builtin_screens where org_id = actor_org and screen = p_screen;
  else
    insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_at, updated_by)
    values (actor_org, p_screen, texts, hidden, now(), (select auth.uid()))
    on conflict (org_id, screen) do update
      set texts = excluded.texts, is_hidden = excluded.is_hidden, updated_at = now(),
          updated_by = excluded.updated_by;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.builtin_screen_save', 'organization', actor_org,
          jsonb_build_object('screen', p_screen, 'hidden', hidden,
                             'fields', (select coalesce(jsonb_agg(field order by field), '[]'::jsonb)
                                          from jsonb_object_keys(texts) field)));
end;
$$;

-- The body of `20261104140000_form_kind_and_legal_snapshot.sql`: the app terms
-- publish through their ledger, and a test player's answers to a legal
-- draft go with its publish (RAPP-772).
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
  -- The app terms number their versions in their ledger (RAPP-772).
  if form.system_key = 'app_terms' then
    raise check_violation using message = 'the app terms are published with publish_app_terms_draft';
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
  -- A test player's answer to the draft of a legal form goes with it: a
  -- published version never carries one, as the terms (RAPP-772). Her ticks
  -- and signatures of it go too; she is asked the version as everyone is.
  if form.kind = 'legal' then
    perform set_config('ramassa.consent_event_erasure', 'on', true);
    delete from public.consent_events e
     using public.custom_form_responses r, public.profiles p
     where r.form_id = form.id and r.version = next_version and p.id = r.profile_id and p.is_test_account
       and e.profile_id = r.profile_id and e.custom_form_id = form.id and e.decided_at >= r.asked_at;
    perform set_config('ramassa.consent_event_erasure', '', true);
    delete from public.form_signatures g
     using public.custom_form_responses r, public.profiles p
     where r.form_id = form.id and r.version = next_version and p.id = r.profile_id and p.is_test_account
       and g.profile_id = r.profile_id and g.custom_form_id = form.id and g.signed_at >= r.asked_at;
    delete from public.custom_form_responses r
     using public.profiles p
     where r.form_id = form.id and r.version = next_version and p.id = r.profile_id and p.is_test_account;
  end if;
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


-- The body of `20261104140000_form_kind_and_legal_snapshot.sql`: the app terms
-- are never a pending form (RAPP-772).
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
       -- The terms are asked by their own gate (RAPP-772).
       and f.system_key is distinct from 'app_terms'
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
     and f.filled_by = 'player' and not f.is_archived and f.system_key is distinct from 'app_terms'
     and jsonb_array_length(v.content -> 'screens') > 0
   order by private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date) desc,
            (v.content ->> 'deadline')::date nulls last, r.asked_at, r.id;
end;
$$;
revoke all on function public.my_custom_forms() from public, anon;
grant execute on function public.my_custom_forms() to authenticated;


-- The body of `20261104140000_form_kind_and_legal_snapshot.sql` (RAPP-772):
-- her phone reads the terms form from the version she is shown, the team
-- reads its ledger versions, and `terms` names the form and whether an older
-- build can show the version.
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
            from public.custom_form_versions v where v.form_id = f.id and f.system_key is null), '[]'::jsonb)
          -- The app terms' versions are their ledger's (RAPP-772).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', null, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version_number desc)
            from public.app_terms_versions v
           where f.system_key = 'app_terms' and v.org_id = f.org_id and v.published_at is not null), '[]'::jsonb),
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
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived
         and f.system_key is distinct from 'app_terms'
      union all
      -- The terms form as the version she is shown holds it (RAPP-772).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.app_terms_versions x where x.org_id = f.org_id)),
             private.app_terms_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.app_terms_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'app_terms' and v.id is not null
         and private.app_terms_version_snapshot(v) is not null)
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
      select jsonb_build_object('id', v.id, 'version_number', v.version_number,
                                'content', private.app_terms_version_content(v),
                                'is_draft', v.published_at is null,
                                -- Its form, and whether an older build can show it (RAPP-772).
                                'form_id', private.app_terms_form_id(actor_org),
                                'legacy_compatible', private.app_terms_version_compatible(v))
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

-- The body of `20261104120000_app_terms_introduction_can_be_deleted.sql`: the
-- terms' introduction is a screen of the terms form now (RAPP-772).
create or replace function public.delete_builder_screen(p_surface text, p_key text, p_expected_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  target_form_id uuid;
  keys text[];
  raw_keys text[];
  root_key text := p_key;
  expected text[];
  removed_count integer;
begin
  if p_surface is null or p_surface not in ('onboarding', 'custom_form') or p_key is null then
    raise invalid_parameter_value using message = 'no such screen';
  end if;
  -- Serialize deletes and lock this organization's definitions while deriving descendants.
  perform o.id from public.organizations o where o.id = actor_org for update;
  if p_surface = 'onboarding' then
    if p_key like 'custom:%' then
      if not private.is_uuid_text(substr(p_key, 8)) or not exists (
        select 1 from public.intake_screens s where s.id::text = substr(p_key, 8)
          and s.org_id = actor_org and not s.is_archived
      ) then
        raise no_data_found using message = 'no such screen';
      end if;
    elsif not (p_key = any (array[
      'identity', 'background', 'documentation', 'documentation-nie', 'documentation-passport',
      'documentation-other', 'logistics', 'equipment', 'season', 'applicant-status-details',
      'supporting-entities', 'participation-support', 'specific-needs', 'specific-needs-details', 'summary'
    ])) or exists (select 1 from public.intake_builtin_screens b
                    where b.org_id = actor_org and b.screen = p_key and b.is_deleted) then
      -- The app terms are a form of their own (RAPP-772): their screens are deleted there.
      raise invalid_parameter_value using message = 'no such onboarding screen';
    end if;
    perform s.id from public.intake_screens s where s.org_id = actor_org and not s.is_archived for update;
    perform p.id from public.field_placements p where p.org_id = actor_org and p.surface = p_surface for update;
    with recursive edges(child, parent) as (
      select 'custom:' || s.id, private.onboarding_step_key(p.screen_key)
        from public.intake_screens s
        join public.field_placements p on p.field_id = s.show_when_field_id
          and p.org_id = actor_org and p.surface = 'onboarding'
       where s.org_id = actor_org and not s.is_archived
      union all
      select f.screen, f.parent from private.app_follow_ups() f
       where not exists (select 1 from public.intake_builtin_screens b
                          where b.org_id = actor_org and b.screen = f.screen and b.is_deleted)
    ), family(key) as (
      select root_key
      union
      select e.child from edges e join family f on f.key = e.parent
    )
    select array_agg(key order by key) into keys from family;
  else
    if not private.is_uuid_text(p_key) then
      raise invalid_parameter_value using message = 'no such screen';
    end if;
    select s.form_id into target_form_id from public.custom_form_screens s
     where s.id::text = p_key and s.org_id = actor_org and not s.is_archived;
    if target_form_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    perform s.id from public.custom_form_screens s where s.form_id = target_form_id and not s.is_archived for update;
    perform p.id from public.field_placements p where p.org_id = actor_org and p.custom_form_id = target_form_id for update;
    with recursive edges(child, parent) as (
      select s.id::text, p.screen_key from public.custom_form_screens s
        join public.field_placements p on p.field_id = s.show_when_field_id
          and p.surface = 'custom_form' and p.custom_form_id = s.form_id and p.org_id = actor_org
       where s.org_id = actor_org and s.form_id = target_form_id and not s.is_archived
    ), family(key) as (
      select root_key
      union
      select e.child from edges e join family f on f.key = e.parent
    )
    select array_agg(key order by key) into keys from family;
  end if;
  select array_agg(distinct key order by key) into expected from unnest(p_expected_keys) key;
  if expected is distinct from keys then
    raise check_violation using message = 'the screen dependencies changed; reopen the confirmation';
  end if;
  raw_keys := array(select case when key like 'custom:%' then substr(key, 8) else key end from unnest(keys) key);
  if p_surface = 'onboarding' then
    update public.intake_screens s set is_archived = true, updated_at = now()
     where s.org_id = actor_org and s.id::text = any (raw_keys);
    insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, is_deleted, updated_by)
    select actor_org, key, '{}'::jsonb, true, true, (select auth.uid())
      from unnest(raw_keys) key where not private.is_uuid_text(key)
    on conflict (org_id, screen) do update
      set is_deleted = true, is_hidden = true, updated_by = excluded.updated_by, updated_at = now();
    update public.intake_flow_orders f
       set step_order = array(select step from unnest(f.step_order) step where not (step = any(keys))), updated_at = now()
     where f.org_id = actor_org;
  else
    update public.custom_form_screens s set is_archived = true, updated_at = now()
     where s.org_id = actor_org and s.form_id = target_form_id and s.id::text = any(raw_keys);
  end if;
  -- A controlling field stays until its conditional fields have left the screen.
  loop
    delete from public.field_placements p
     where p.org_id = actor_org and p.surface = p_surface and p.screen_key = any(raw_keys)
       and p.custom_form_id is not distinct from target_form_id
       and not exists (
         select 1 from public.profile_fields child
         join public.field_placements theirs on theirs.field_id = child.id
          where child.show_when_field_id = p.field_id and theirs.surface = p.surface
            and (theirs.screen_key is not distinct from p.screen_key
                 or (p.surface = 'onboarding' and theirs.screen_key in (
                   select f.screen from private.app_follow_ups() f where f.parent = p.screen_key)))
            and theirs.custom_form_id is not distinct from p.custom_form_id
       );
    get diagnostics removed_count = row_count;
    exit when removed_count = 0;
  end loop;
  if exists (select 1 from public.field_placements p
              where p.org_id = actor_org and p.surface = p_surface and p.screen_key = any(raw_keys)
                and p.custom_form_id is not distinct from target_form_id) then
    raise check_violation using message = 'a conditional field prevented screen deletion';
  end if;
  delete from public.consent_placements p
   where p.org_id = actor_org and p.surface = p_surface and p.screen_key = any(raw_keys)
     and p.custom_form_id is not distinct from target_form_id;
  -- ON DELETE SET NULL retains the signed body's snapshot and its history.
  delete from public.form_blocks b
   where b.org_id = actor_org and b.surface = p_surface and b.screen_key = any(raw_keys)
     and b.custom_form_id is not distinct from target_form_id;
  insert into public.audit_log(org_id, actor_id, action, target_type, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_delete', 'screen',
          jsonb_build_object('surface', p_surface, 'screens', to_jsonb(keys), 'form_id', target_form_id));
end;
$$;

revoke all on function public.delete_builder_screen(text, text, text[]) from public, anon;
grant execute on function public.delete_builder_screen(text, text, text[]) to authenticated;

-- 9. Each organization's terms as a form ----------------------------------------------------------------------

-- The form from the draft, else the current version, with the Ramassà texts
-- of its two screens and without the introduction staff deleted (RAPP-761).
do $$
declare
  org record;
  source public.app_terms_versions;
  current_version public.app_terms_versions;
  terms_form uuid;
begin
  for org in select o.id from public.organizations o order by o.created_at, o.id loop
    current_version := private.current_app_terms_version(org.id);
    select * into source from public.app_terms_versions v where v.org_id = org.id and v.published_at is null;
    if source.id is null then
      source := current_version;
    end if;
    continue when source.id is null;
    -- "He llegit i accepto les condicions", worded as the terms ask it.
    insert into public.consents (org_id, key, system_key, name, body)
    values (org.id, 'app_terms', 'app_terms', private.system_consent_name('app_terms'), source.content -> 'accept_label')
    on conflict (org_id, key) do update set system_key = 'app_terms', is_archived = false, updated_at = now();
    terms_form := private.ensure_app_terms_form(org.id);
    perform private.restore_app_terms_form(terms_form, private.app_terms_snapshot_from_content(
      org.id, terms_form, source.content,
      (select b.texts from public.intake_builtin_screens b where b.org_id = org.id and b.screen = 'terms-intro'),
      (select b.texts from public.intake_builtin_screens b where b.org_id = org.id and b.screen = 'terms'),
      not exists (select 1 from public.intake_builtin_screens b
                   where b.org_id = org.id and b.screen = 'terms-intro' and b.is_deleted)));
    update public.custom_forms f
       set version = coalesce(current_version.version_number, 1),
           published_at = (select min(v.published_at) from public.app_terms_versions v
                            where v.org_id = org.id and v.published_at is not null)
     where f.id = terms_form;
  end loop;
end;
$$;

-- Every published version gets the form it showed, by the same converter and
-- the same ids. Its `content` is not written: the guard of published rows is
-- off for this update only, as `20261022140000` did.
alter table public.app_terms_versions disable trigger app_terms_versions_immutable;
update public.app_terms_versions v
   set form_snapshot = private.app_terms_snapshot_from_content(
         v.org_id, f.id, v.content,
         (select b.texts from public.intake_builtin_screens b where b.org_id = v.org_id and b.screen = 'terms-intro'),
         (select b.texts from public.intake_builtin_screens b where b.org_id = v.org_id and b.screen = 'terms'),
         not exists (select 1 from public.intake_builtin_screens b
                      where b.org_id = v.org_id and b.screen = 'terms-intro' and b.is_deleted)),
       legacy_compatible = true
  from public.custom_forms f
 where f.org_id = v.org_id and f.system_key = 'app_terms' and v.published_at is not null;
alter table public.app_terms_versions enable trigger app_terms_versions_immutable;

alter table public.app_terms_versions
  add constraint app_terms_versions_published_with_form
    check (published_at is null or (form_snapshot is not null and legacy_compatible is not null));

-- From now on, a change to the terms form opens the draft.
create trigger custom_form_screens_app_terms_touched
  after insert or update or delete on public.custom_form_screens
  for each row execute function private.app_terms_form_touched();
create trigger field_placements_app_terms_touched
  after insert or update or delete on public.field_placements
  for each row execute function private.app_terms_form_touched();
create trigger form_blocks_app_terms_touched
  after insert or update or delete on public.form_blocks
  for each row execute function private.app_terms_form_touched();
create trigger consent_placements_app_terms_touched
  after insert or update or delete on public.consent_placements
  for each row execute function private.app_terms_form_touched();
create trigger consents_app_terms_touched
  after update of name, body on public.consents
  for each row execute function private.app_terms_form_touched();

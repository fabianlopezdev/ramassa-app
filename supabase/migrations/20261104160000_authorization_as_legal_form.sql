-- The season authorization as a legal form (RAPP-773).
--
-- WHY
--
-- Phase 3 of moving the legal forms onto the form engine (RAPP-770, RAPP-771,
-- RAPP-772). "Autorització de la temporada" was a fixed walk: the document,
-- the Health screen, then the consents and her signature, with the wording in
-- each version's `content`. Staff now build it as any form: screens they add,
-- reorder and delete, each with its texts and its blocks (Text, Punts,
-- questions of the Fitxa, consents of Dades legals, signatures). Three
-- screens stay where they are: the two re-registration screens a returning
-- player sees first (the app draws them), and the last one, where she ticks
-- the consents and signs.
--
-- The legal record does not move. `authorization_versions`,
-- `authorization_signatures`, `consent_events` (by `version_id`), `seasons`
-- and the paper records stay the ledger: a publish numbers a version in its
-- season (Correcció or Nova versió, RAPP-696), a signature names it, and her
-- consents hang from her signature. What changes is where the text comes
-- from: the system form `custom_forms` (kind 'legal', system_key
-- 'season_authorization', repeating each season) is the draft, and a publish
-- freezes it into the version.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `authorization_versions.form_snapshot` (the form as the version
--      published it, `private.custom_form_content`, schema 2) and
--      `legacy_compatible` (its old `content` says all of it, so an older app
--      build may still show and sign it). A published version always has
--      both. `custom_form_screens.attachments`: the season documents (https
--      links, up to 10), a part of the authorization's document screen.
--      `walk_in_form_signatures.unable_to_draw`: "No puc signar" on the
--      walk-in tablet too (a gap left by RAPP-771).
--   2. The system form of each organization, built from its draft or else
--      its current version: the two re-registration screens (locked), the
--      document (its title, its introduction, one Text block per section,
--      its documents), the Health screen with the fields placed on the old
--      Health screen (moved onto the form), and the locked last screen with
--      the consents placed on the old consents screen and her signature
--      ("No puc signar" allowed, its texts in the block). The wording of the
--      form becomes the screens' titles, introductions and buttons, in the
--      version's screen order. Every published version gets its snapshot by
--      the same converter and the same ids; its `content` is left exactly as
--      it was. An organization with no version, and a new one, gets the
--      form with its default screens and a draft to publish.
--   3. Locks: the three system screens are never deleted, hidden, moved or
--      made to depend on an answer, the re-registration screens hold
--      nothing (the app draws them), the signature is never removed, the
--      health data consent stays while the form asks her health, and the
--      form keeps its choices. Nothing is placed on the old surface
--      'authorization' any more.
--   4. Any change to the form keeps the organization's one draft row, with
--      the old `content` the form gives, so a test player sees it (RAPP-619)
--      and Publica has something to publish. `save_authorization_draft` (the
--      setup import, an older Control Center) rebuilds the form from old
--      content; `discard_authorization_draft` puts the form back as the
--      version in force published it.
--   5. `publish_authorization_draft` keeps its season and numbering: it
--      freezes the form into the version, writes the old `content` from it
--      for older builds, refuses a Correcció that asks more, and clears a
--      test player's records of the draft.
--   6. Signing reads the version's snapshot: `private.record_signature`
--      (her app, the staff tablet, a confirmed walk-in), the checks
--      (`private.validate_signing_payload`, `private.check_signing_answers`),
--      `current_authorization_for_signing`, `submit_walk_in_signing` and
--      `my_authorization_status`. A new build sends the form's payload
--      (answers, ticks and every signature by block); an older build, and a
--      tablet entry signed before, sends the old one, accepted for a version
--      that is legacy compatible and refused with
--      `AUTHORIZATION/UPDATE_THE_APP` otherwise. The walk-in tablet takes
--      "No puc signar" on the Onboarding blocks.
--   7. The form engine: the authorization is never asked as a pending form
--      nor published with `publish_custom_form`; her phone reads it from the
--      version she is shown (`intake_catalog`), which also keeps sending an
--      older build the old Health screen's placements. The chain's
--      'authorization' is the system form. The test-player scenario signs
--      with the version's consents.
--
-- AN OLDER APP BUILD
--
-- It reads `content` (the draft's and every published version's, always
-- valid), the 'authorization' placements of the catalog and the old status
-- columns, and signs with the old payload. While a version is legacy
-- compatible nothing changes for her. A version with more than the old
-- screens can be signed only from the new build.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html (DISABLE
-- TRIGGER, as 20261022140000 and 20261104150000 did for the published-row
-- guard), https://www.postgresql.org/docs/current/sql-insert.html (ON
-- CONFLICT with a partial unique index),
-- https://www.postgresql.org/docs/current/plpgsql-trigger.html,
-- https://www.postgresql.org/docs/current/xfunc-sql.html (functions returning
-- a composite in FROM) and https://supabase.com/docs/guides/database/functions
-- (security definer functions with an empty search path).

-- 1. New columns ---------------------------------------------------------------------------------------------

alter table public.authorization_versions
  add column form_snapshot jsonb,
  add column legacy_compatible boolean,
  add constraint authorization_versions_form_snapshot_object
    check (form_snapshot is null or jsonb_typeof(form_snapshot) = 'object');
comment on column public.authorization_versions.form_snapshot is
  'The authorization form as this version published it (RAPP-773): private.custom_form_content, schema 2. Null on the draft, which is the form itself.';
comment on column public.authorization_versions.legacy_compatible is
  'Its old content says all of the form (RAPP-773): an older app build may show and sign it. Null on the draft.';

-- The season documents: https links with their label, up to ten.
create or replace function private.form_attachments_valid(p_attachments jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_attachments) = 'array'
    and jsonb_array_length(p_attachments) <= 10
    and not exists (
      select 1 from jsonb_array_elements(p_attachments) attachment
       where jsonb_typeof(attachment) <> 'object'
          or attachment - array['label', 'url'] <> '{}'::jsonb
          or not private.localized_text_valid(attachment -> 'label')
          or coalesce(attachment ->> 'url', '') !~ '^https://[^[:space:]]+$'
          or length(attachment ->> 'url') > 2000),
    false);
$$;
revoke all on function private.form_attachments_valid(jsonb) from public, anon, authenticated;

alter table public.custom_form_screens
  add column attachments jsonb,
  add constraint custom_form_screens_attachments_valid
    check (attachments is null or private.form_attachments_valid(attachments));
comment on column public.custom_form_screens.attachments is
  'The season documents of the authorization''s document screen (RAPP-773): https links with a label, up to ten. Null on every other screen.';

alter table public.walk_in_form_signatures
  add column unable_to_draw boolean not null default false;
alter table public.walk_in_form_signatures alter column strokes drop not null;
alter table public.walk_in_form_signatures drop constraint walk_in_form_signatures_strokes_check;
alter table public.walk_in_form_signatures
  add constraint walk_in_form_signatures_strokes_check
    check (case when unable_to_draw then strokes is null else private.app_signature_valid(strokes) end);
comment on column public.walk_in_form_signatures.unable_to_draw is
  'She said she cannot draw (RAPP-773): the text she accepted is kept, with no strokes.';

-- 2. The texts the app bundled -------------------------------------------------------------------------------

-- The form's name in the lists.
create or replace function private.authorization_form_name()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"ca": "Autorització de la temporada", "es": "Autorización de la temporada", "en": "Season authorization", "ar": "تفويض الموسم", "fa": "مجوز فصل"}'::jsonb;
$$;
revoke all on function private.authorization_form_name() from public, anon, authenticated;

-- The text of her signature, which the old screen never showed.
create or replace function private.authorization_signature_text()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"ca": "Amb la meva signatura accepto aquesta autorització per a la temporada.", "es": "Con mi firma acepto esta autorización para la temporada.", "en": "With my signature I accept this authorization for the season.", "ar": "بتوقيعي أوافق على هذا التفويض للموسم.", "fa": "با امضای خود این مجوز را برای فصل می‌پذیرم."}'::jsonb;
$$;
revoke all on function private.authorization_signature_text() from public, anon, authenticated;

-- The app's own text of a wording field that becomes a screen's title or
-- introduction (`packages/shared/i18n/locales/*/onboarding.json`); `{{season}}`
-- stays a placeholder her phone fills.
create or replace function private.authorization_bundled_text(p_field text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_field
    when 'intro' then '{"ca": "Llegeix l’autorització de Ramassà per a la temporada {{season}}. Després marca les teves decisions i signa l’autorització.", "es": "Lee la autorización de Ramassà para la temporada {{season}}. Después marca tus decisiones y firma la autorización.", "en": "Read Ramassà’s authorization for the {{season}} season. Then mark your choices and sign the authorization.", "ar": "اقرئي تفويض راماسا لموسم {{season}}. ثم حددي اختياراتكِ ووقّعي التفويض.", "fa": "مجوز راماسا برای فصل {{season}} را بخوانید. سپس گزینه‌های خود را مشخص کنید و مجوز را امضا کنید."}'::jsonb
    when 'health_title' then '{"ca": "Dades mèdiques", "es": "Datos médicos", "en": "Medical information", "ar": "البيانات الطبية", "fa": "اطلاعات پزشکی"}'::jsonb
    when 'consents_title' then '{"ca": "Les teves autoritzacions", "es": "Tus autorizaciones", "en": "Your authorizations", "ar": "موافقاتكِ", "fa": "رضایت‌های شما"}'::jsonb
    when 'reregistration_title' then '{"ca": "Inscripció per a la temporada {{season}}", "es": "Inscripción para la temporada {{season}}", "en": "Registration for the {{season}} season", "ar": "التسجيل لموسم {{season}}", "fa": "ثبت‌نام برای فصل {{season}}"}'::jsonb
    when 'reregistration_intro' then '{"ca": "Hola de nou! Abans de signar la temporada, revisa les teves dades. Encara són correctes?", "es": "¡Hola de nuevo! Antes de firmar la temporada, revisa tus datos. ¿Siguen siendo correctos?", "en": "Welcome back! Before you sign for the season, check your details. Are they still correct?", "ar": "أهلًا بعودتكِ! قبل التوقيع على الموسم، راجعي بياناتكِ. هل ما زالت صحيحة؟", "fa": "خوش برگشتید! پیش از امضای فصل، اطلاعاتتان را بررسی کنید. هنوز درست است؟"}'::jsonb
    when 'reregistration_season_intro' then '{"ca": "Totes les preguntes són opcionals. Ens ajuden a acompanyar-te millor aquesta temporada.", "es": "Todas las preguntas son opcionales. Nos ayudan a acompañarte mejor esta temporada.", "en": "Every question is optional. They help us support you better this season.", "ar": "كل الأسئلة اختيارية. تساعدنا على مرافقتكِ بشكل أفضل هذا الموسم.", "fa": "همه سؤال‌ها اختیاری‌اند. به ما کمک می‌کنند این فصل بهتر همراهتان باشیم."}'::jsonb
  end;
$$;
revoke all on function private.authorization_bundled_text(text) from public, anon, authenticated;

-- A text with its Catalan written: taken from another language when it had none.
create or replace function private.with_catalan(p_text jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when not private.localized_text_valid(p_text) then null
    when length(btrim(coalesce(p_text ->> 'ca', ''))) > 0 then p_text
    else p_text || jsonb_build_object('ca', private.localized_text_in(p_text, 'ca')) end;
$$;
revoke all on function private.with_catalan(jsonb) from public, anon, authenticated;

-- A wording field of old content as the form holds it: staff's text, the
-- app's own when the version left it out, or null when staff cleared it.
create or replace function private.authorization_text_of(p_content jsonb, p_field text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_content -> 'texts', '{}'::jsonb) ? p_field then private.with_catalan(p_content -> 'texts' -> p_field)
    else private.authorization_bundled_text(p_field) end;
$$;
revoke all on function private.authorization_text_of(jsonb, text) from public, anon, authenticated;

-- A label of old content as a form screen keeps it: staff's text, else none
-- (her phone shows the app's own).
create or replace function private.authorization_label_of(p_content jsonb, p_field text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when private.localized_text_valid(p_content -> 'texts' -> p_field)
              and not exists (select 1 from jsonb_each_text(p_content -> 'texts' -> p_field) language
                               where length(language.value) > 2000)
              then private.with_catalan(p_content -> 'texts' -> p_field) end;
$$;
revoke all on function private.authorization_label_of(jsonb, text) from public, anon, authenticated;

-- 3. The system form -----------------------------------------------------------------------------------------

-- The ids of the parts the converter writes: the same for every version of an
-- organization, so the form and each version's snapshot name the same parts.
create or replace function private.authorization_stable_id(p_org_id uuid, p_part text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5(p_org_id::text || ':season_authorization:' || p_part)::uuid;
$$;
revoke all on function private.authorization_stable_id(uuid, text) from public, anon, authenticated;

-- The organization's authorization form; null before this migration built it.
create or replace function private.authorization_form_id(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id from public.custom_forms f where f.org_id = p_org_id and f.system_key = 'season_authorization';
$$;
revoke all on function private.authorization_form_id(uuid) from public, anon, authenticated;

-- Old content as the form's content (schema 2): the re-registration screens,
-- the document and the Health screen in the version's order, and the locked
-- last screen. The questions are the ones given (`p_placements`, moved onto
-- the Health screen); the consents the ones given (`p_consents`, onto the
-- last screen) or else the version's own. The one converter of this
-- migration, the setup import and a new organization.
create or replace function private.authorization_snapshot_from_content(
  p_org_id uuid, p_form_id uuid, p_content jsonb, p_placements jsonb, p_consents jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select private.authorization_stable_id(p_org_id, 'reregistration_screen') as rereg,
           private.authorization_stable_id(p_org_id, 'reregistration_season_screen') as season,
           private.authorization_stable_id(p_org_id, 'document_screen') as document,
           private.authorization_stable_id(p_org_id, 'health_screen') as health,
           private.authorization_stable_id(p_org_id, 'sign_screen') as sign,
           private.authorization_stable_id(p_org_id, 'signature_block') as signature),
  source as (select coalesce(p_content, '{}'::jsonb) as c),
  form as (select f.* from public.custom_forms f where f.id = p_form_id),
  -- The version's own consents, in its order, by the catalogue's consent.
  own_consents as (
    select c.id as consent_id, c.key, c.name, c.body as catalogue_body,
           private.with_catalan(entry.value -> 'label') as label,
           coalesce((entry.value ->> 'required')::boolean, false) as required,
           row_number() over (order by (entry.value ->> 'position')::integer, entry.key) - 1 as place
      from source
      cross join lateral jsonb_each(case when jsonb_typeof(source.c -> 'consents') = 'object'
                                         then source.c -> 'consents' else '{}'::jsonb end) entry
      join public.consents c on c.org_id = p_org_id and c.key = entry.key and not c.is_archived
     where private.localized_text_valid(entry.value -> 'label')),
  consent_rows as (
    select coalesce(
      case when p_consents is null then (
        select jsonb_agg(jsonb_build_object(
                 'id', private.authorization_stable_id(p_org_id, 'consent:' || o.key),
                 'consent_id', o.consent_id, 'screen_key', ids.sign::text, 'sort_order', o.place,
                 'required', o.required and o.key <> 'image_rights',
                 'body_override', case when o.label is distinct from o.catalogue_body then o.label end,
                 'consent', jsonb_build_object('key', o.key, 'name', o.name, 'body', o.label))
               order by o.place)
          from own_consents o, ids)
      else (
        select jsonb_agg(p.value || jsonb_build_object('screen_key', ids.sign::text, 'sort_order', p.ordinality - 1)
                         order by p.ordinality)
          from jsonb_array_elements(p_consents) with ordinality p, ids) end,
      '[]'::jsonb) as rows),
  sections as (
    select s.value as section, s.ordinality - 1 as place
      from source
      cross join lateral jsonb_array_elements(case when jsonb_typeof(source.c -> 'sections') = 'array'
                                                   then source.c -> 'sections' else '[]'::jsonb end)
           with ordinality s
     where private.localized_text_valid(s.value -> 'body')),
  screen_rows as (
    select jsonb_build_object(
             'id', ids.document, 'system_screen', null, 'show_when_field_id', null, 'show_when_values', null,
             'title', coalesce(private.with_catalan(source.c -> 'title'), private.authorization_form_name()),
             'intro', private.authorization_text_of(source.c, 'intro'),
             'texts', jsonb_strip_nulls(jsonb_build_object(
                        'continue_label', private.authorization_label_of(source.c, 'continue_label'))),
             'attachments', case when jsonb_typeof(source.c -> 'attachments') = 'array'
                                      and private.form_attachments_valid(source.c -> 'attachments')
                                 then source.c -> 'attachments' else '[]'::jsonb end) as document,
           jsonb_build_object(
             'id', ids.health, 'system_screen', null, 'show_when_field_id', null, 'show_when_values', null,
             'title', coalesce(private.authorization_text_of(source.c, 'health_title'),
                               private.authorization_bundled_text('health_title')), 'intro', null,
             'texts', jsonb_strip_nulls(jsonb_build_object(
                        'continue_label', private.authorization_label_of(source.c, 'continue_label'))),
             'attachments', null) as health,
           coalesce((source.c -> 'screen_order' ->> 0) = 'health', false) as health_first
      from source, ids)
  select jsonb_build_object(
    'schema', 2,
    'name', form.name, 'mandatory', form.mandatory, 'deadline', form.deadline, 'kind', form.kind,
    'screens', jsonb_build_array(
      jsonb_build_object(
        'id', ids.rereg, 'system_screen', 'reregistration', 'sort_order', 0,
        'show_when_field_id', null, 'show_when_values', null,
        'title', coalesce(private.authorization_text_of(source.c, 'reregistration_title'),
                          private.authorization_bundled_text('reregistration_title')),
        'intro', private.authorization_text_of(source.c, 'reregistration_intro'),
        'texts', jsonb_strip_nulls(jsonb_build_object(
                   'continue_label', private.authorization_label_of(source.c, 'reregistration_correct_label'),
                   'decline_label', private.authorization_label_of(source.c, 'reregistration_edit_label'))),
        'attachments', null),
      jsonb_build_object(
        'id', ids.season, 'system_screen', 'reregistration_season', 'sort_order', 1,
        'show_when_field_id', null, 'show_when_values', null,
        'title', coalesce(private.authorization_text_of(source.c, 'reregistration_title'),
                          private.authorization_bundled_text('reregistration_title')),
        'intro', private.authorization_text_of(source.c, 'reregistration_season_intro'),
        'texts', jsonb_strip_nulls(jsonb_build_object(
                   'continue_label', private.authorization_label_of(source.c, 'continue_label'))),
        'attachments', null),
      (case when screen_rows.health_first then screen_rows.health else screen_rows.document end)
        || jsonb_build_object('sort_order', 2),
      (case when screen_rows.health_first then screen_rows.document else screen_rows.health end)
        || jsonb_build_object('sort_order', 3),
      jsonb_build_object(
        'id', ids.sign, 'system_screen', 'authorization_sign', 'sort_order', 4,
        'show_when_field_id', null, 'show_when_values', null,
        'title', coalesce(private.authorization_text_of(source.c, 'consents_title'),
                          private.authorization_bundled_text('consents_title')), 'intro', null,
        'texts', jsonb_strip_nulls(jsonb_build_object(
                   'continue_label', private.authorization_label_of(source.c, 'sign_and_enter_label'))),
        'attachments', null)),
    'placements', coalesce((
      select jsonb_agg(p.value || jsonb_build_object('screen_key', ids.health::text) order by p.ordinality)
        from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) with ordinality p), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', private.authorization_stable_id(p_org_id, 'section:' || s.place || ':' || coalesce(s.section ->> 'key', '')),
               'screen_key', ids.document::text, 'kind', 'text',
               'body', private.with_catalan(s.section -> 'body'),
               'title', private.with_catalan(s.section -> 'title'), 'points', null,
               'settings', jsonb_build_object('section_key', s.section ->> 'key'),
               'sort_order', s.place)
             order by s.place)
        from sections s), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'id', ids.signature, 'screen_key', ids.sign::text, 'kind', 'signature',
        'body', private.authorization_signature_text(), 'title', null, 'points', null,
        'settings', jsonb_build_object('system', 'authorization_signature', 'texts', jsonb_strip_nulls(jsonb_build_object(
          'signature_title', private.authorization_label_of(source.c, 'signature_title'),
          'signature_prompt', private.authorization_label_of(source.c, 'signature_prompt'),
          'signature_hint', case when coalesce(source.c -> 'texts', '{}'::jsonb) ? 'signature_hint'
                                 then source.c -> 'texts' -> 'signature_hint' end,
          'cannot_draw_label', private.authorization_label_of(source.c, 'cannot_draw_label'),
          'cannot_draw_hint', case when coalesce(source.c -> 'texts', '{}'::jsonb) ? 'cannot_draw_hint'
                                   then source.c -> 'texts' -> 'cannot_draw_hint' end))),
        'sort_order', jsonb_array_length(consent_rows.rows))),
    'consent_placements', consent_rows.rows)
    from ids, source, form, consent_rows, screen_rows;
$$;
revoke all on function private.authorization_snapshot_from_content(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

-- The body of `20261104150000_app_terms_as_legal_form.sql`'s
-- `private.restore_app_terms_form`, for both legal forms of the app: writes
-- the form as a snapshot holds it, by the snapshot's ids, so a signature
-- already given keeps its block. A screen out of the snapshot is archived; an
-- item out of it goes. A question moves to the screen the snapshot names, and
-- the authorization's document screen keeps its documents.
create or replace function private.restore_legal_form(p_form_id uuid, p_snapshot jsonb)
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
  if form.id is null or form.system_key is null then
    raise no_data_found using message = 'no legal form of the app';
  end if;
  -- The form's own writes: no draft is opened, and its locked parts may move.
  perform set_config('ramassa.app_terms_form_sync', 'on', true);

  update public.custom_form_screens s set is_archived = true, updated_at = now()
   where s.form_id = form.id and not s.is_archived and s.system_screen is null
     and not exists (select 1 from jsonb_array_elements(p_snapshot -> 'screens') x where x ->> 'id' = s.id::text);
  insert into public.custom_form_screens (id, org_id, form_id, title, intro, sort_order, texts, system_screen,
                                          attachments)
  select (x ->> 'id')::uuid, form.org_id, form.id, x -> 'title', private.json_value_or_null(x -> 'intro'),
         (x ->> 'sort_order')::integer, coalesce(private.json_value_or_null(x -> 'texts'), '{}'::jsonb),
         x ->> 'system_screen', private.json_value_or_null(x -> 'attachments')
    from jsonb_array_elements(p_snapshot -> 'screens') x
  on conflict (id) do update
    set title = excluded.title, intro = excluded.intro, sort_order = excluded.sort_order,
        texts = excluded.texts, attachments = excluded.attachments, is_archived = false, is_hidden = false,
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
     set screen_key = x ->> 'screen_key',
         sort_order = (x ->> 'sort_order')::integer, required = (x ->> 'required')::boolean,
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
revoke all on function private.restore_legal_form(uuid, jsonb) from public, anon, authenticated;

-- The app terms keep their call (RAPP-772).
create or replace function private.restore_app_terms_form(p_form_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.custom_forms f where f.id = p_form_id and f.system_key = 'app_terms') then
    raise no_data_found using message = 'no app terms form';
  end if;
  perform private.restore_legal_form(p_form_id, p_snapshot);
end;
$$;

-- Creates the authorization form with its default screens, unless it exists,
-- and returns it.
create or replace function private.ensure_authorization_form(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorization_form uuid := private.authorization_form_id(p_org_id);
begin
  if authorization_form is null then
    insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                     repeats_each_season, kind, system_key)
    values (p_org_id, private.authorization_form_name(), 'player', 'required_to_use_app', null, 'all',
            true, 'legal', 'season_authorization')
    returning id into authorization_form;
    perform private.restore_legal_form(authorization_form, private.authorization_snapshot_from_content(
      p_org_id, authorization_form, null, '[]'::jsonb, '[]'::jsonb));
  end if;
  return authorization_form;
end;
$$;
revoke all on function private.ensure_authorization_form(uuid) from public, anon, authenticated;

-- 4. What an older build reads -------------------------------------------------------------------------------

-- A form text as old content keeps it: left out when it is the app's own
-- (her phone shows that), the cleared mark for an optional text staff
-- cleared, else the text.
create or replace function private.authorization_legacy_text(p_value jsonb, p_field text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when private.json_value_or_null(p_value) is null then
      case when private.authorization_text_optional('texts', p_field) then '{"ca": ""}'::jsonb end
    when p_value = private.authorization_bundled_text(p_field) then null
    else p_value end;
$$;
revoke all on function private.authorization_legacy_text(jsonb, text) from public, anon, authenticated;

-- The minimal old content a form that says nothing old can read stands for:
-- its title, one section, and the participation consent. Only ever read by
-- an older build, which is then refused at signing.
create or replace function private.authorization_minimal_content(p_org_id uuid, p_title jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', coalesce(private.with_catalan(p_title), private.authorization_form_name()),
    'sections', jsonb_build_array(jsonb_build_object(
      'key', 'document', 'title', coalesce(private.with_catalan(p_title), private.authorization_form_name()),
      'body', coalesce(private.with_catalan(p_title), private.authorization_form_name()))),
    'consents', jsonb_build_object('participation', jsonb_build_object(
      'label', coalesce((select private.with_catalan(c.body) from public.consents c
                          where c.org_id = p_org_id and c.key = 'participation'),
                        private.system_consent_name('participation')),
      'required', true, 'position', 0)),
    'texts', '{}'::jsonb, 'attachments', '[]'::jsonb);
$$;
revoke all on function private.authorization_minimal_content(uuid, jsonb) from public, anon, authenticated;

-- What an older build reads of a snapshot (`content`), and whether that says
-- all of it (`compatible`). A part the old screens cannot hold keeps the
-- fallback's text, and the version is then not compatible. The content is
-- always valid.
create or replace function private.authorization_form_legacy(p_org_id uuid, p_snapshot jsonb, p_fallback jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  screens jsonb := (select coalesce(jsonb_agg(s order by (s ->> 'sort_order')::integer), '[]'::jsonb)
                      from jsonb_array_elements(coalesce(p_snapshot -> 'screens', '[]'::jsonb)) s);
  blocks jsonb := coalesce(p_snapshot -> 'blocks', '[]'::jsonb);
  asks jsonb := coalesce(p_snapshot -> 'consent_placements', '[]'::jsonb);
  questions jsonb := coalesce(p_snapshot -> 'placements', '[]'::jsonb);
  fallback jsonb := case when private.authorization_content_valid(p_fallback) then p_fallback end;
  rereg jsonb;
  season jsonb;
  sign jsonb;
  document jsonb;
  health jsonb;
  main jsonb;
  own_screens integer;
  title jsonb;
  sections jsonb;
  consents jsonb;
  texts jsonb;
  content jsonb;
  compatible boolean;
begin
  select s into rereg from jsonb_array_elements(screens) s where s ->> 'system_screen' = 'reregistration' limit 1;
  select s into season from jsonb_array_elements(screens) s where s ->> 'system_screen' = 'reregistration_season' limit 1;
  select s into sign from jsonb_array_elements(screens) s where s ->> 'system_screen' = 'authorization_sign' limit 1;
  select count(*) into own_screens from jsonb_array_elements(screens) s
   where private.json_value_or_null(s -> 'system_screen') is null;
  -- The document holds the documents; else the first of the form's own screens.
  select s into document from jsonb_array_elements(screens) s
   where private.json_value_or_null(s -> 'system_screen') is null
   order by (private.json_value_or_null(s -> 'attachments') is not null) desc, (s ->> 'sort_order')::integer
   limit 1;
  select s into health from jsonb_array_elements(screens) s
   where private.json_value_or_null(s -> 'system_screen') is null and s ->> 'id' <> document ->> 'id'
   order by (s ->> 'sort_order')::integer limit 1;
  select b into main from jsonb_array_elements(blocks) b
   where b -> 'settings' ->> 'system' = 'authorization_signature' limit 1;

  title := case when private.localized_text_valid(document -> 'title') then document -> 'title' end;
  sections := (
    select jsonb_agg(jsonb_build_object(
             'key', case when coalesce(x.b -> 'settings' ->> 'section_key', '') ~ '^[a-z_]{1,40}$'
                         then x.b -> 'settings' ->> 'section_key'
                         else 'section_' || chr(96 + least(26, x.place::integer)) end,
             'title', x.b -> 'title', 'body', x.b -> 'body')
           order by x.place)
      from (select value as b, row_number() over (order by (value ->> 'sort_order')::integer) as place
              from jsonb_array_elements(blocks)
             where value ->> 'screen_key' = document ->> 'id' and value ->> 'kind' = 'text') x);
  if sections is null or jsonb_array_length(sections) not between 1 and 20 or exists (
       select 1 from jsonb_array_elements(sections) s
        where not private.localized_text_valid(s -> 'title') or not private.localized_text_valid(s -> 'body')) then
    sections := null;
  end if;
  consents := (
    select jsonb_object_agg(x.p -> 'consent' ->> 'key', jsonb_build_object(
             'label', x.p -> 'consent' -> 'body', 'required', (x.p ->> 'required')::boolean,
             'position', x.place))
      from (select value as p, row_number() over (order by (value ->> 'sort_order')::integer) - 1 as place
              from jsonb_array_elements(asks) where value ->> 'screen_key' = sign ->> 'id') x);

  -- The form's wording, by the fields an older build reads; the wording it
  -- has no place for stays as the fallback had it.
  texts := coalesce((select jsonb_object_agg(entry.key, entry.value)
                       from jsonb_each(coalesce(fallback -> 'texts', '{}'::jsonb)) entry
                      where entry.key in ('flow_label', 'documents_title', 'required_mark', 'sign_label')),
                    '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'intro', private.authorization_legacy_text(document -> 'intro', 'intro'),
      'continue_label', private.json_value_or_null(document -> 'texts' -> 'continue_label'),
      'health_title', case when health is not null then private.authorization_legacy_text(health -> 'title', 'health_title')
                           else fallback -> 'texts' -> 'health_title' end,
      'consents_title', private.authorization_legacy_text(sign -> 'title', 'consents_title'),
      'sign_and_enter_label', private.json_value_or_null(sign -> 'texts' -> 'continue_label'),
      'reregistration_title', private.authorization_legacy_text(rereg -> 'title', 'reregistration_title'),
      'reregistration_intro', private.authorization_legacy_text(rereg -> 'intro', 'reregistration_intro'),
      'reregistration_correct_label', private.json_value_or_null(rereg -> 'texts' -> 'continue_label'),
      'reregistration_edit_label', private.json_value_or_null(rereg -> 'texts' -> 'decline_label'),
      'reregistration_season_intro', private.authorization_legacy_text(season -> 'intro', 'reregistration_season_intro'),
      'signature_title', private.json_value_or_null(main -> 'settings' -> 'texts' -> 'signature_title'),
      'signature_prompt', private.json_value_or_null(main -> 'settings' -> 'texts' -> 'signature_prompt'),
      'signature_hint', private.json_value_or_null(main -> 'settings' -> 'texts' -> 'signature_hint'),
      'cannot_draw_label', private.json_value_or_null(main -> 'settings' -> 'texts' -> 'cannot_draw_label'),
      'cannot_draw_hint', private.json_value_or_null(main -> 'settings' -> 'texts' -> 'cannot_draw_hint')));
  if not private.authorization_override_texts_valid(texts, 'texts') then
    texts := coalesce(fallback -> 'texts', '{}'::jsonb);
  end if;

  content := jsonb_build_object(
    'title', coalesce(title, fallback -> 'title', private.authorization_form_name()),
    'sections', coalesce(sections, fallback -> 'sections'),
    'consents', coalesce(consents, fallback -> 'consents'),
    'texts', texts,
    'attachments', coalesce(private.json_value_or_null(document -> 'attachments'), fallback -> 'attachments', '[]'::jsonb))
    || case when health is not null and (health ->> 'sort_order')::integer < (document ->> 'sort_order')::integer
            then '{"screen_order": ["health", "document"]}'::jsonb else '{}'::jsonb end;
  if not private.authorization_content_valid(content) then
    content := coalesce(fallback, private.authorization_minimal_content(p_org_id, title));
  end if;

  compatible := rereg is not null and season is not null and sign is not null and document is not null
    and title is not null and sections is not null and consents is not null
    -- The old walk: re-registration, the document and the Health screen, the signature.
    and (rereg ->> 'sort_order')::integer < (season ->> 'sort_order')::integer
    and screens -> 0 = rereg and screens -> 1 = season
    and sign = screens -> (jsonb_array_length(screens) - 1)
    and own_screens = case when health is null then 1 else 2 end
    and not exists (select 1 from jsonb_array_elements(screens) s
                     where private.json_value_or_null(s -> 'show_when_field_id') is not null)
    -- The document: its text, nothing she answers.
    and private.json_value_or_null(document -> 'texts' -> 'help') is null
    and not exists (select 1 from jsonb_array_elements(blocks) b
                     where b ->> 'screen_key' = document ->> 'id' and b ->> 'kind' <> 'text')
    and jsonb_array_length(sections) = (select count(*) from jsonb_array_elements(blocks) b
                                          where b ->> 'screen_key' = document ->> 'id')
    -- The Health screen: questions only, one title, the document's button.
    and (health is null or (
      private.json_value_or_null(health -> 'intro') is null
      and private.json_value_or_null(health -> 'texts' -> 'help') is null
      and private.json_value_or_null(health -> 'texts' -> 'continue_label')
          is not distinct from private.json_value_or_null(document -> 'texts' -> 'continue_label')
      and not exists (select 1 from jsonb_array_elements(blocks) b where b ->> 'screen_key' = health ->> 'id')))
    and not exists (select 1 from jsonb_array_elements(questions) q
                     where q ->> 'screen_key' is distinct from health ->> 'id')
    -- The last screen: the consents and her signature.
    and private.json_value_or_null(sign -> 'intro') is null
    and private.json_value_or_null(sign -> 'texts' -> 'help') is null
    and not exists (select 1 from jsonb_array_elements(asks) p where p ->> 'screen_key' <> sign ->> 'id')
    and main is not null and main ->> 'screen_key' = sign ->> 'id'
    and main -> 'body' = private.authorization_signature_text()
    and not exists (select 1 from jsonb_array_elements(blocks) b
                     where b ->> 'screen_key' = sign ->> 'id' and b ->> 'id' <> main ->> 'id')
    -- The re-registration screens as the app draws them.
    and private.json_value_or_null(rereg -> 'texts' -> 'help') is null
    and private.json_value_or_null(season -> 'texts' -> 'help') is null
    and season -> 'title' = rereg -> 'title'
    and private.json_value_or_null(season -> 'texts' -> 'continue_label')
        is not distinct from private.json_value_or_null(document -> 'texts' -> 'continue_label')
    and private.authorization_content_valid(content)
    and content -> 'title' = title and content -> 'sections' = sections and content -> 'consents' = consents;
  return jsonb_build_object('content', content, 'compatible', coalesce(compatible, false));
end;
$$;
revoke all on function private.authorization_form_legacy(uuid, jsonb, jsonb) from public, anon, authenticated;

-- What a version shows: its snapshot, or the form itself for the draft.
create or replace function private.authorization_version_snapshot(p_version public.authorization_versions)
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
        from public.custom_forms f where f.org_id = p_version.org_id and f.system_key = 'season_authorization')
    else coalesce(p_version.form_snapshot, private.authorization_snapshot_from_content(
      p_version.org_id, private.authorization_form_id(p_version.org_id), p_version.content, '[]'::jsonb, null)) end;
$$;
revoke all on function private.authorization_version_snapshot(public.authorization_versions) from public, anon, authenticated;

-- Whether an older build may show and sign the version.
create or replace function private.authorization_version_compatible(p_version public.authorization_versions)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_version.id is null then true
    when p_version.published_at is not null then coalesce(p_version.legacy_compatible, true)
    else coalesce((private.authorization_form_legacy(p_version.org_id,
                                                     private.authorization_version_snapshot(p_version),
                                                     p_version.content) ->> 'compatible')::boolean, true) end;
$$;
revoke all on function private.authorization_version_compatible(public.authorization_versions)
  from public, anon, authenticated;

-- The consents a version asks, in its order: the key, the text as she reads
-- it, whether it is required and the screen it is on.
create or replace function private.authorization_version_consents(p_version public.authorization_versions)
returns table (consent_key text, label jsonb, required boolean, sort_position integer, screen_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select p -> 'consent' ->> 'key', p -> 'consent' -> 'body', (p ->> 'required')::boolean,
         (row_number() over (order by s.place, (p ->> 'sort_order')::integer) - 1)::integer, p ->> 'screen_key'
    from jsonb_array_elements(coalesce(private.authorization_version_snapshot(p_version) -> 'consent_placements',
                                       '[]'::jsonb)) p
    left join lateral (
      select (x ->> 'sort_order')::integer as place
        from jsonb_array_elements(private.authorization_version_snapshot(p_version) -> 'screens') x
       where x ->> 'id' = p ->> 'screen_key') s on true
   order by 4;
$$;
revoke all on function private.authorization_version_consents(public.authorization_versions)
  from public, anon, authenticated;

-- The version a player or the team signs now: what her phone shows, and for
-- the team the version in force, else the form itself.
create or replace function private.authorization_snapshot_for(p_org_id uuid, p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.authorization_version_snapshot(v)
       from private.authorization_version_for(p_org_id, p_profile_id) v where v.id is not null),
    (select private.custom_form_content(f.id) from public.custom_forms f
      where f.org_id = p_org_id and f.system_key = 'season_authorization'));
$$;
revoke all on function private.authorization_snapshot_for(uuid, uuid) from public, anon, authenticated;

-- 5. The locked parts ----------------------------------------------------------------------------------------

-- A legal form's own signature stays on its screen: never removed, its kind
-- and its mark kept; its texts may change. The form's own writes move it; an
-- organization that goes takes it. The body of
-- `20261104150000_app_terms_as_legal_form.sql`, for both forms.
create or replace function private.locked_form_block_stays()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  which text := case old.settings ->> 'system' when 'terms_signature' then 'the app terms'
                                               else 'the season authorization' end;
begin
  if old.settings ->> 'system' is null or current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise check_violation using message = 'the signature of ' || which || ' is never removed';
    end if;
    return old;
  end if;
  if (new.settings - 'texts') is distinct from (old.settings - 'texts') or new.kind <> old.kind
     or new.screen_key is distinct from old.screen_key then
    raise check_violation using message = 'the signature of ' || which || ' stays where it is';
  end if;
  return new;
end;
$$;

-- A legal form of the app is asked as it always was: the terms once, to use
-- the app; the authorization every season, to use the app.
create or replace function private.app_terms_form_choices_stay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_key is not null
     and (new.filled_by <> old.filled_by or new.mandatory <> old.mandatory
          or new.deadline is distinct from old.deadline or new.audience <> old.audience
          or new.repeats_each_season <> old.repeats_each_season) then
    raise check_violation using message = case old.system_key
      when 'app_terms' then 'the app terms are asked of every player, to use the app'
      else 'the season authorization is asked of every player, every season, to use the app' end;
  end if;
  return new;
end;
$$;

-- Nothing goes on the old Health and consents screens any more, and the
-- re-registration screens hold nothing: the app draws them.
create or replace function private.authorization_placement_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.surface = 'authorization' then
    raise check_violation
      using message = 'the season authorization is a form: its questions and consents are placed on its screens';
  end if;
  if new.surface = 'custom_form' and exists (
       select 1 from public.custom_form_screens s
        where s.id::text = new.screen_key and s.system_screen in ('reregistration', 'reregistration_season')) then
    raise check_violation using message = 'the re-registration screens are drawn by the app and hold nothing';
  end if;
  return new;
end;
$$;
revoke all on function private.authorization_placement_guard() from public, anon, authenticated;

-- Asking her health on the authorization needs its explicit consent (RAPP-698).
create or replace function private.authorization_asks_health(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.field_placements pl
     where pl.org_id = p_org_id and pl.surface = 'custom_form'
       and pl.custom_form_id = private.authorization_form_id(p_org_id)
       and private.custom_form_screen_live(pl.screen_key)
       and pl.field_id = (private.authorization_field(p_org_id, 'health_info')).id);
$$;

-- The consents the authorization form places now, as old content held them.
create or replace function private.authorization_consents_snapshot(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.p -> 'consent' ->> 'key', jsonb_build_object(
           'label', x.p -> 'consent' -> 'body', 'required', (x.p ->> 'required')::boolean, 'position', x.place)),
         '{}'::jsonb)
    from (select value as p, (row_number() over (order by (value ->> 'sort_order')::integer) - 1)::integer as place
            from jsonb_array_elements(coalesce(private.custom_form_content(private.authorization_form_id(p_org_id))
                                               -> 'consent_placements', '[]'::jsonb))) x;
$$;

-- The body of `20261026230000_dades_legals_consents.sql`: the authorization's
-- consents are on its form now.
create or replace function public.remove_consent_placement(p_placement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  placement public.consent_placements;
  consent public.consents;
begin
  select * into placement from public.consent_placements where id = p_placement_id and org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  select * into consent from public.consents where id = placement.consent_id;
  if placement.custom_form_id = private.authorization_form_id(actor_org) then
    -- Asking her health needs its explicit consent (RAPP-698).
    if consent.key = 'health_data' and private.authorization_asks_health(actor_org) then
      raise check_violation using message = 'the authorization asks her health: its consent stays';
    end if;
    if not exists (select 1 from public.consent_placements p
                    where p.custom_form_id = placement.custom_form_id and p.id <> placement.id) then
      raise check_violation using message = 'the authorization keeps one consent at least';
    end if;
  end if;
  delete from public.consent_placements where id = placement.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.placement_remove', 'consent', consent.id,
          jsonb_build_object('surface', placement.surface, 'screen', placement.screen_key,
                             'custom_form', placement.custom_form_id));
end;
$$;

create or replace function public.archive_consent(p_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  consent public.consents;
  authorization_form uuid := private.authorization_form_id(actor_org);
begin
  select * into consent from public.consents where id = p_id and org_id = actor_org for update;
  if consent.id is null then
    raise no_data_found using message = 'no such consent';
  end if;
  if p_archived is null then
    raise invalid_parameter_value using message = 'say whether the consent is archived';
  end if;
  if p_archived then
    if consent.key = 'health_data' and private.authorization_asks_health(actor_org)
       and exists (select 1 from public.consent_placements p
                    where p.consent_id = consent.id and p.custom_form_id = authorization_form) then
      raise check_violation using message = 'the authorization asks her health: its consent stays';
    end if;
    if exists (select 1 from public.consent_placements p
                where p.consent_id = consent.id and p.custom_form_id = authorization_form)
       and not exists (select 1 from public.consent_placements p
                        where p.custom_form_id = authorization_form and p.consent_id <> consent.id) then
      raise check_violation using message = 'the authorization keeps one consent at least';
    end if;
    delete from public.consent_placements where consent_id = consent.id;
  end if;
  update public.consents set is_archived = p_archived, updated_at = now() where id = consent.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.archive', 'consent', consent.id,
          jsonb_build_object('key', consent.key, 'archived', p_archived));
end;
$$;

-- A field the authorization requires is required for her, as on the old Health screen.
create or replace function private.field_required_for_her(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.field_placements p
                  where p.field_id = p_field_id and p.required
                    and (p.surface in ('onboarding', 'season')
                         or (p.surface = 'custom_form' and private.custom_form_screen_live(p.screen_key)
                             and exists (select 1 from public.custom_forms f
                                          where f.id = p.custom_form_id
                                            and f.system_key = 'season_authorization'))));
$$;

-- The version's consents join the catalogue (RAPP-699); where they are asked
-- is the authorization form's (RAPP-773).
create or replace function private.consents_from_authorization(p_org_id uuid, p_content jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
end;
$$;

-- A new organization's Health screen fields (RAPP-698), placed on its
-- authorization form's Health screen.
create or replace function private.seed_authorization_fields(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  questions jsonb := coalesce(
    (private.current_authorization_version(p_org_id)).content -> 'questions',
    '{"health": {"asked": true, "required": true},
      "emergency_contact": {"asked": true, "required": false}}'::jsonb);
  authorization_form uuid;
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

  authorization_form := private.ensure_authorization_form(p_org_id);
  insert into public.field_placements (org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
  select p_org_id, f.id, 'custom_form', private.authorization_stable_id(p_org_id, 'health_screen')::text,
         authorization_form, d.position,
         coalesce((questions -> d.question ->> 'required')::boolean, false) and d.can_require
    from (values
      ('health_info', 'health', 0, true),
      ('emergency_contact_name', 'emergency_contact', 1, true),
      ('emergency_contact_relation', 'emergency_contact', 2, false),
      ('emergency_contact_phone', 'emergency_contact', 3, true)
    ) as d(system_key, question, position, can_require)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = d.system_key
   where coalesce((questions -> d.question ->> 'asked')::boolean, true)
     and private.custom_form_screen_live(private.authorization_stable_id(p_org_id, 'health_screen')::text)
  on conflict (field_id, surface, custom_form_id, shared_screen) do nothing;
end;
$$;

-- Its consents, ordered as her authorization asks them.
create or replace function public.participant_consents(p_profile_id uuid)
returns table (consent_key text, granted boolean, decided_at timestamptz, method text, wording text,
               language text, required boolean, season_name text, version_number integer,
               consent_id uuid, name jsonb, form text, recorded_by_name text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her consents need participants.view_personal';
  end if;
  return query
    select latest.consent_key, latest.granted, latest.decided_at, latest.method, latest.wording,
           latest.language, latest.required, latest.season_name, latest.version_number,
           latest.consent_id, latest.name, latest.form, latest.recorded_by_name, latest.reason
      from (
        select distinct on (h.consent_id) h.*
          from public.participant_consent_history(p_profile_id) h
         order by h.consent_id, h.decided_at desc, h.event_id desc
      ) latest
      left join public.consent_placements p
        on p.consent_id = latest.consent_id
       and p.custom_form_id = private.authorization_form_id(
             (select pr.org_id from public.profiles pr where pr.id = p_profile_id))
     order by coalesce(p.sort_order, 1000), latest.consent_key;
end;
$$;

-- An optional consent of the version in force, or withdrawing any consent she
-- gave that it does not require: read from the version's snapshot.
create or replace function public.set_optional_consent(p_key text, p_granted boolean, p_language text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
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
$$;

-- 6. Editing the parts the form engine has no editor for -----------------------------------------------------

-- The season documents of the authorization's document screen.
create or replace function public.save_form_screen_attachments(p_screen_id uuid, p_attachments jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  screen public.custom_form_screens;
  clean jsonb := coalesce(nullif(p_attachments, 'null'::jsonb), '[]'::jsonb);
begin
  select * into screen from public.custom_form_screens
   where id = p_screen_id and org_id = actor_org and not is_archived for update;
  if screen.id is null then
    raise no_data_found using message = 'no such screen';
  end if;
  if screen.attachments is null then
    raise check_violation using message = 'only the authorization''s document screen holds documents';
  end if;
  if not private.form_attachments_valid(clean) then
    raise check_violation using message = 'up to ten documents, each an https link with its label';
  end if;
  update public.custom_form_screens set attachments = clean, updated_at = now() where id = screen.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.screen_attachments', 'custom_form_screen', screen.id,
          jsonb_build_object('count', jsonb_array_length(clean)));
end;
$$;
revoke all on function public.save_form_screen_attachments(uuid, jsonb) from public, anon;
grant execute on function public.save_form_screen_attachments(uuid, jsonb) to authenticated;

-- The texts around a legal form's own signature: its title, the line asking
-- her to sign, the help, and "No puc signar" with its help. The helps may
-- be cleared; a text left out shows the app's own.
create or replace function public.save_form_block_texts(p_block_id uuid, p_texts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  block public.form_blocks;
  clean jsonb := coalesce(nullif(p_texts, 'null'::jsonb), '{}'::jsonb);
begin
  select * into block from public.form_blocks where id = p_block_id and org_id = actor_org for update;
  if block.id is null then
    raise no_data_found using message = 'no such block';
  end if;
  if block.kind <> 'signature' or block.settings ->> 'system' is null then
    raise check_violation using message = 'only a legal form''s own signature has its texts';
  end if;
  if jsonb_typeof(clean) <> 'object' or exists (
       select 1 from jsonb_each(clean) entry
        where not (entry.key = any (array['signature_title', 'signature_prompt', 'signature_hint',
                                          'cannot_draw_label', 'cannot_draw_hint']))
           or not private.authorization_override_texts_valid(jsonb_build_object(entry.key, entry.value), 'texts')) then
    raise check_violation using message = 'a signature''s texts are its title, prompt, help and cannot-draw texts';
  end if;
  update public.form_blocks set settings = settings || jsonb_build_object('texts', clean), updated_at = now()
   where id = block.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'form_block.texts', 'form_block', block.id,
          jsonb_build_object('fields', (select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
                                          from jsonb_object_keys(clean) key)));
end;
$$;
revoke all on function public.save_form_block_texts(uuid, jsonb) from public, anon;
grant execute on function public.save_form_block_texts(uuid, jsonb) to authenticated;

-- 7. A change to the form opens the draft ------------------------------------------------------------------

-- The organization's one draft row, with the old content the form gives now:
-- what a test player is shown and what Publica numbers.
create or replace function private.touch_authorization_draft(p_org_id uuid, p_fallback jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorization_form uuid := private.authorization_form_id(p_org_id);
  draft public.authorization_versions;
  fallback jsonb;
  legacy jsonb;
begin
  if authorization_form is null or current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return;
  end if;
  select * into draft from public.authorization_versions
   where org_id = p_org_id and published_at is null for update;
  fallback := coalesce(p_fallback, draft.content, (private.current_authorization_version(p_org_id)).content,
                       (select v.content from public.authorization_versions v
                         where v.org_id = p_org_id and v.published_at is not null
                         order by v.published_at desc limit 1));
  legacy := private.authorization_form_legacy(p_org_id, private.custom_form_content(authorization_form), fallback);
  insert into public.authorization_versions (org_id, content, updated_by)
  values (p_org_id, legacy -> 'content', (select auth.uid()))
  on conflict (org_id) where published_at is null
  do update set content = excluded.content, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
revoke all on function private.touch_authorization_draft(uuid, jsonb) from public, anon, authenticated;

-- The body of `20261104150000_app_terms_as_legal_form.sql`: a change to a
-- legal form of the app opens its draft, the terms' or the authorization's.
create or replace function private.app_terms_form_touched()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched_form uuid;
  touched record;
begin
  if current_setting('ramassa.app_terms_form_sync', true) = 'on' then
    return null;
  end if;
  if tg_table_name = 'consents' then
    for touched in
      select distinct f.org_id, f.system_key
        from public.consent_placements p join public.custom_forms f on f.id = p.custom_form_id
       where p.consent_id = new.id and f.system_key is not null
    loop
      if touched.system_key = 'app_terms' then
        perform private.touch_app_terms_draft(touched.org_id);
      else
        perform private.touch_authorization_draft(touched.org_id);
      end if;
    end loop;
    return null;
  elsif tg_table_name = 'custom_form_screens' then
    if tg_op = 'DELETE' then touched_form := old.form_id; else touched_form := new.form_id; end if;
  elsif tg_op = 'DELETE' then
    touched_form := old.custom_form_id;
  else
    touched_form := new.custom_form_id;
  end if;
  if touched_form is null then
    return null;
  end if;
  select f.org_id, f.system_key into touched from public.custom_forms f
   where f.id = touched_form and f.system_key is not null;
  if touched.system_key = 'app_terms' then
    perform private.touch_app_terms_draft(touched.org_id);
  elsif touched.system_key = 'season_authorization' then
    perform private.touch_authorization_draft(touched.org_id);
  end if;
  return null;
end;
$$;

-- 8. The ledger: draft, discard, publish ---------------------------------------------------------------------

-- The old call (the Onboarding setup import, an older Control Center): the
-- form is rebuilt from the old content, keeping its questions, and keeping
-- the consents it places, as the old draft took the placed consents; the
-- draft holds it.
create or replace function public.save_authorization_draft(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  authorization_form uuid;
  current_content jsonb;
  saved uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization draft needs settings.organization or onboarding.design';
  end if;
  if not private.authorization_content_valid(p_content) then
    raise check_violation using message = 'the authorization needs its title, sections, consents and questions';
  end if;
  perform private.consents_from_authorization(actor_org, p_content);
  authorization_form := private.ensure_authorization_form(actor_org);
  current_content := private.custom_form_content(authorization_form);
  perform private.restore_legal_form(authorization_form, private.authorization_snapshot_from_content(
    actor_org, authorization_form, p_content, current_content -> 'placements',
    nullif(current_content -> 'consent_placements', '[]'::jsonb)));
  perform private.touch_authorization_draft(actor_org, p_content);
  select id into saved from public.authorization_versions where org_id = actor_org and published_at is null;
  -- The shape only: the text is in the draft itself.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.draft_saved', 'authorization_version', saved,
          jsonb_build_object(
            'consents', (select jsonb_agg(c.consent_key order by c.sort_position)
                           from private.authorization_consents(p_content) c),
            'required', (select coalesce(jsonb_agg(c.consent_key order by c.sort_position), '[]'::jsonb)
                           from private.authorization_consents(p_content) c where c.required)));
  return saved;
end;
$$;

-- The form goes back to the version in force, and the draft row goes with
-- the test players' signatures of it.
create or replace function public.discard_authorization_draft()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  draft uuid;
  in_force public.authorization_versions;
  authorization_form uuid;
  draft_signatures integer;
  draft_consent_events integer;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization draft needs settings.organization or onboarding.design';
  end if;
  perform 1 from public.organizations where id = actor_org for update;
  select id into draft from public.authorization_versions
   where org_id = actor_org and published_at is null
   for update;
  -- The form as the version in force published it: the current season's,
  -- else the latest published.
  in_force := private.current_authorization_version(actor_org);
  if in_force.id is null then
    select * into in_force from public.authorization_versions v
     where v.org_id = actor_org and v.published_at is not null
     order by v.published_at desc limit 1;
  end if;
  authorization_form := private.authorization_form_id(actor_org);
  if authorization_form is not null and in_force.form_snapshot is not null then
    perform private.restore_legal_form(authorization_form, in_force.form_snapshot);
  end if;
  if draft is null then
    return;
  end if;
  -- Test players' signatures of the draft go with it (their consents follow
  -- by cascade), and their signatures of its other blocks.
  delete from public.form_signatures g
   using public.authorization_signatures s
   where s.version_id = draft and g.profile_id = s.profile_id
     and g.custom_form_id = authorization_form and g.signed_at = s.signed_at;
  delete from public.authorization_signatures where version_id = draft;
  get diagnostics draft_signatures = row_count;
  -- Her profile decisions on the draft's consents go too (pending fix 30).
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  delete from public.consent_events where version_id = draft;
  perform set_config('ramassa.consent_event_erasure', '', true);
  get diagnostics draft_consent_events = row_count;
  delete from public.authorization_versions where id = draft;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'authorization.draft_discarded', 'authorization_version',
          draft, jsonb_build_object('test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events));
end;
$$;

-- The body of `20261026230000_dades_legals_consents.sql` (RAPP-694 seasons,
-- RAPP-696 corrections): the version freezes the form and writes the old
-- content from it.
create or replace function public.publish_authorization_draft(p_season_id uuid default null, p_is_correction boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.authorization_versions;
  current_season public.seasons;
  target public.seasons;
  previous public.authorization_versions;
  next_number integer;
  draft_signatures integer;
  draft_consent_events integer;
  authorization_form uuid;
  snapshot jsonb;
  legacy jsonb;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization';
  end if;
  if p_is_correction is null then
    raise invalid_parameter_value using message = 'say whether this is a correction';
  end if;
  select * into current_season from public.seasons
   where id = private.current_season_id(actor_org);
  if p_season_id is null then
    if current_season.id is null then
      raise object_not_in_prerequisite_state using message = 'the organization has no current season';
    end if;
    target := current_season;
  else
    select * into target from public.seasons where id = p_season_id and org_id = actor_org;
    if target.id is null then
      raise no_data_found using message = 'that season is not one of the organization''s';
    end if;
    if target.id is distinct from current_season.id
       and target.starts_on <= coalesce(current_season.starts_on, current_date - 1) then
      raise invalid_parameter_value using message = 'a past season takes no new authorization';
    end if;
  end if;
  select * into draft from public.authorization_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  perform 1 from public.seasons where id = target.id for update;
  select * into previous from public.authorization_versions v
   where v.season_id = target.id and v.published_at is not null
   order by v.version_number desc limit 1;
  -- A correction fixes a version of that season (RAPP-696).
  if p_is_correction and previous.id is null then
    raise object_not_in_prerequisite_state
      using message = 'a correction needs a published version of that season to correct';
  end if;

  authorization_form := private.authorization_form_id(actor_org);
  if authorization_form is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no authorization form';
  end if;
  snapshot := private.custom_form_content(authorization_form);
  if not exists (select 1 from jsonb_array_elements(snapshot -> 'screens') s
                  where s ->> 'system_screen' = 'authorization_sign') then
    raise check_violation using message = 'the authorization ends on the screen she signs';
  end if;
  -- Who signed is not asked again: a correction may not ask her more (RAPP-771).
  if p_is_correction and private.correction_adds_a_requirement(
       coalesce(previous.form_snapshot, private.authorization_version_snapshot(previous)), snapshot) then
    raise check_violation
      using message = 'a correction adds no required question, consent or signature: publish a new version';
  end if;
  legacy := private.authorization_form_legacy(actor_org, snapshot, coalesce(previous.content, draft.content));

  -- Test players' signatures of the draft go: a published version never
  -- carries one (RAPP-619), nor their signatures of its other blocks.
  delete from public.form_signatures g
   using public.authorization_signatures s
   where s.version_id = draft.id and g.profile_id = s.profile_id
     and g.custom_form_id = authorization_form and g.signed_at = s.signed_at;
  delete from public.authorization_signatures where version_id = draft.id;
  get diagnostics draft_signatures = row_count;
  -- Her profile decisions on the draft's consents go too (pending fix 30).
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  delete from public.consent_events where version_id = draft.id;
  perform set_config('ramassa.consent_event_erasure', '', true);
  get diagnostics draft_consent_events = row_count;
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = target.id;
  update public.authorization_versions
     set season_id = target.id, version_number = next_number, published_at = now(),
         content = legacy -> 'content', form_snapshot = snapshot,
         legacy_compatible = coalesce((legacy ->> 'compatible')::boolean, false),
         published_by = actor, is_correction = p_is_correction
   where id = draft.id;
  update public.custom_forms
     set version = greatest(version, next_number), published_at = coalesce(published_at, now()), updated_at = now()
   where id = authorization_form;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', draft.id,
          jsonb_build_object('season_id', target.id, 'version_number', next_number, 'from_draft', true,
                             'is_correction', p_is_correction,
                             'test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events,
                             'legacy_compatible', coalesce((legacy ->> 'compatible')::boolean, false),
                             'for_current_season', target.id is not distinct from current_season.id));
  return next_number;
end;
$$;

-- The oldest call, publishing content straight to the current season: the
-- version keeps the form its content says.
create or replace function public.publish_authorization_version(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  season uuid;
  next_number integer;
  saved uuid;
  authorization_form uuid;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization';
  end if;
  season := private.current_season_id(actor_org);
  if season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  if not private.authorization_content_valid(p_content) then
    raise check_violation using message = 'the authorization needs its title, sections, consents and questions';
  end if;
  authorization_form := private.ensure_authorization_form(actor_org);

  perform 1 from public.seasons where id = season for update;
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = season;

  insert into public.authorization_versions (org_id, season_id, version_number, content, published_at, published_by,
                                             form_snapshot, legacy_compatible)
  values (actor_org, season, next_number, p_content, now(), actor,
          private.authorization_snapshot_from_content(
            actor_org, authorization_form, p_content,
            private.custom_form_content(authorization_form) -> 'placements', null),
          true)
  returning id into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', saved,
          jsonb_build_object('season_id', season, 'version_number', next_number));
  return saved;
end;
$$;

-- 9. Her signature -------------------------------------------------------------------------------------------

-- Whether a screen of a version opens for her: as `private.content_screen_opens`,
-- reading the answers she sends with it before the ones she gave.
create or replace function private.snapshot_screen_opens(
  p_profile_id uuid, p_snapshot jsonb, p_screen_key text, p_answers jsonb, p_depth integer default 0)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  screen jsonb;
  field public.profile_fields;
  answer jsonb;
  parent text;
begin
  if p_depth > 64 then
    return false;
  end if;
  select s into screen from jsonb_array_elements(p_snapshot -> 'screens') s where s ->> 'id' = p_screen_key;
  if screen is null then
    return false;
  end if;
  if private.json_value_or_null(screen -> 'show_when_field_id') is null then
    return true;
  end if;
  select * into field from public.profile_fields where id = (screen ->> 'show_when_field_id')::uuid;
  if field.id is null or field.is_archived then
    return false;
  end if;
  answer := case when coalesce(p_answers, '{}'::jsonb) ? field.id::text then p_answers -> field.id::text
                 when p_profile_id is null then null
                 else private.field_answer_now(p_profile_id, field) end;
  if not private.answer_matches(answer, array(select jsonb_array_elements_text(
                                                 coalesce(screen -> 'show_when_values', '[]'::jsonb)))) then
    return false;
  end if;
  select p ->> 'screen_key' into parent
    from jsonb_array_elements(p_snapshot -> 'placements') p
   where p ->> 'field_id' = field.id::text
   limit 1;
  return parent is null or private.snapshot_screen_opens(p_profile_id, p_snapshot, parent, p_answers, p_depth + 1);
end;
$$;
revoke all on function private.snapshot_screen_opens(uuid, jsonb, text, jsonb, integer) from public, anon, authenticated;

-- Her ticks and her signature against the version she signs. A new build
-- sends the form's payload (`signatures` by block, the authorization's own
-- one among them); an older build, and a tablet entry signed before, the old
-- one (`signature`, `unable_to_draw`), taken for a version an older build can
-- show. Returns her drawing of the authorization's own signature (null when
-- she could not draw) and whether she said so.
drop function private.validate_signing_payload(jsonb, jsonb);
create function private.validate_signing_payload(
  p_payload jsonb, p_version public.authorization_versions, p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  if shown_language is not null and shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
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
$$;
revoke all on function private.validate_signing_payload(jsonb, public.authorization_versions, uuid)
  from public, anon, authenticated;

-- Her answers against the version: only its questions, each fitting its
-- field, every required one on a screen she was shown answered now or
-- before, and her health answer with its consent.
drop function private.check_signing_answers(uuid, uuid, jsonb, jsonb);
create function private.check_signing_answers(
  p_org_id uuid, p_profile_id uuid, p_version public.authorization_versions, p_payload jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb := private.authorization_version_snapshot(p_version);
  answers jsonb := private.signing_answers(p_org_id, p_payload);
  entry record;
  field public.profile_fields;
  health public.profile_fields := private.authorization_field(p_org_id, 'health_info');
begin
  for entry in select key, value from jsonb_each(answers) loop
    field := null;
    select * into field from public.profile_fields f
     where f.org_id = p_org_id and f.id::text = entry.key and not f.is_archived
       and exists (select 1 from jsonb_array_elements(snapshot -> 'placements') p
                    where p ->> 'field_id' = f.id::text);
    if field.id is null then
      raise check_violation using message = 'not a question of the authorization';
    end if;
    if not private.custom_answer_is_empty(entry.value)
       and not private.custom_answer_valid(field, private.custom_answer_tidied(field.question_type, entry.value)) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
  end loop;
  -- Every required question on a screen she was shown, answered now or before.
  if exists (
    select 1
      from jsonb_array_elements(snapshot -> 'placements') p
      join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived
     where (p ->> 'required')::boolean
       and private.snapshot_screen_opens(p_profile_id, snapshot, p ->> 'screen_key', answers)
       and (f.show_when_field_id is null or exists (
             select 1 from public.profile_fields gate
              where gate.id = f.show_when_field_id
                and case when answers ? gate.id::text then answers -> gate.id::text
                         when p_profile_id is null then null
                         else private.field_answer_now(p_profile_id, gate) end
                    = to_jsonb(f.show_when_option_id::text)))
       and case when answers ? f.id::text
                then private.custom_answer_is_empty(answers -> f.id::text)
                else p_profile_id is null or private.field_answer_now(p_profile_id, f) is null
           end
  ) then
    raise not_null_violation using message = 'a required question of the authorization has no answer';
  end if;
  -- Her health answer needs her explicit consent to its processing.
  if health.id is not null
     and not private.custom_answer_is_empty(coalesce(answers -> health.id::text, 'null'::jsonb))
     and exists (select 1 from jsonb_array_elements(snapshot -> 'consent_placements') p
                  where p -> 'consent' ->> 'key' = 'health_data')
     and (p_payload -> 'consents' -> 'health_data') is distinct from 'true'::jsonb then
    raise check_violation using message = 'the medical answer needs the health data consent';
  end if;
end;
$$;
revoke all on function private.check_signing_answers(uuid, uuid, public.authorization_versions, jsonb)
  from public, anon, authenticated;

-- The body of `20261026230000_dades_legals_consents.sql`: her signature of the
-- version's own block is her signature of it, her other signatures are kept
-- with their text, and her ticks are recorded with the version's wording.
create or replace function private.record_signature(p_signature_id uuid, p_profile_id uuid, p_version_id uuid,
                                                     p_payload jsonb, p_method text, p_witness uuid,
                                                     p_signed_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  version public.authorization_versions;
  consents jsonb := coalesce(nullif(p_payload -> 'consents', 'null'::jsonb), '{}'::jsonb);
  shown_language text := nullif(p_payload ->> 'language', '');
  on_draft boolean;
  checked jsonb;
  snapshot jsonb;
  answers jsonb;
  drawing jsonb;
  signed_at timestamptz := coalesce(p_signed_at, now());
  block jsonb;
  given jsonb;
  block_language text;
  authorization_form uuid;
  media boolean;
begin
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;

  select * into target from public.profiles where id = p_profile_id;
  -- "Is it a draft" is decided on the locked row (pending fix 29).
  select * into version from public.authorization_versions where id = p_version_id for share;
  on_draft := version.id is not null and version.published_at is null;
  if on_draft then
    if not private.sees_onboarding_drafts(target.id) then
      raise check_violation using message = 'only a test player signs a draft';
    end if;
    version.season_id := private.current_season_id(target.org_id);
  end if;
  if target.id is null or version.id is null or version.org_id <> target.org_id
    or version.season_id is null
    or version.season_id is distinct from private.current_season_id(target.org_id)
  then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  checked := private.validate_signing_payload(p_payload, version, target.id);
  perform private.check_signing_answers(target.org_id, target.id, version, p_payload);
  snapshot := private.authorization_version_snapshot(version);
  answers := private.signing_answers(target.org_id, p_payload);
  drawing := private.json_value_or_null(checked -> 'drawing');
  authorization_form := private.authorization_form_id(target.org_id);

  insert into public.authorization_signatures (
    id, org_id, profile_id, season_id, version_id, method, language, device,
    signed_at, signature, unable_to_draw, witnessed_by, is_test_fixture
  ) values (
    p_signature_id, target.org_id, target.id, version.season_id, version.id, p_method,
    shown_language,
    left(nullif(btrim(p_payload ->> 'device'), ''), 200),
    signed_at, drawing, drawing is null, p_witness, on_draft
  )
  on conflict (id) do nothing;

  -- Every consent of the version on a screen she was shown, with the words
  -- she was shown.
  insert into public.consent_events
    (org_id, profile_id, signature_id, consent_key, granted, method, decided_at,
     version_id, language, wording, required, screen_key)
  select target.org_id, target.id, p_signature_id, consent.consent_key,
         coalesce((consents ->> consent.consent_key)::boolean, false), p_method,
         signed_at, version.id, coalesce(shown_language, 'ca'),
         private.localized_text_in(consent.label, coalesce(shown_language, 'ca')), consent.required,
         consent.screen_key
    from private.authorization_version_consents(version) consent
   where private.snapshot_screen_opens(target.id, snapshot, consent.screen_key, answers)
   order by consent.sort_position;

  -- Image rights drive the photo consent, when the version asks them.
  select coalesce((consents ->> 'image_rights')::boolean, false) into media
    from private.authorization_version_consents(version) consent
   where consent.consent_key = 'image_rights'
     and private.snapshot_screen_opens(target.id, snapshot, consent.screen_key, answers)
   limit 1;
  perform set_config('ramassa.consent_event_written', 'on', true);
  update public.profiles set
    media_consent_at = case
      when media is null then media_consent_at
      when media then coalesce(media_consent_at, now())
      else null
    end
  where id = target.id;
  perform set_config('ramassa.consent_event_written', '', true);
  -- Her answers, through the one answer writer (RAPP-698).
  perform private.write_field_answers(target.id, answers, 'player', null, true);

  -- Her signatures of the version's other blocks, with the text it published.
  if (checked ->> 'is_form')::boolean then
    for block in select value from jsonb_array_elements(snapshot -> 'blocks')
                  where coalesce(value ->> 'kind', 'signature') = 'signature'
                    and value -> 'settings' ->> 'system' is distinct from 'authorization_signature'
                    and private.snapshot_screen_opens(target.id, snapshot, value ->> 'screen_key', answers) loop
      given := p_payload -> 'signatures' -> (block ->> 'id');
      block_language := case when length(btrim(coalesce(block -> 'body' ->> (given ->> 'language'), ''))) > 0
                             then given ->> 'language' else 'ca' end;
      insert into public.form_signatures (
        org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind,
        signer_user_id, signer_name, strokes, unable_to_draw, custom_form_id, signed_at,
        signed_on_tablet, witnessed_by)
      values (
        target.org_id, target.id, 'custom_form',
        (select b.id from public.form_blocks b where b.id = (block ->> 'id')::uuid),
        block ->> 'screen_key', block -> 'body' ->> block_language, block_language, 'player', target.id,
        coalesce(nullif(concat_ws(' ', private.name_answer_text(target.id, 'first_name'),
                                       private.name_answer_text(target.id, 'last_name')), ''), '-'),
        case when coalesce((given ->> 'unable_to_draw')::boolean, false) then null else given -> 'strokes' end,
        coalesce((given ->> 'unable_to_draw')::boolean, false), authorization_form, signed_at,
        p_method = 'staff_device', p_witness);
    end loop;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, coalesce(p_witness, target.id), 'authorization.sign', 'authorization_signature',
          p_signature_id,
          jsonb_build_object('version_id', version.id, 'method', p_method,
                             'unable_to_draw', drawing is null, 'witnessed_by', p_witness,
                             'draft', on_draft, 'form', (checked ->> 'is_form')::boolean));
  return p_signature_id;
end;
$$;

-- Her status, as before, with the version's form for a new build: its id,
-- the snapshot she walks and whether an older build can show it.
drop function public.my_authorization_status();
create function public.my_authorization_status()
returns table (
  required boolean, version_id uuid, season_id uuid, season_name text, version_number integer,
  content jsonb, is_returning boolean, is_draft boolean, form_id uuid, form_snapshot jsonb,
  legacy_compatible boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.org_id from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'player'
  ),
  current_version as (
    -- A test player is shown the draft when there is one (RAPP-619).
    select v.* from me, private.authorization_version_for(me.org_id, me.id) v where v.id is not null
  )
  select
    not exists (
      select 1 from public.authorization_signatures sig, me
       where sig.profile_id = me.id
         and sig.season_id = cv.season_id
         and ((sig.method = 'paper' and cv.published_at is not null)
              or private.authorization_signature_covers(sig.version_id, cv))
    ),
    cv.id, cv.season_id, s.name, cv.version_number, cv.content,
    -- Returning: she signed an earlier season, so this is re-registration (RAPP-306).
    exists (
      select 1 from public.authorization_signatures sig, me
       where sig.profile_id = me.id and sig.season_id <> cv.season_id
    ),
    cv.published_at is null,
    private.authorization_form_id(cv.org_id),
    private.authorization_version_snapshot(cv),
    private.authorization_version_compatible(cv)
  from current_version cv
  join public.seasons s on s.id = cv.season_id;
$$;
revoke all on function public.my_authorization_status() from public, anon;
grant execute on function public.my_authorization_status() to authenticated;

-- The version the tablet collects, as before, with its form.
drop function public.current_authorization_for_signing();
create function public.current_authorization_for_signing()
returns table (version_id uuid, season_name text, version_number integer, content jsonb,
               form_id uuid, form_snapshot jsonb, legacy_compatible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.has_permission('consents.collect')) then
    raise insufficient_privilege using message = 'collecting signatures needs consents.collect';
  end if;
  return query
    select v.id, s.name, v.version_number, v.content, private.authorization_form_id(actor_org),
           private.authorization_version_snapshot(v), private.authorization_version_compatible(v)
      from private.current_authorization_version(actor_org) v
      join public.seasons s on s.id = v.season_id
     where v.id is not null;
end;
$$;
revoke all on function public.current_authorization_for_signing() from public, anon;
grant execute on function public.current_authorization_for_signing() to authenticated;

-- 10. The walk-in tablet -------------------------------------------------------------------------------------

-- Her Onboarding signatures on the tablet: strokes, or "No puc signar".
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
    if not private.is_uuid_text(entry.key) or not private.form_signature_given_valid(entry.value) then
      raise check_violation using message = 'a signature is its strokes and the language it was shown in';
    end if;
  end loop;
end;
$$;

drop function private.walk_in_blocks_shown(uuid, jsonb);
create function private.walk_in_blocks_shown(p_org_id uuid, p_signatures jsonb)
returns table (block_id uuid, screen_key text, body text, language text, strokes jsonb, unable_to_draw boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.screen_key, b.body ->> shown.language, shown.language,
         case when shown.unable then null else entry.value -> 'strokes' end, shown.unable
    from jsonb_each(coalesce(nullif(p_signatures, 'null'::jsonb), '{}'::jsonb)) entry
    join private.live_onboarding_blocks(p_org_id) b on b.id::text = entry.key
   cross join lateral (
     select case when length(btrim(coalesce(b.body ->> (entry.value ->> 'language'), ''))) > 0
                 then entry.value ->> 'language' else 'ca' end as language,
            coalesce((entry.value ->> 'unable_to_draw')::boolean, false) as unable) shown;
$$;
revoke all on function private.walk_in_blocks_shown(uuid, jsonb) from public, anon, authenticated;

-- The body of `20261026233000_dades_legals_tablet_setup_review.sql`: her
-- signing is checked against the version's form, and her Onboarding
-- signatures may say "No puc signar".
create or replace function public.submit_walk_in_signing(p_id uuid, p_first_name text, p_last_name text,
                                                         p_version_id uuid, p_payload jsonb,
                                                         p_signed_at timestamptz,
                                                         p_block_signatures jsonb default null,
                                                         p_consents jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  perform private.validate_signing_payload(p_payload, version, null);
  -- Her answers are checked now; they are written when the team confirms her.
  perform private.check_signing_answers(actor_org, null, version, p_payload);
  -- Her Onboarding signature blocks (RAPP-691), checked before anything is kept.
  perform private.check_walk_in_block_signatures(actor_org, p_block_signatures);
  -- Her ticks of the Onboarding consents (RAPP-699), checked the same way.
  perform 1 from private.onboarding_consents_shown(actor_org, p_consents, p_payload ->> 'language', null);

  insert into public.walk_in_signings
    (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
  values (p_id, actor_org, private.name_trim(p_first_name), private.name_trim(p_last_name), p_version_id,
          public.encrypt_field(p_payload::text), p_signed_at, actor)
  on conflict (id) do nothing;
  -- They wait with the walk-in until the team confirms or merges her: the text
  -- as shown, its language, the strokes or "No puc signar", the time and the
  -- team member present.
  insert into public.walk_in_form_signatures (
    walk_in_id, org_id, block_id, screen_key, body, language, strokes, unable_to_draw, signed_at, witnessed_by)
  select p_id, actor_org, shown.block_id, shown.screen_key, shown.body, shown.language, shown.strokes,
         shown.unable_to_draw, p_signed_at, actor
    from private.walk_in_blocks_shown(actor_org, p_block_signatures) shown;
  -- They wait with the walk-in too, with the text as she read it.
  insert into public.walk_in_consents (
    walk_in_id, org_id, consent_id, consent_key, granted, required, screen_key, wording, language,
    decided_at, recorded_by)
  select p_id, actor_org, shown.consent_id, shown.consent_key, shown.granted, shown.required,
         shown.screen_key, shown.wording, shown.language, p_signed_at, actor
    from private.onboarding_consents_shown(actor_org, p_consents, p_payload ->> 'language', null) shown
  on conflict (walk_in_id, consent_id) do nothing;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'walk_in.submit', 'walk_in_signing', p_id, '{}'::jsonb);
  return p_id;
end;
$$;

-- The body of `20261026233000_dades_legals_tablet_setup_review.sql`, with "No puc signar".
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
    signer_name, strokes, unable_to_draw, signed_at, signed_on_tablet, witnessed_by)
  select p_walk_in.org_id, p_profile_id, 'wizard', w.block_id, w.screen_key, w.body, w.language, 'player',
         p_profile_id, concat_ws(' ', p_walk_in.first_name, p_walk_in.last_name), w.strokes, w.unable_to_draw,
         w.signed_at, true, w.witnessed_by
    from public.walk_in_form_signatures w
   where w.walk_in_id = p_walk_in.id;
  delete from public.walk_in_form_signatures where walk_in_id = p_walk_in.id;
  -- Her ticks of the Onboarding consents on the tablet (RAPP-699).
  insert into public.consent_events
    (org_id, profile_id, consent_id, consent_key, granted, method, decided_at, language, wording,
     required, form, screen_key, recorded_by)
  select p_walk_in.org_id, p_profile_id, c.consent_id, c.consent_key, c.granted, 'staff_device',
         c.decided_at, c.language, c.wording, c.required, 'onboarding', c.screen_key, c.recorded_by
    from public.walk_in_consents c
   where c.walk_in_id = p_walk_in.id
   order by c.screen_key, c.consent_key;
  perform private.apply_consent_effects(p_profile_id, c.consent_key, c.granted, c.recorded_by)
     from public.walk_in_consents c where c.walk_in_id = p_walk_in.id;
  delete from public.walk_in_consents where walk_in_id = p_walk_in.id;
  update public.walk_in_signings
     set status = p_status, payload = null, resolved_profile_id = p_profile_id,
         resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_walk_in.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (p_walk_in.org_id, (select auth.uid()), 'walk_in.' || p_status, 'walk_in_signing', p_walk_in.id,
          jsonb_build_object('profile_id', p_profile_id));
end;
$$;

-- 11. The test player's scenario -----------------------------------------------------------------------------

-- The body of `20261026230000_dades_legals_consents.sql`: her signature
-- records the consents of the version her phone shows, from its form.
create or replace function private.scenario_season_signature(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signed boolean := (p_change ->> 'signed')::boolean;
  current_season uuid := private.current_season_id(p_target.org_id);
  -- The version her phone shows: the draft when there is one (RAPP-619).
  version public.authorization_versions := private.authorization_version_for(p_target.org_id, p_target.id);
  on_draft boolean;
  shown_language text := coalesce(p_target.preferred_language, 'ca');
  signed_signature uuid;
begin
  if signed is null then
    raise invalid_parameter_value using message = 'the season signature takes signed: true or false';
  end if;
  if current_season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  on_draft := version.id is not null and version.published_at is null;
  if signed then
    if not exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = p_target.id and s.season_id = current_season
         and (not on_draft or s.version_id = version.id)
    ) then
      if version.id is null then
        insert into public.authorization_signatures (
          org_id, profile_id, season_id, method, language, paper_signed_on, recorded_by, is_test_fixture)
        values (p_target.org_id, p_target.id, current_season, 'paper', shown_language,
                current_date, (select auth.uid()), true);
      else
        insert into public.authorization_signatures (
          org_id, profile_id, season_id, version_id, method, language, device, unable_to_draw,
          recorded_by, is_test_fixture)
        values (p_target.org_id, p_target.id, current_season, version.id, 'app', shown_language,
                'test scenario', true, (select auth.uid()), true)
        returning id into signed_signature;
        insert into public.consent_events
          (org_id, profile_id, signature_id, consent_key, granted, method, version_id, language,
           wording, required, screen_key)
        select p_target.org_id, p_target.id, signed_signature, consent.consent_key, consent.required, 'app',
               version.id, shown_language, private.localized_text_in(consent.label, shown_language),
               consent.required, consent.screen_key
          from private.authorization_version_consents(version) consent
         order by consent.sort_position;
      end if;
    end if;
  else
    -- Her consents given while signing go with the signature (cascade).
    delete from public.authorization_signatures s
     where s.profile_id = p_target.id and s.season_id = current_season;
  end if;
  return jsonb_build_object('signed', signed);
end;
$$;

-- 12. The form engine ----------------------------------------------------------------------------------------

-- A form's content as the draft holds it now: what a Publica freezes. The
-- body of `20261104140000_form_kind_and_legal_snapshot.sql`, with the
-- authorization's documents on its document screen (RAPP-773).
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
                                          'texts', s.texts, 'system_screen', s.system_screen,
                                          -- The season documents (RAPP-773).
                                          'attachments', s.attachments)
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

-- The legal forms of the app are never asked as pending forms: their own
-- gates ask them (RAPP-772, RAPP-773).
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
  if form.id is null or form.is_archived or form.system_key is not null
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

-- The body of `20261104150000_app_terms_as_legal_form.sql`: the authorization
-- numbers its versions in its ledger, per season (RAPP-773).
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
  -- The app terms number their versions in their ledger (RAPP-772), and so
  -- does the season authorization (RAPP-773).
  if form.system_key = 'app_terms' then
    raise check_violation using message = 'the app terms are published with publish_app_terms_draft';
  end if;
  if form.system_key = 'season_authorization' then
    raise check_violation using message = 'the season authorization is published with publish_authorization_draft';
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
    if private.correction_adds_a_requirement(corrected, next_content) then
      raise check_violation
        using message = 'a correction adds no required question, consent or signature: publish a new version';
    end if;
  end if;

  select coalesce(max(v.version), 0) + 1 into next_version
    from public.custom_form_versions v where v.form_id = form.id;
  -- A test player's answer to the draft of a legal form goes with it (RAPP-772).
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

-- The body of `20261104150000_app_terms_as_legal_form.sql`: neither legal form
-- of the app is a pending form (RAPP-772, RAPP-773).
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
       -- The terms and the authorization are asked by their own gates.
       and f.system_key is null
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
     and f.filled_by = 'player' and not f.is_archived and f.system_key is null
     and jsonb_array_length(v.content -> 'screens') > 0
   order by private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date) desc,
            (v.content ->> 'deadline')::date nulls last, r.asked_at, r.id;
end;
$$;
revoke all on function public.my_custom_forms() from public, anon;
grant execute on function public.my_custom_forms() to authenticated;

-- The forms chained after Onboarding: the authorization form is the chain's
-- 'authorization', as before (RAPP-703).
create or replace function public.save_onboarding_form_chain(p_refs text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  authorization_ref text := 'custom:' || private.authorization_form_id(actor_org);
  refs text[] := array(select case when ref = authorization_ref then 'authorization' else ref end
                         from unnest(coalesce(p_refs, array[]::text[])) with ordinality r(ref, place)
                        order by place);
begin
  if cardinality(refs) > 50 then
    raise check_violation using message = 'too many chained forms';
  end if;
  if (select count(distinct ref) from unnest(refs) ref) <> cardinality(refs) then
    raise check_violation using message = 'each form is chained once';
  end if;
  if exists (
    select 1 from unnest(refs) ref
     where ref <> 'authorization'
       and not (ref ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                and exists (select 1 from public.custom_forms f
                             where f.id = substr(ref, 8)::uuid and f.org_id = actor_org
                               and f.filled_by = 'player' and not f.is_archived
                               and f.published_at is not null and f.system_key is null))) then
    raise check_violation using message = 'not a published form of this organization';
  end if;

  insert into public.onboarding_form_chains (org_id, form_refs, updated_at, updated_by)
  values (actor_org, refs, now(), (select auth.uid()))
  on conflict (org_id) do update
    set form_refs = excluded.form_refs, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'onboarding.form_chain', 'organization', actor_org,
          jsonb_build_object('form_refs', to_jsonb(refs)));
end;
$$;

-- The body of `20261104150000_app_terms_as_legal_form.sql` (RAPP-773): her
-- phone reads the authorization form from the version she is shown, the team
-- reads its ledger versions, an older build still reads the old Health
-- screen's questions, and the blocks name their settings.
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
  -- The old Health screen an older build draws: the questions of the
  -- authorization she is shown (RAPP-773). Designers read the form itself.
  old_health_json jsonb := case when with_archived then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', md5((x.p ->> 'id') || ':authorization')::uuid, 'field_id', x.p -> 'field_id',
             'surface', 'authorization', 'screen_key', null, 'sort_order', x.place,
             'required', x.p -> 'required', 'label_override', x.p -> 'label_override',
             'help_override', x.p -> 'help_override')
           order by x.place)
      from (select value as p, row_number() over (order by (value ->> 'sort_order')::integer) - 1 as place
              from jsonb_array_elements(coalesce(
                     private.authorization_snapshot_for(actor_org, (select auth.uid())) -> 'placements',
                     '[]'::jsonb))) x
      join public.profile_fields f on f.id = (x.p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb) end;
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
         and (with_archived or not f.is_archived)), '[]'::jsonb) || old_health_json,
    -- The blocks of each screen and of the entity form (RAPP-690).
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

-- 13. Each organization's authorization as a form ------------------------------------------------------------

-- The form from the draft, else the current version, else the latest
-- published, with the questions of the old Health screen and the consents of
-- the old consents screen. An organization with no version at all gets the
-- default screens and a draft to publish.
alter table public.field_placements disable trigger field_placements_guard;
do $$
declare
  org record;
  source public.authorization_versions;
  current_version public.authorization_versions;
  authorization_form uuid;
  live_consents jsonb;
  health_screen text;
begin
  for org in select o.id from public.organizations o order by o.created_at, o.id loop
    current_version := private.current_authorization_version(org.id);
    select * into source from public.authorization_versions v where v.org_id = org.id and v.published_at is null;
    if source.id is null then
      source := current_version;
    end if;
    if source.id is null then
      select * into source from public.authorization_versions v
       where v.org_id = org.id and v.published_at is not null order by v.published_at desc limit 1;
    end if;
    -- The consents of the old consents screen, in its order, as the draft takes them.
    live_consents := (
      select jsonb_agg(jsonb_build_object(
               'id', private.authorization_stable_id(org.id, 'consent:' || c.key), 'consent_id', c.id,
               'required', p.required and c.key <> 'image_rights', 'body_override', null,
               'consent', jsonb_build_object('key', c.key, 'name', c.name, 'body', c.body))
             order by p.sort_order, p.created_at, c.key)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.org_id = org.id and p.surface = 'authorization');
    authorization_form := private.ensure_authorization_form(org.id);
    perform private.restore_legal_form(authorization_form, private.authorization_snapshot_from_content(
      org.id, authorization_form, source.content, '[]'::jsonb, live_consents));
    -- The migration's own writes open no draft.
    perform set_config('ramassa.app_terms_form_sync', 'on', true);
    delete from public.consent_placements where org_id = org.id and surface = 'authorization';
    -- The questions of the old Health screen, moved onto its screen, in their order.
    health_screen := private.authorization_stable_id(org.id, 'health_screen')::text;
    update public.field_placements
       set surface = 'custom_form', custom_form_id = authorization_form, screen_key = health_screen,
           updated_at = now()
     where org_id = org.id and surface = 'authorization';
    update public.custom_forms f
       set version = greatest(1, coalesce((select max(v.version_number) from public.authorization_versions v
                                            where v.org_id = org.id), 1)),
           published_at = (select min(v.published_at) from public.authorization_versions v
                            where v.org_id = org.id and v.published_at is not null)
     where f.id = authorization_form;
    perform set_config('ramassa.app_terms_form_sync', '', true);
  end loop;
end;
$$;
alter table public.field_placements enable trigger field_placements_guard;

-- Every published version gets the form it showed, by the same converter and
-- the same ids, with the questions the Health screen asked. Its `content` is
-- not written: the guard of published rows is off for this update only, as
-- `20261022140000` did.
alter table public.authorization_versions disable trigger authorization_versions_immutable;
update public.authorization_versions v
   set form_snapshot = private.authorization_snapshot_from_content(
         v.org_id, f.id, v.content, private.custom_form_content(f.id) -> 'placements', null),
       legacy_compatible = true
  from public.custom_forms f
 where f.org_id = v.org_id and f.system_key = 'season_authorization' and v.published_at is not null;
alter table public.authorization_versions enable trigger authorization_versions_immutable;

alter table public.authorization_versions
  add constraint authorization_versions_published_with_form
    check (published_at is null or (form_snapshot is not null and legacy_compatible is not null));

-- The draft row of each organization holds the old content its form gives,
-- and an organization with no version gets one, so Publica has a draft.
do $$
declare
  org record;
begin
  for org in select o.id from public.organizations o loop
    if exists (select 1 from public.authorization_versions v where v.org_id = org.id and v.published_at is null)
       or not exists (select 1 from public.authorization_versions v where v.org_id = org.id) then
      perform private.touch_authorization_draft(org.id);
    end if;
  end loop;
end;
$$;

-- From now on: nothing on the old surface, nothing on the re-registration
-- screens.
create trigger field_placements_authorization_guard
  before insert or update on public.field_placements
  for each row execute function private.authorization_placement_guard();
create trigger consent_placements_authorization_guard
  before insert or update on public.consent_placements
  for each row execute function private.authorization_placement_guard();
create trigger form_blocks_authorization_guard
  before insert or update on public.form_blocks
  for each row execute function private.authorization_placement_guard();

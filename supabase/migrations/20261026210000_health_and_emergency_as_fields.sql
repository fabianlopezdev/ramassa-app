-- RAPP-698: health information and the emergency contact become fields.
--
-- WHY
--
-- Step 2 of the forms design. The season authorization asked her health and
-- her emergency contact with its own questions, kept in their own profile
-- columns, outside Dades de les jugadores: nobody could reword them like a
-- field, the readers and the erasure had their own rules, and the erasure
-- left them in place. They become fields like every other one, placed on the
-- authorization's Health screen.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Four fields per organization, Sensible, in Dades de les jugadores:
--      health information (Salut i necessitats) and the emergency contact's
--      name, relation and phone (Contacte). They are team fields (kind
--      `custom`), so staff reword them, change their type and privacy and
--      archive them like any field (RAPP-692, RAPP-693). A system key names
--      them, so the signing functions find them (`authorization_field_keys`).
--   2. A new placement surface, `authorization`: the authorization's Health
--      screen. Its fields are asked of her and can be required, like her
--      Onboarding's. Each organization's placements follow its current
--      version: a question it asked is placed, required as it was.
--   3. The values move into her answers, through the same columns the answer
--      writer uses, encrypted where Sensible. An old phone that does not fit
--      the phone type is kept as written.
--   4. Signing writes the answers through `write_field_answers`, on every
--      path: her app, the tablet, a walk-in confirmed or merged, and
--      re-registration. The payload carries `answers` by field; an older
--      build's `health_info` and `emergency_contact` are read as answers to
--      the four fields. A required placement of the Health screen needs an
--      answer, and a health answer needs the health data consent, as before.
--   5. Withdrawing the health data consent deletes the health answer.
--   6. The profile columns, their privacy stamp and its functions go. Her
--      page and her own profile read the answers through the display rules
--      (`field_answers_for`), and the erasure deletes them with every answer.
--   7. A version's content no longer needs `questions`: the Health screen's
--      fields are placements now. Published versions keep theirs.
--   8. The Onboarding setup file (RAPP-621) leaves the four fields and the
--      Health screen out: every organization has its own, and the
--      authorization travels as its draft.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html (DROP
-- COLUMN drops the column's constraints and grants) and
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security definer functions with an empty search path, checks inside).

-- 1. The four fields --------------------------------------------------------------------------------------

create or replace function private.authorization_field_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['health_info', 'emergency_contact_name', 'emergency_contact_relation',
               'emergency_contact_phone']::text[];
$$;
revoke all on function private.authorization_field_keys() from public, anon, authenticated;

alter table public.profile_fields
  drop constraint profile_fields_system_key_iff_builtin,
  drop constraint profile_fields_system_key_check;
alter table public.profile_fields
  add constraint profile_fields_system_key_check check (
    system_key is null
    or system_key = any (private.system_field_keys())
    or system_key = any (private.authorization_field_keys())),
  -- An app field is built in; the authorization's fields are the team's,
  -- named by a key so the signing functions find them (RAPP-698).
  add constraint profile_fields_system_key_iff_builtin check (
    (kind = 'builtin') = (system_key is not null and system_key = any (private.system_field_keys())));

-- One of the organization's authorization fields, by key.
create or replace function private.authorization_field(p_org_id uuid, p_key text)
returns public.profile_fields
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profile_fields f
   where f.org_id = p_org_id and f.system_key = p_key and f.kind = 'custom';
$$;
revoke all on function private.authorization_field(uuid, text) from public, anon, authenticated;

-- 2. The Health screen's placements --------------------------------------------------------------------------

alter table public.field_placements drop constraint field_placements_surface_check;
alter table public.field_placements add constraint field_placements_surface_check
  check (surface = any (array['onboarding', 'entity_form', 'season', 'authorization']));

create or replace function private.field_asked_of_her(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.field_placements p
                  where p.field_id = p_field_id
                    and p.surface in ('onboarding', 'season', 'authorization'));
$$;

create or replace function private.field_required_for_her(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.field_placements p
                  where p.field_id = p_field_id
                    and p.surface in ('onboarding', 'season', 'authorization') and p.required);
$$;

-- The four fields of an organization, placed as its current version asks
-- them. Run for every organization now, and for each new one with its layout.
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
  on conflict (field_id, surface) do nothing;
end;
$$;
revoke all on function private.seed_authorization_fields(uuid) from public, anon, authenticated;

select private.seed_authorization_fields(o.id) from public.organizations o;

-- A new organization gets them with its layout. The body of the latest
-- `seed_profile_layout`, with the call at its end.
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
  on conflict (field_id, surface) do nothing;

  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'season', (q.position - 1)::integer,
         q.question = any (private.default_required_intake_questions())
    from unnest(private.builtin_season_fields()) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = private.question_system_key(q.question)
  on conflict (field_id, surface) do nothing;

  -- The entity form asks her name always; it requires nothing else (RAPP-300).
  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'entity_form', (q.position - 1)::integer,
         f.system_key = any (private.entity_form_always_asked())
    from unnest(private.system_entity_form_fields()) with ordinality as q(system_key, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = q.system_key
   where private.question_system_key(private.system_key_question(q.system_key)) = q.system_key
  on conflict (field_id, surface) do nothing;

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

-- Staff place fields on the Health screen with the same picker. The body of
-- the latest `place_field`, with the new surface.
CREATE OR REPLACE FUNCTION public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  saved_id uuid;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season', 'authorization') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form, the season or the authorization';
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
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if private.field_is_hers_only(field.question_type, field.settings) and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
  if exists (select 1 from public.field_placements where field_id = p_field_id and surface = p_surface) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key));
  return saved_id;
end;
$function$;

-- The Health screen's required fields, for signing. The body of the latest
-- `missing_required_custom_answers`, with the new surface.
CREATE OR REPLACE FUNCTION private.missing_required_custom_answers(p_profile_id uuid, p_placement text)
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
                                        when 'authorization' then 'authorization' end
   where not f.is_archived
     and f.system_key is distinct from 'first_name'
     and f.system_key is distinct from 'last_name'
     and (pl.surface <> 'onboarding'
          or not private.is_uuid_text(pl.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = pl.screen_key::uuid and s.org_id = f.org_id and not s.is_archived))
     and not (private.field_is_seasonal(f.id) and private.current_season_id(f.org_id) is null)
     and (f.show_when_field_id is null or exists (
           select 1 from public.profile_fields gate
            where gate.id = f.show_when_field_id
              and private.field_answer_now(p_profile_id, gate) = to_jsonb(f.show_when_option_id::text)))
     and (f.system_key is distinct from 'reference_contact_name'
          or private.system_field_answer(p_profile_id, 'reference_entity') is not null)
     and private.field_answer_now(p_profile_id, f) is null;
$function$;

-- 3. The values move into her answers ---------------------------------------------------------------------

do $$
declare
  her record;
  field public.profile_fields;
  given text;
  stored jsonb;
begin
  for her in
    select p.id, p.org_id, public.decrypt_field(p.health_info) as health,
           p.emergency_contact_name as contact_name, p.emergency_contact_relation as contact_relation,
           public.decrypt_field(p.emergency_contact_phone) as contact_phone
      from public.profiles p
     where p.health_info is not null or p.emergency_contact_name is not null
        or p.emergency_contact_relation is not null or p.emergency_contact_phone is not null
  loop
    foreach given in array array['health_info', 'emergency_contact_name', 'emergency_contact_relation',
                                 'emergency_contact_phone'] loop
      field := private.authorization_field(her.org_id, given);
      stored := to_jsonb(nullif(btrim(case given
        when 'health_info' then her.health
        when 'emergency_contact_name' then her.contact_name
        when 'emergency_contact_relation' then her.contact_relation
        else her.contact_phone end), ''));
      continue when field.id is null or stored is null or stored = 'null'::jsonb;
      -- Tidied as the writer does; an old phone that does not fit the type is kept as written.
      if private.custom_answer_valid(field, private.custom_answer_tidied(field.question_type, stored)) then
        stored := private.custom_answer_tidied(field.question_type, stored);
      end if;
      insert into public.custom_answers (
        profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source,
        answered_by, answered_at)
      values (her.id, field.id, '00000000-0000-0000-0000-000000000000', null, her.org_id,
              null, public.encrypt_field(stored::text), 'player', null, now())
      on conflict (profile_id, question_id, season_key) do nothing;
    end loop;
  end loop;
end;
$$;

-- 4. Signing writes the answers -----------------------------------------------------------------------------

-- Her answers on the Health screen from a signing payload: `answers` by field,
-- and an older build's `health_info` and `emergency_contact` as answers to
-- the four fields (an empty one is left out, so it never clears a stored answer).
create or replace function private.signing_answers(p_org_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answers jsonb := case when jsonb_typeof(p_payload -> 'answers') = 'object'
    then p_payload -> 'answers' else '{}'::jsonb end;
  contact jsonb := case when jsonb_typeof(p_payload -> 'emergency_contact') = 'object'
    then p_payload -> 'emergency_contact' end;
  legacy jsonb := '{}'::jsonb;
  field public.profile_fields;
  given text;
  value text;
begin
  if p_payload ? 'answers' and jsonb_typeof(p_payload -> 'answers') not in ('object', 'null') then
    raise check_violation using message = 'answers are sent by field';
  end if;
  foreach given in array private.authorization_field_keys() loop
    value := nullif(btrim(case given
      when 'health_info' then p_payload ->> 'health_info'
      when 'emergency_contact_name' then private.name_trim(contact ->> 'name')
      when 'emergency_contact_relation' then contact ->> 'relation'
      else contact ->> 'phone' end), '');
    continue when value is null;
    field := private.authorization_field(p_org_id, given);
    continue when field.id is null or answers ? field.id::text;
    legacy := legacy || jsonb_build_object(field.id::text, value);
  end loop;
  return answers || legacy;
end;
$$;
revoke all on function private.signing_answers(uuid, jsonb) from public, anon, authenticated;

-- The answers a signing gives, checked before anything is kept: fields of the
-- Health screen that fit, every required one answered (stored ones count for
-- someone who has a profile), and a health answer with its consent.
create or replace function private.check_signing_answers(
  p_org_id uuid, p_profile_id uuid, p_content jsonb, p_payload jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answers jsonb := private.signing_answers(p_org_id, p_payload);
  entry record;
  field public.profile_fields;
  health public.profile_fields := private.authorization_field(p_org_id, 'health_info');
begin
  for entry in select key, value from jsonb_each(answers) loop
    field := null;
    select * into field from public.profile_fields f
     where f.org_id = p_org_id and f.id::text = entry.key and not f.is_archived
       and exists (select 1 from public.field_placements pl
                    where pl.field_id = f.id and pl.surface = 'authorization');
    if field.id is null then
      raise check_violation using message = 'not a question of the authorization';
    end if;
    if not private.custom_answer_is_empty(entry.value)
       and not private.custom_answer_valid(field, private.custom_answer_tidied(field.question_type, entry.value)) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
  end loop;
  -- Every required field of the Health screen, answered now or before.
  if exists (
    select 1 from public.field_placements pl
      join public.profile_fields f on f.id = pl.field_id and not f.is_archived
     where pl.org_id = p_org_id and pl.surface = 'authorization' and pl.required
       and case when answers ? f.id::text
                then private.custom_answer_is_empty(answers -> f.id::text)
                else p_profile_id is null or not exists (
                       select 1 from public.custom_answers a
                        where a.profile_id = p_profile_id and a.question_id = f.id)
           end
  ) then
    raise not_null_violation using message = 'a required question of the authorization has no answer';
  end if;
  -- Her health answer needs her explicit consent to its processing.
  if health.id is not null
     and not private.custom_answer_is_empty(coalesce(answers -> health.id::text, 'null'::jsonb))
     and p_content -> 'consents' ? 'health_data'
     and (p_payload -> 'consents' -> 'health_data') is distinct from 'true'::jsonb then
    raise check_violation using message = 'the medical answer needs the health data consent';
  end if;
end;
$$;
revoke all on function private.check_signing_answers(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

-- The payload's own shape: consents, signature, language. Her answers are
-- checked with the organization's fields (`check_signing_answers`).
CREATE OR REPLACE FUNCTION private.validate_signing_payload(p_payload jsonb, p_content jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  drawing jsonb := p_payload -> 'signature';
  cannot_draw boolean := coalesce((p_payload ->> 'unable_to_draw')::boolean, false);
  shown_language text := nullif(p_payload ->> 'language', '');
begin
  if jsonb_typeof(consents) <> 'object'
    or exists (
      select 1 from private.authorization_consents(p_content) consent
       where consent.required and (consents -> consent.consent_key) is distinct from 'true'::jsonb
    )
    or exists (
      select 1 from jsonb_each(consents) given
       where not (p_content -> 'consents' ? given.key)
          or jsonb_typeof(given.value) <> 'boolean'
    )
  then
    raise check_violation using message = 'every required consent must be given';
  end if;
  if drawing is not null and (jsonb_typeof(drawing) <> 'array' or jsonb_array_length(drawing) = 0) then
    drawing := null;
  end if;
  if drawing is not null and octet_length(drawing::text) > 200000 then
    raise check_violation using message = 'the signature is too large';
  end if;
  if (drawing is null) = (not cannot_draw) then
    raise check_violation using message = 'sign with a drawing, or record that she could not draw';
  end if;
  if shown_language is not null and shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
end;
$function$;

-- Every signing path ends here. The body of the latest `record_signature`,
-- with her answers written as answers.
CREATE OR REPLACE FUNCTION private.record_signature(p_signature_id uuid, p_profile_id uuid, p_version_id uuid, p_payload jsonb, p_method text, p_witness uuid, p_signed_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.profiles;
  version public.authorization_versions;
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  drawing jsonb := case
    when jsonb_typeof(p_payload -> 'signature') = 'array'
     and jsonb_array_length(p_payload -> 'signature') > 0
    then p_payload -> 'signature' end;
  shown_language text := nullif(p_payload ->> 'language', '');
  on_draft boolean;
begin
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;

  select * into target from public.profiles where id = p_profile_id;
  -- "Is it a draft" is decided on the locked row (pending fix 29): FOR SHARE
  -- waits for a publish or a discard holding the row and then reads the row
  -- it committed, so a draft signature never lands on a published version.
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
  perform private.validate_signing_payload(p_payload, version.content);
  perform private.check_signing_answers(target.org_id, target.id, version.content, p_payload);

  insert into public.authorization_signatures (
    id, org_id, profile_id, season_id, version_id, method, language, device,
    signed_at, signature, unable_to_draw, witnessed_by, is_test_fixture
  ) values (
    p_signature_id, target.org_id, target.id, version.season_id, version.id, p_method,
    shown_language,
    left(nullif(btrim(p_payload ->> 'device'), ''), 200),
    coalesce(p_signed_at, now()), drawing, drawing is null, p_witness, on_draft
  )
  on conflict (id) do nothing;

  -- Every consent of the version she signed, with the words she was shown.
  insert into public.authorization_consent_events
    (org_id, profile_id, signature_id, consent_key, granted, method, decided_at,
     version_id, language, wording, required)
  select target.org_id, target.id, p_signature_id, consent.consent_key,
         coalesce((consents ->> consent.consent_key)::boolean, false), p_method,
         coalesce(p_signed_at, now()), version.id, coalesce(shown_language, 'ca'),
         private.localized_text_in(consent.label, coalesce(shown_language, 'ca')), consent.required
    from private.authorization_consents(version.content) consent;

  perform set_config('ramassa.consent_event_written', 'on', true);
  update public.profiles set
    -- Image rights drive the photo consent, when the version asks them.
    media_consent_at = case
      when not (version.content -> 'consents' ? 'image_rights') then media_consent_at
      when coalesce((consents ->> 'image_rights')::boolean, false)
        then coalesce(media_consent_at, now())
      else null
    end
  where id = target.id;
  perform set_config('ramassa.consent_event_written', '', true);
  -- Her answers on the Health screen, through the one answer writer (RAPP-698).
  perform private.write_field_answers(
    target.id, private.signing_answers(target.org_id, p_payload), 'player', null, true);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, coalesce(p_witness, target.id), 'authorization.sign', 'authorization_signature',
          p_signature_id,
          jsonb_build_object('version_id', version.id, 'method', p_method,
                             'unable_to_draw', drawing is null, 'witnessed_by', p_witness,
                             'draft', on_draft));
  return p_signature_id;
end;
$function$;

-- A walk-in's answers are checked when she signs. The body of the latest
-- `submit_walk_in_signing`.
CREATE OR REPLACE FUNCTION public.submit_walk_in_signing(p_id uuid, p_first_name text, p_last_name text, p_version_id uuid, p_payload jsonb, p_signed_at timestamp with time zone, p_block_signatures jsonb DEFAULT NULL::jsonb)
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
  -- Her answers are checked now; they are written when the team confirms her.
  perform private.check_signing_answers(actor_org, null, version.content, p_payload);
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

-- 5. Withdrawing the health data consent deletes the health answer. The body of
-- the latest `set_optional_consent`.
CREATE OR REPLACE FUNCTION public.set_optional_consent(p_key text, p_granted boolean, p_language text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
  shown_language text;
  last_event public.authorization_consent_events;
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
  select * into last_event from public.authorization_consent_events e
   where e.profile_id = caller and e.consent_key = p_key
   order by e.decided_at desc, e.id desc limit 1;
  if p_granted is null
    or (version.content -> 'consents' -> p_key ->> 'required')::boolean is true
    or not (
      (version.content -> 'consents' -> p_key ->> 'required')::boolean is false
      or (not p_granted and last_event.granted is true)
    )
  then
    raise invalid_parameter_value using message = 'only an optional consent changes here';
  end if;

  insert into public.authorization_consent_events
    (org_id, profile_id, consent_key, granted, method, version_id, language, wording, required)
  values (
    me.org_id, caller, p_key, p_granted, 'profile',
    case when version.content -> 'consents' ? p_key then version.id else last_event.version_id end,
    case when version.content -> 'consents' ? p_key then shown_language else last_event.language end,
    case when version.content -> 'consents' ? p_key
      then private.localized_text_in(version.content -> 'consents' -> p_key -> 'label', shown_language)
      else last_event.wording end,
    false);

  if p_key = 'image_rights' then
    perform set_config('ramassa.consent_event_written', 'on', true);
    update public.profiles
       set media_consent_at = case when p_granted then coalesce(media_consent_at, now()) end
     where id = caller;
    perform set_config('ramassa.consent_event_written', '', true);
  end if;

  -- Without her consent her health answer is not kept (pending fix 25).
  if p_key = 'health_data' and not p_granted then
    delete from public.custom_answers a
     where a.profile_id = caller
       and a.question_id = (private.authorization_field(me.org_id, 'health_info')).id;
    if found then
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (me.org_id, caller, 'consent.health_answer_erased', 'profile', caller,
              jsonb_build_object('consent', 'health_data'));
    end if;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (me.org_id, caller, 'consent.change', 'profile', caller,
          jsonb_build_object('consent', p_key, 'granted', p_granted));
end;
$function$;

-- 6. The columns go. Their readers and writers first.

CREATE OR REPLACE FUNCTION private.scenario_reset(p_target profiles)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Not joined, with an open invitation.
  perform private.scenario_terms(p_target, '{"accepted": false}'::jsonb);
  -- No signature and no consent, this season or any other.
  delete from public.authorization_signatures where profile_id = p_target.id;
  delete from public.authorization_consent_events where profile_id = p_target.id;
  delete from public.custom_answers where profile_id = p_target.id;
  delete from public.form_signatures where profile_id = p_target.id;
  update public.profiles p set
    avatar_url = null, media_consent_at = null, season_number = null, prior_seasons = 0,
    updated_at = now()
  where p.id = p_target.id;
  return '{}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- A client write (her app, the admin, a direct table write) never leaves a
  -- name blank (pending fix 24). The database's own writes (security definer
  -- functions, the erasure) are not clients.
  if current_user in ('authenticated', 'anon')
     and tg_op = 'UPDATE'
     and ((new.first_name is distinct from old.first_name and private.name_trim(new.first_name) = '')
          or (new.last_name is distinct from old.last_name and private.name_trim(new.last_name) = ''))
  then
    raise exception 'PROFILES/NAME_REQUIRED' using errcode = '23514';
  end if;

  -- A SECURITY DEFINER function runs as its owner. The five SECURITY INVOKER
  -- functions that write profiles mark their one write as trusted (below).
  if current_user not in ('authenticated', 'anon')
    or current_setting('ramassa.trusted_profile_write', true) = 'on'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Profiles are created by onboarding or an invitation, never by a direct insert.
    raise exception 'PROFILES/DIRECT_INSERT' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.org_id is distinct from old.org_id
    or new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.is_forum_banned is distinct from old.is_forum_banned
    or new.anonymized_at is distinct from old.anonymized_at
    or new.terms_accepted_at is distinct from old.terms_accepted_at
    or new.media_consent_at is distinct from old.media_consent_at
    or new.collaborating_entity_id is distinct from old.collaborating_entity_id
    or new.created_at is distinct from old.created_at
    or new.sessions_valid_after is distinct from old.sessions_valid_after
    or new.is_test_account is distinct from old.is_test_account
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- Her page and her own profile read them as answers, by each field's level.
drop function public.get_participant_profile(uuid);
CREATE FUNCTION public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, preferred_language text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, season_number smallint, is_test_account boolean, role text, answers jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and p.org_id = (select public.current_org_id())
      and (select private.participant_permission(participant_id, 'participants.view'))
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then 'profile.view_sensitive' else 'profile.view' end,
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    private.shown_name(s.id, 'first_name'),
    private.shown_name(s.id, 'last_name'),
    s.preferred_language,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.anonymized_at,
    s.created_at,
    s.updated_at,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    s.is_test_account,
    -- Joined or not, as the writers decide it: only an invited woman is completed in parts.
    s.role,
    -- Every other field, each by its own level (D9): her health and her
    -- emergency contact among them (RAPP-698).
    private.field_answers_for(s.id, false)
  from subject s;
$function$;
revoke all on function public.get_participant_profile(uuid) from public, anon;
grant execute on function public.get_participant_profile(uuid) to authenticated;

drop function public.get_own_profile();
CREATE FUNCTION public.get_own_profile()
 RETURNS TABLE(id uuid, first_name text, last_name text, preferred_language text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, season_number smallint, answers jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id,
    private.shown_name(p.id, 'first_name'),
    private.shown_name(p.id, 'last_name'),
    p.preferred_language,
    p.avatar_url,
    p.media_consent_at is not null,
    p.terms_accepted_at,
    private.season_number(p.id),
    -- She reads every answer about her, whatever its level.
    private.field_answers_for(p.id, true)
  from public.profiles p
  where p.id = (select auth.uid());
$function$;
revoke all on function public.get_own_profile() from public, anon;
grant execute on function public.get_own_profile() to authenticated;

drop trigger profiles_stamp_emergency_contact_privacy on public.profiles;
drop function private.stamp_emergency_contact_privacy();
drop function private.may_write_emergency_contact(uuid, uuid, text);
drop function private.emergency_contact_permission(uuid, text);
drop function private.emergency_contact_level(uuid);

alter table public.profiles
  drop column health_info,
  drop column emergency_contact_name,
  drop column emergency_contact_relation,
  drop column emergency_contact_phone,
  drop column emergency_contact_privacy;

-- 7. A version's content no longer needs `questions`. The body of the latest
-- `authorization_content_valid`.
CREATE OR REPLACE FUNCTION private.authorization_content_valid(p_content jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_typeof(p_content) = 'object'
    and p_content - array['title', 'sections', 'consents', 'attachments', 'questions', 'texts',
                          'screen_order'] = '{}'::jsonb
    and private.localized_text_valid(p_content -> 'title')
    -- Sections, as RAPP-304.
    and jsonb_typeof(p_content -> 'sections') = 'array'
    and jsonb_array_length(p_content -> 'sections') between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p_content -> 'sections') section
       where coalesce(section ->> 'key', '') !~ '^[a-z_]{1,40}$'
          or not private.localized_text_valid(section -> 'title')
          or not private.localized_text_valid(section -> 'body')
    )
    -- Consents: 1 to 20, each with its wording, flag and place.
    and jsonb_typeof(p_content -> 'consents') = 'object'
    and (select count(*) from jsonb_object_keys(p_content -> 'consents')) between 1 and 20
    and not exists (
      select 1 from jsonb_each(p_content -> 'consents') consent
       where consent.key !~ '^[a-z][a-z0-9_]{0,39}$'
          or jsonb_typeof(consent.value) <> 'object'
          or consent.value - array['label', 'required', 'position'] <> '{}'::jsonb
          or not private.localized_text_valid(consent.value -> 'label')
          or jsonb_typeof(consent.value -> 'required') is distinct from 'boolean'
          or jsonb_typeof(consent.value -> 'position') is distinct from 'number'
          or (consent.value ->> 'position') !~ '^[0-9]{1,3}$'
    )
    and (select count(distinct consent.value ->> 'position') from jsonb_each(p_content -> 'consents') consent)
        = (select count(*) from jsonb_object_keys(p_content -> 'consents'))
    -- Image rights drive the photo consent, which she can always refuse.
    and (p_content -> 'consents' -> 'image_rights' -> 'required') is distinct from 'true'::jsonb
    -- The two questions.
    -- A published version may still carry them; a new one has none (RAPP-698).
    and (not p_content ? 'questions' or (
    jsonb_typeof(p_content -> 'questions') = 'object'
    and (p_content -> 'questions') - array['health', 'emergency_contact'] = '{}'::jsonb
    and (select bool_and(
           jsonb_typeof(question) = 'object'
           and question - array['asked', 'required', 'privacy', 'texts'] = '{}'::jsonb
           and jsonb_typeof(question -> 'asked') = 'boolean'
           and jsonb_typeof(question -> 'required') = 'boolean'
           -- Hidden only when not required.
           and ((question ->> 'asked')::boolean or not (question ->> 'required')::boolean))
           from (values (p_content -> 'questions' -> 'health'),
                        (p_content -> 'questions' -> 'emergency_contact')) as q(question))
    and (p_content -> 'questions' -> 'health' ->> 'privacy') = 'health'
    and (p_content -> 'questions' -> 'emergency_contact' ->> 'privacy') in ('personal', 'sensitive')
    and private.authorization_override_texts_valid(
          coalesce(p_content -> 'questions' -> 'health' -> 'texts', '{}'::jsonb), 'health')
    and private.authorization_override_texts_valid(
          coalesce(p_content -> 'questions' -> 'emergency_contact' -> 'texts', '{}'::jsonb), 'emergency_contact')
    -- Asking her health needs its explicit consent, required with the question.
    and (not (p_content -> 'questions' -> 'health' ->> 'asked')::boolean
         or (p_content -> 'consents' ? 'health_data'
             and (not (p_content -> 'questions' -> 'health' ->> 'required')::boolean
                  or (p_content -> 'consents' -> 'health_data' ->> 'required')::boolean)))))
    -- Wording of the form.
    and private.authorization_override_texts_valid(coalesce(p_content -> 'texts', '{}'::jsonb), 'texts')
    -- Season documents, as RAPP-304.
    and coalesce(jsonb_typeof(p_content -> 'attachments'), 'array') = 'array'
    and coalesce(jsonb_array_length(p_content -> 'attachments'), 0) <= 10
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_content -> 'attachments', '[]'::jsonb)) attachment
       where not private.localized_text_valid(attachment -> 'label')
          or coalesce(attachment ->> 'url', '') !~ '^https://[^[:space:]]+$'
          or length(attachment ->> 'url') > 2000
    )
    -- The movable screens' order (RAPP-696): each of the two once.
    and (not p_content ? 'screen_order'
         or (jsonb_typeof(p_content -> 'screen_order') = 'array'
             and jsonb_array_length(p_content -> 'screen_order') = 2
             and (p_content -> 'screen_order') @> '["document", "health"]'::jsonb)),
    false);
$function$;

-- 8. The Onboarding setup file leaves them out. The bodies of the latest
-- `export_onboarding_setup` and `onboarding_setup_blockers`.
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
       where p.org_id = actor_org and p.surface <> 'authorization'), '[]'::jsonb),
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
        from public.form_blocks b where b.org_id = actor_org), '[]'::jsonb)
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;

CREATE OR REPLACE FUNCTION private.onboarding_setup_blockers(p_org_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(blocker.code order by blocker.ordinal), array[]::text[])
    from (values
      (1, 'screens', exists (select 1 from public.intake_screens where org_id = p_org_id)),
      -- The authorization's own fields come with every organization (RAPP-698).
      (2, 'questions', exists (select 1 from public.profile_fields
                                where org_id = p_org_id and kind = 'custom'
                                  and not coalesce(system_key = any (private.authorization_field_keys()), false))),
      -- Staff wording on an app question (RAPP-666: on its placements).
      (3, 'builtin_question_overrides', exists (
         select 1 from public.field_placements p
           join public.profile_fields f on f.id = p.field_id and f.kind = 'builtin'
          where p.org_id = p_org_id and (p.label_override is not null or p.help_override is not null))),
      (4, 'builtin_screens', exists (select 1 from public.intake_builtin_screens where org_id = p_org_id)),
      (5, 'flow_order', exists (select 1 from public.intake_flow_orders where org_id = p_org_id)),
      -- An app question made required or optional (RAPP-666: on its placements).
      (6, 'required_questions', exists (
         select 1 from unnest(private.wizard_intake_questions()) q(question)
          where (q.question = any (private.required_intake_questions(p_org_id)))
                <> (q.question = any (private.default_required_intake_questions()
                                      || private.locked_required_intake_questions())))),
      (7, 'presets', exists (select 1 from public.intake_state_presets where org_id = p_org_id)),
      (8, 'document_step_explanation', exists (select 1 from public.organizations
                                                where id = p_org_id and document_step_explanation is not null)),
      (9, 'app_terms', exists (select 1 from public.app_terms_versions v
                                where v.org_id = p_org_id
                                  and (v.version_number is distinct from 1
                                       or v.content <> private.app_terms_version_one()))),
      (10, 'seasons', exists (select 1 from public.seasons where org_id = p_org_id and not is_test_fixture)),
      (11, 'authorization', exists (select 1 from public.authorization_versions where org_id = p_org_id)),
      (12, 'signature_blocks', exists (select 1 from public.form_blocks where org_id = p_org_id))
    ) as blocker(ordinal, code, present)
   where blocker.present;
$function$;

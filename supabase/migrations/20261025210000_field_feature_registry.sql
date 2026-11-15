-- The features that read a field declare it (RAPP-662, D7, D9).
--
-- WHY
--
-- Step 3 of 7 (RAPP-660 to RAPP-666). Every field can change its answer type
-- and its privacy on Dades de les jugadores (RAPP-665). A few features read one
-- of the app's fields for its meaning: the impact report counts ages from the
-- date of birth, the participants list filters by nationality, notifications
-- target the women of an entity. Each of them now says, in one registry, which
-- field it reads (by system key) and which answer types it understands. A
-- feature whose field no longer has one of those types reads nothing, and
-- nothing fails. The change dialog of RAPP-665 names the features a change
-- affects from the same registry.
--
-- WHAT CHANGES
--
--   1. `private.field_features()`: the registry. `packages/shared` keeps the
--      same list in `FIELD_FEATURES`; `tests/field-features-parity.test.ts`
--      reads the block between the markers below and keeps the two equal.
--   2. `private.feature_field(org, feature)`: the field a feature reads in an
--      organization, or nothing when its type does not fit.
--   3. `private.feature_answer(profile, feature)` and
--      `private.feature_text(profile, feature)`: her answer to that field, as
--      stored and as text (a choice by its option's Catalan label).
--   4. `private.answer_key(field, value)`: a choice answer by its option's
--      stable key (D5), a yes or no answer as it is. The dependents filter
--      reads yes and no through it.
--   5. `private.reads_privacy(profile, level)`: whether the caller reads
--      answers of that level about her (D9). One map from level to permission,
--      used by every reader from this step on.
--   6. `private.field_features_of(field)`: the features that read a field and
--      whether its type fits each one (for RAPP-665).
--
-- Every function is private and revoked from public, anon and authenticated.
--
-- Docs: https://www.postgresql.org/docs/17/xfunc-sql.html (SQL functions
-- returning rows), https://www.postgresql.org/docs/17/functions-array.html.

-- 1. The registry -------------------------------------------------------------------------------------------

create or replace function private.field_features()
returns table (feature text, system_key text, accepted_types text[], powers text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    -- field-features:start
    ('impact.age_bands', 'date_of_birth', array['date'], 'Impact report: age bands'),
    ('impact.nationalities', 'nationality', array['country'], 'Impact report: participants by nationality'),
    ('participants.nationality', 'nationality', array['country'], 'Participants list: nationality column, filter and sort'),
    ('participants.city', 'city', array['municipality'], 'Participants list and conversations: municipality'),
    ('participants.entity', 'reference_entity', array['short_text', 'single_choice', 'search_choice'], 'Participants list: entity column and filter'),
    ('participants.has_dependents', 'has_dependents', array['single_choice', 'yes_no'], 'Participants list: dependents filter'),
    ('participants.dependents_count', 'num_dependents', array['number'], 'Participants list: number of dependents'),
    ('notifications.entity', 'reference_entity', array['short_text', 'single_choice', 'search_choice'], 'Notifications and surveys: the women of an entity'),
    ('equipment.clothing_size', 'clothing_size', array['single_choice'], 'Equipment handover: suggested clothing size'),
    ('equipment.shoe_size', 'shoe_size', array['single_choice'], 'Equipment handover: suggested shoe size'),
    ('erasure.birth_year', 'date_of_birth', array['date'], 'Erasure: the birth year kept for the reports')
    -- field-features:end
  ) as registry(feature, system_key, accepted_types, powers);
$$;
revoke all on function private.field_features() from public, anon, authenticated;

-- 2. A feature's field and her answer to it ------------------------------------------------------------------

-- The field a feature reads in an organization: the one with its system key,
-- archived or not (her answers stay), when its type is one the feature reads.
-- An unknown feature name is a mistake in the caller and raises.
create or replace function private.feature_field(p_org_id uuid, p_feature text)
returns public.profile_fields
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  registered record;
  found public.profile_fields;
begin
  select * into registered from private.field_features() r where r.feature = p_feature;
  if registered.feature is null then
    raise invalid_parameter_value using message = 'unknown field feature';
  end if;
  select * into found
    from public.profile_fields f
   where f.org_id = p_org_id
     and f.system_key = registered.system_key
     and f.question_type = any (registered.accepted_types);
  return found;
end;
$$;
revoke all on function private.feature_field(uuid, text) from public, anon, authenticated;

-- Her answer to a feature's field, decrypted (this season's for a seasonal
-- field), or nothing when the field does not fit the feature.
create or replace function private.feature_answer(p_profile_id uuid, p_feature text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  field public.profile_fields;
begin
  field := private.feature_field((select p.org_id from public.profiles p where p.id = p_profile_id), p_feature);
  if field.id is null then
    return null;
  end if;
  return private.field_answer_now(p_profile_id, field);
end;
$$;
revoke all on function private.feature_answer(uuid, text) from public, anon, authenticated;

-- The same answer as text: a choice by its option's Catalan label, a list by
-- its items (`private.custom_answer_text`).
create or replace function private.feature_text(p_profile_id uuid, p_feature text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  field public.profile_fields;
  answer jsonb;
begin
  field := private.feature_field((select p.org_id from public.profiles p where p.id = p_profile_id), p_feature);
  if field.id is null then
    return null;
  end if;
  answer := private.field_answer_now(p_profile_id, field);
  return case when answer is null then null else nullif(btrim(private.custom_answer_text(field, answer)), '') end;
end;
$$;
revoke all on function private.feature_text(uuid, text) from public, anon, authenticated;

-- A one-choice answer by its option's stable key (D5); a yes or no answer as
-- it is stored ('yes', 'no', 'maybe'). Anything else has no key.
create or replace function private.answer_key(p_field public.profile_fields, p_value jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'string' then null
    when p_field.question_type in ('single_choice', 'search_choice') then (
      select o.key from public.custom_question_options o
       where o.question_id = p_field.id and o.id::text = p_value #>> '{}')
    when p_field.question_type in ('yes_no', 'yes_no_maybe') then p_value #>> '{}'
  end;
$$;
revoke all on function private.answer_key(public.profile_fields, jsonb) from public, anon, authenticated;

-- 3. Privacy by level (D9) -----------------------------------------------------------------------------------

-- Whether the caller reads answers of this level about her: Normal needs
-- participants.view, Personal participants.view_personal, Sensitive
-- participants.view_sensitive. A test player's made-up answers are read with
-- test_players.manage (`private.participant_permission`). With no profile, the
-- caller's own permissions decide.
create or replace function private.reads_privacy(p_profile_id uuid, p_privacy text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(case p_privacy
    when 'normal' then private.participant_permission(p_profile_id, 'participants.view')
    when 'personal' then private.participant_permission(p_profile_id, 'participants.view_personal')
    when 'sensitive' then private.participant_permission(p_profile_id, 'participants.view_sensitive')
  end, false);
$$;
revoke all on function private.reads_privacy(uuid, text) from public, anon, authenticated;

-- 4. The features of one field (RAPP-665) --------------------------------------------------------------------

-- The features that read a field, and whether its current type fits each.
create or replace function private.field_features_of(p_field_id uuid)
returns table (feature text, powers text, fits boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.feature, r.powers, f.question_type = any (r.accepted_types)
    from public.profile_fields f
    join private.field_features() r on r.system_key = f.system_key
   where f.id = p_field_id
   order by r.feature;
$$;
revoke all on function private.field_features_of(uuid) from public, anon, authenticated;

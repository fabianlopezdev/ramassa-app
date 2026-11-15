-- A NIE keeps its form in the database (RAPP-782, Fabián 2026-11-06).
--
-- Her phone checks a NIE's form wherever Número de document is asked, with
-- the shared `NIE_PATTERN` (one letter, seven digits, one letter, read in
-- capitals). The database now refuses one that does not fit too, on every
-- path that writes her number:
--
--   - her answers by field (`private.write_field_answers`): her Onboarding,
--     her forms, her own edits and the team's edits of her record all write
--     through it;
--   - an entity's referral (`private.save_referral_field_answers`).
--
-- Only a number given new or changed is checked, against her document type
-- once the whole write is done (her type may come in the same call). A
-- number already stored is never refused nor rewritten, and changing only
-- her type does not check the number she gave before. A passport and another
-- document have no form, only the rule that they need a number.
--
-- The number is Sensitive: these are the functions that see it before it is
-- encrypted, and `private.field_answer_now` reads it back decrypted.

-- 1. The rule --------------------------------------------------------------------------------

create or replace function private.nie_number_fits(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(upper(btrim(p_value #>> '{}')) ~ '^[A-Z][0-9]{7}[A-Z]$', false);
$$;
revoke all on function private.nie_number_fits(jsonb) from public, anon, authenticated;

-- The option key of a document type answer (an option id), or null.
create or replace function private.document_type_key(p_type_field_id uuid, p_answer jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select o.key from public.custom_question_options o
   where o.question_id = p_type_field_id and to_jsonb(o.id::text) = p_answer;
$$;
revoke all on function private.document_type_key(uuid, jsonb) from public, anon, authenticated;

/**
 * Refuses her document number when it is among the answers just written and
 * her document type, as stored now, is a NIE whose form it does not fit.
 */
create or replace function private.check_document_number(p_profile_id uuid, p_changed uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  her_org uuid := (select p.org_id from public.profiles p where p.id = p_profile_id);
  type_field public.profile_fields;
  number_field public.profile_fields;
  number_now jsonb;
begin
  select * into number_field from public.profile_fields f
   where f.org_id = her_org and f.system_key = 'document_number';
  if number_field.id is null or not (number_field.id = any (coalesce(p_changed, '{}'::uuid[]))) then
    return;
  end if;
  select * into type_field from public.profile_fields f
   where f.org_id = her_org and f.system_key = 'document_type';
  if type_field.id is null
     or private.document_type_key(type_field.id, private.field_answer_now(p_profile_id, type_field))
          is distinct from 'nie' then
    return;
  end if;
  number_now := private.field_answer_now(p_profile_id, number_field);
  if number_now is not null and not private.nie_number_fits(number_now) then
    raise check_violation using message = 'a NIE is one letter, seven digits, one letter';
  end if;
end;
$$;
revoke all on function private.check_document_number(uuid, uuid[]) from public, anon, authenticated;

-- 2. Her answers by field ------------------------------------------------------------------------

-- The body of `20261025192642_profile_writers_write_field_answers.sql`, with
-- the check once every answer of the call is written.
create or replace function private.write_field_answers(
  p_profile_id uuid,
  p_answers jsonb,
  p_source text,
  p_answered_by uuid default null,
  p_hers boolean default false,
  p_sensitive text default 'write'
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  her_org uuid := (select p.org_id from public.profiles p where p.id = p_profile_id);
  entry record;
  field public.profile_fields;
  given jsonb;
  changed uuid[] := '{}'::uuid[];
begin
  if p_answers is null or jsonb_typeof(p_answers) = 'null' then
    return changed;
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  if p_sensitive not in ('write', 'skip', 'refuse') or her_org is null then
    raise invalid_parameter_value using message = 'write_field_answers needs her profile and a Sensitive rule';
  end if;
  for entry in select key, value from jsonb_each(p_answers) order by key loop
    field := null;
    select * into field from public.profile_fields f
     where f.org_id = her_org and f.id::text = entry.key and not f.is_archived;
    if field.id is null or (p_hers and not private.field_asked_of_her(field.id)) then
      -- Nothing given for a field she is not asked: nothing to do. A form that
      -- sends every field it knows never fails on one taken off her surfaces.
      continue when p_hers and private.custom_answer_is_empty(entry.value);
      if p_hers then
        raise insufficient_privilege using message = 'not a question she is asked';
      end if;
      raise no_data_found using message = 'no such field';
    end if;
    if field.privacy = 'sensitive' and p_sensitive <> 'write' then
      if p_sensitive = 'refuse' then
        raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
      end if;
      continue;
    end if;
    given := case when private.custom_answer_is_empty(entry.value) then null
                  else private.custom_answer_tidied(field.question_type, entry.value) end;
    -- Given again unchanged: whoever gave it first stays its source.
    continue when given is not distinct from private.field_answer_now(p_profile_id, field);
    perform private.write_custom_answer(p_profile_id, field, entry.value, p_source, p_answered_by);
    changed := changed || field.id;
  end loop;
  -- A NIE given new or changed keeps its form (RAPP-782).
  perform private.check_document_number(p_profile_id, changed);
  return changed || private.clear_hidden_answers(p_profile_id, changed);
end;
$$;

-- 3. An entity's referral --------------------------------------------------------------------

-- The body of `20261024000000_remove_the_old_question_model.sql`, with the
-- check on a number given new or changed, against the referral's document
-- type once its answers are written.
create or replace function private.save_referral_field_answers(p_referral public.entity_referrals, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  field public.profile_fields;
  tidied jsonb;
  number_field public.profile_fields;
  type_field public.profile_fields;
  number_changed boolean := false;
  number_now jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    field := null;
    select * into field from public.profile_fields f
     where f.id::text = entry.key and f.org_id = p_referral.org_id and not f.is_archived
       -- Her names are the referral's own columns.
       and f.system_key is distinct from 'first_name' and f.system_key is distinct from 'last_name'
       and exists (select 1 from public.field_placements p
                    where p.field_id = f.id and p.surface = 'entity_form');
    -- Nothing given for a field off the form: nothing to do.
    continue when field.id is null and private.custom_answer_is_empty(entry.value);
    if field.id is null then
      raise insufficient_privilege using message = 'not a question of the referral form';
    end if;
    if private.custom_answer_is_empty(entry.value) then
      delete from public.referral_custom_answers
       where referral_id = p_referral.id and question_id = field.id;
      continue;
    end if;
    tidied := private.custom_answer_tidied(field.question_type, entry.value);
    if not private.custom_answer_valid(field, tidied) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
    if field.system_key = 'document_number' then
      number_changed := tidied is distinct from (
        select public.decrypt_field(r.value_encrypted)::jsonb from public.referral_custom_answers r
         where r.referral_id = p_referral.id and r.question_id = field.id);
    end if;
    insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
    values (p_referral.id, field.id, p_referral.org_id, public.encrypt_field(tidied::text))
    on conflict (referral_id, question_id) do update set value_encrypted = excluded.value_encrypted;
  end loop;
  -- A NIE given new or changed keeps its form (RAPP-782).
  if number_changed then
    select * into number_field from public.profile_fields f
     where f.org_id = p_referral.org_id and f.system_key = 'document_number';
    select * into type_field from public.profile_fields f
     where f.org_id = p_referral.org_id and f.system_key = 'document_type';
    select public.decrypt_field(r.value_encrypted)::jsonb into number_now
      from public.referral_custom_answers r
     where r.referral_id = p_referral.id and r.question_id = number_field.id;
    if type_field.id is not null and number_now is not null
       and private.document_type_key(type_field.id, (
             select public.decrypt_field(r.value_encrypted)::jsonb from public.referral_custom_answers r
              where r.referral_id = p_referral.id and r.question_id = type_field.id)) = 'nie'
       and not private.nie_number_fits(number_now) then
      raise check_violation using message = 'a NIE is one letter, seven digits, one letter';
    end if;
  end if;
end;
$$;

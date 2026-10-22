-- One answer check on both sides, counted and trimmed the same way (RAPP-610).
--
-- WHY
--
-- The verifier sent 116 answers through `save_my_custom_answers` and the
-- shared Zod schema: 15 verdicts differed. Postgres `btrim` strips only
-- spaces, so a tab, a new line or a no-break space was a stored "answer";
-- Postgres counts characters while JavaScript `length` counts UTF-16 units,
-- so 300 emoji fit the database and not the phone; and the save trimmed
-- every string, so " yes" or a padded option id was accepted.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `private.js_trim(text)`: trims the whitespace JavaScript's
--      `String.prototype.trim` trims (ECMAScript WhiteSpace and
--      LineTerminator), so blank means the same on both sides.
--   2. Length is counted in characters (code points) on both sides: Postgres
--      `length` already does; the Zod schema now counts `[...text].length`.
--   3. Only the two free-text types are trimmed before they are checked and
--      stored. Every other value must be exactly what the type takes, as the
--      Zod schema says: a padded " yes" is refused.
--   4. The referral form's answers follow the same blank and trim rules.
--
-- Docs: https://www.postgresql.org/docs/current/functions-matching.html#POSIX-ESCAPE-SEQUENCES
-- (\uwxyz in a bracket expression), https://tc39.es/ecma262/#sec-string.prototype.trim
-- (WhiteSpace and LineTerminator), https://www.postgresql.org/docs/current/functions-string.html
-- (`length` counts characters), https://zod.dev/api#refinements.

create or replace function private.js_trim(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    p_text,
    '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
    '', 'g');
$$;
revoke all on function private.js_trim(text) from public, anon, authenticated;

-- An answer that says nothing: removed rather than stored.
create or replace function private.custom_answer_is_empty(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null or jsonb_typeof(p_value) = 'null'
    or p_value = 'false'::jsonb
    or (jsonb_typeof(p_value) = 'string' and private.js_trim(p_value #>> '{}') = '')
    or (jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) = 0);
$$;
revoke all on function private.custom_answer_is_empty(jsonb) from public, anon, authenticated;

-- The value as it is checked and stored: free text without its padding; any
-- other value exactly as sent.
create or replace function private.custom_answer_tidied(p_type text, p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_type in ('short_text', 'long_text') and jsonb_typeof(p_value) = 'string'
              then to_jsonb(private.js_trim(p_value #>> '{}')) else p_value end;
$$;
revoke all on function private.custom_answer_tidied(text, jsonb) from public, anon, authenticated;

create or replace function private.custom_answer_value_valid(
  p_type text,
  p_settings jsonb,
  p_value jsonb,
  p_live_options text[]
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  kind text := jsonb_typeof(p_value);
  number_value numeric;
  date_value date;
  years integer;
  item text;
  accepted text[];
begin
  if p_value is null then
    return false;
  end if;
  case p_type
    when 'short_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 500;
    when 'long_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 4000;
    when 'yes_no_maybe' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no', 'maybe');
    when 'yes_no' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no');
    when 'single_choice', 'search_choice' then
      return kind = 'string' and (p_value #>> '{}') = any (coalesce(p_live_options, '{}'));
    when 'multiple_choice' then
      return kind = 'array' and jsonb_array_length(p_value) > 0
        and not exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
        and (select count(distinct e) from jsonb_array_elements_text(p_value) e) = jsonb_array_length(p_value)
        and not exists (
          select 1 from jsonb_array_elements_text(p_value) e
           where not (e = any (coalesce(p_live_options, '{}'))));
    when 'number' then
      if kind <> 'number' then return false; end if;
      number_value := (p_value #>> '{}')::numeric;
      return abs(number_value) <= 1000000000
        and (not coalesce((p_settings ->> 'integer')::boolean, false) or number_value = trunc(number_value))
        and (not (p_settings ? 'min') or number_value >= (p_settings ->> 'min')::numeric)
        and (not (p_settings ? 'max') or number_value <= (p_settings ->> 'max')::numeric);
    when 'date' then
      if kind <> 'string' or (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      begin
        date_value := (p_value #>> '{}')::date;
      exception when others then
        return false;
      end;
      -- A typed date that does not exist (30 February) is refused, not rolled over.
      if to_char(date_value, 'YYYY-MM-DD') <> p_value #>> '{}'
         or extract(year from date_value) not between 1900 and 2100 then
        return false;
      end if;
      years := extract(year from age(current_date, date_value))::integer;
      return (not (p_settings ? 'min_age') or years >= (p_settings ->> 'min_age')::integer)
        and (not (p_settings ? 'max_age') or years <= (p_settings ->> 'max_age')::integer);
    when 'phone' then
      return kind = 'string' and (p_value #>> '{}') ~ '^\+[1-9][0-9]{7,14}$';
    when 'email' then
      return kind = 'string' and length(p_value #>> '{}') <= 254
        and (p_value #>> '{}') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
    when 'item_list' then
      if kind <> 'array' or jsonb_array_length(p_value) < 1
         or jsonb_array_length(p_value) > coalesce((p_settings ->> 'max_items')::integer, 20)
         or exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
         or (select count(distinct e) from jsonb_array_elements_text(p_value) e) <> jsonb_array_length(p_value) then
        return false;
      end if;
      for item in select e from jsonb_array_elements_text(p_value) e loop
        if length(item) not between 1 and 120 or item <> private.js_trim(item) then
          return false;
        end if;
      end loop;
      return true;
    when 'consent' then
      return p_value = 'true'::jsonb;
    when 'file_upload' then
      accepted := case p_settings ->> 'accept'
        when 'photo' then array['image/jpeg', 'image/png', 'image/webp']
        else array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] end;
      return kind = 'object'
        and p_value - array['key', 'name', 'content_type', 'size'] = '{}'::jsonb
        and jsonb_typeof(p_value -> 'key') = 'string'
        and (p_value ->> 'key') ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/intake-answers/'
                                   '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                                   '[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\.(jpg|png|webp|pdf)$')
        and jsonb_typeof(p_value -> 'name') = 'string'
        and length(p_value ->> 'name') between 1 and 120
        and jsonb_typeof(p_value -> 'content_type') = 'string'
        and (p_value ->> 'content_type') = any (accepted)
        and private.json_int_between(p_value -> 'size', 1, 10485760);
    when 'signature' then
      return private.app_signature_valid(p_value);
    else
      return false;
  end case;
end;
$$;

revoke all on function private.custom_answer_value_valid(text, jsonb, jsonb, text[])
  from public, anon, authenticated;

create or replace function private.write_custom_answer(
  p_profile_id uuid,
  p_question public.custom_questions,
  p_value jsonb,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season uuid := case when 'season' = any (p_question.placements)
                      then private.current_season_id(p_question.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := private.custom_answer_is_empty(p_value);
  stored jsonb := private.custom_answer_tidied(p_question.question_type, p_value);
begin
  if p_question.question_type in ('file_upload', 'signature') and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file or a signature is hers to give';
  end if;
  -- With no current season there is nowhere to keep a seasonal answer. Her
  -- registration never stops on it; staff are told.
  if 'season' = any (p_question.placements) and season is null then
    if p_source = 'player' then
      return;
    end if;
    raise check_violation using message = 'a seasonal question needs a current season';
  end if;
  if is_empty then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = p_question.id and season_key = key;
    return;
  end if;
  if not private.custom_answer_valid(p_question, stored) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  -- Her file lives in her own private folder of her organization.
  if p_question.question_type = 'file_upload'
     and (split_part(stored ->> 'key', '/', 1) <> p_question.org_id::text
          or split_part(stored ->> 'key', '/', 3) <> p_profile_id::text) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source, answered_at)
  values (
    p_profile_id, p_question.id, key, season, p_question.org_id,
    case when p_question.privacy = 'sensitive' then null else stored end,
    case when p_question.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    p_source, now())
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted,
        source = excluded.source, answered_at = now();
end;
$$;
revoke all on function private.write_custom_answer(uuid, public.custom_questions, jsonb, text)
  from public, anon, authenticated;

create or replace function public.save_referral_custom_answers(p_referral_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  referral public.entity_referrals;
  entry record;
  question public.custom_questions;
  tidied jsonb;
begin
  select * into referral from public.entity_referrals where id = p_referral_id;
  if referral.id is null or referral.entity_user_id <> actor or referral.referred_profile_id is not null then
    raise insufficient_privilege using message = 'only the entity that sent the referral adds its answers';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = referral.org_id and not q.is_archived
       and 'entity_form' = any (q.placements);
    if question.id is null then
      raise insufficient_privilege using message = 'not a question of the referral form';
    end if;
    if private.custom_answer_is_empty(entry.value) then
      delete from public.referral_custom_answers where referral_id = referral.id and question_id = question.id;
      continue;
    end if;
    tidied := private.custom_answer_tidied(question.question_type, entry.value);
    if not private.custom_answer_valid(question, tidied) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
    insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
    values (referral.id, question.id, referral.org_id, public.encrypt_field(tidied::text))
    on conflict (referral_id, question_id) do update set value_encrypted = excluded.value_encrypted;
  end loop;
end;
$$;
revoke all on function public.save_referral_custom_answers(uuid, jsonb) from public, anon;
grant execute on function public.save_referral_custom_answers(uuid, jsonb) to authenticated;

-- Screen texts: what staff see is what she sees (RAPP-710).
--
-- WHY
--
-- The screen editors in the Control Center now show each text as her phone
-- shows it: the staff text, else the app's bundled text in that language, as
-- real editable text. Staff may clear an optional text (an introduction, a
-- help line, a hint), and her phone then shows none in that language. Until
-- now every saved text needed at least one non-blank language, so a cleared
-- text could not be stored, and a blank one fell back to the bundled text.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `private.optional_screen_text_valid`: an optional text may be blank in
--      every language it names ('' means "no text" in that language). Each
--      language is still a string of at most 2000 characters, and at least one
--      language is named.
--   2. `private.screen_text_optional` and `private.authorization_text_optional`
--      list the optional fields: the built-in screens' intro and help line
--      (`OPTIONAL_SCREEN_TEXT_FIELDS`), and the authorization's intro,
--      signature hints and re-registration intros
--      (`OPTIONAL_AUTHORIZATION_TEXT_FIELDS`). Every other text stays as it
--      was: at least one non-blank language.
--   3. `private.builtin_screen_texts_valid` and
--      `private.authorization_override_texts_valid` read those lists.
--
-- Nothing stored changes: every saved text so far has a non-blank language.
-- A language staff never wrote is still left out of the text, and still shows
-- the bundled text in her language.
--
-- Docs: https://www.postgresql.org/docs/current/functions-json.html
-- (`jsonb_each`, `jsonb_typeof`, the `-` operator on keys).

-- 1. An optional text ----------------------------------------------------------------------------------

create or replace function private.optional_screen_text_valid(p_text jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_text) = 'object'
    and p_text <> '{}'::jsonb
    and p_text - array['ca', 'es', 'en', 'ar', 'fa'] = '{}'::jsonb
    and not exists (
      select 1 from jsonb_each(p_text) entry
       where jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 2000
    ),
    false);
$$;

-- 2. The optional fields -------------------------------------------------------------------------------

create or replace function private.screen_text_optional(p_field text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_field = any (array['intro', 'help']);
$$;

create or replace function private.authorization_text_optional(p_part text, p_field text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_part = 'texts'
     and p_field = any (array['intro', 'signature_hint', 'cannot_draw_hint',
                              'reregistration_intro', 'reregistration_season_intro']);
$$;

-- 3. The validators ------------------------------------------------------------------------------------

create or replace function private.builtin_screen_texts_valid(p_screen text, p_texts jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_texts) = 'object'
    and private.builtin_screen_text_fields(p_screen) is not null
    and not exists (
      select 1 from jsonb_each(p_texts) entry
       where not (entry.key = any (private.builtin_screen_text_fields(p_screen)))
          or case
               when private.screen_text_optional(entry.key)
                 then not private.optional_screen_text_valid(entry.value)
               when private.localized_text_valid(entry.value)
                 then exists (select 1 from jsonb_each_text(entry.value) language
                               where length(language.value) > 2000)
               else true
             end),
    false);
$$;

create or replace function private.authorization_override_texts_valid(p_texts jsonb, p_part text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_texts) = 'object'
    and not exists (
      select 1 from jsonb_each(p_texts) entry
       where not (entry.key = any (private.authorization_text_fields(p_part)))
          or case
               when private.authorization_text_optional(p_part, entry.key)
                 then not private.optional_screen_text_valid(entry.value)
               else not private.localized_text_valid(entry.value)
                 or exists (select 1 from jsonb_each_text(entry.value) language
                             where length(language.value) > 2000)
             end),
    false);
$$;

revoke all on function private.optional_screen_text_valid(jsonb) from public, anon, authenticated;
revoke all on function private.screen_text_optional(text) from public, anon, authenticated;
revoke all on function private.authorization_text_optional(text, text) from public, anon, authenticated;
revoke all on function private.builtin_screen_texts_valid(text, jsonb) from public, anon, authenticated;
revoke all on function private.authorization_override_texts_valid(jsonb, text) from public, anon, authenticated;

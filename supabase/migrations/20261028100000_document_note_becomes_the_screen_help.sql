-- The note under the document step becomes the Documentació screen's help (RAPP-721).
--
-- WHY
--
-- The Documentació screen had two places for the same kind of text: its own
-- help line (RAPP-612, edited with the screen's wording) and a separate note
-- about the identity document (RAPP-302, `organizations.document_step_explanation`).
-- Staff now write that explanation as the screen's help, which every other
-- screen already has, read by the shared screen text rule (RAPP-710).
--
-- WHAT THIS MIGRATION DOES
--
--   1. For each organization with a note, copies it into the `documentation`
--      screen's help, language by language, only where the help is not set.
--      A language the note did not write gets the note's Catalan, which is
--      what her phone showed there (the note fell back to Catalan; the help
--      shows exactly its own language). The row is written as
--      `save_builtin_screen` writes it.
--   2. Clears the note: the text now lives in the help.
--   3. `get_document_step_explanation()` returns null. The function stays,
--      because older app builds call it on every onboarding session.
--   4. Drops `set_document_step_explanation`: only the note form called it.
--
-- The column `organizations.document_step_explanation` stays: the onboarding
-- setup export and import (RAPP-621) still read and write it, and an older
-- exported setup still carries it.
--
-- Docs: https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT
-- (`on conflict ... do update`) and
-- https://www.postgresql.org/docs/current/functions-json.html (`jsonb_object_agg`).

-- 1. The note into the screen's help ------------------------------------------------------------------

with notes as (
  select o.id as org_id,
         o.document_step_explanation as note,
         coalesce(s.texts, '{}'::jsonb) as texts,
         coalesce(s.is_hidden, false) as is_hidden
    from public.organizations o
    left join public.intake_builtin_screens s on s.org_id = o.id and s.screen = 'documentation'
   where o.document_step_explanation is not null
), merged as (
  select n.org_id, n.texts, n.is_hidden,
         (select jsonb_object_agg(
                   l.language,
                   coalesce(n.texts -> 'help' -> l.language,
                            to_jsonb(coalesce(nullif(btrim(n.note ->> l.language), ''),
                                              btrim(n.note ->> 'ca')))))
            from unnest(array['ca', 'es', 'en', 'ar', 'fa']) as l(language)) as help
    from notes n
)
insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_at)
select m.org_id, 'documentation', m.texts || jsonb_build_object('help', m.help), m.is_hidden, now()
  from merged m
on conflict (org_id, screen) do update
  set texts = excluded.texts, updated_at = now();

-- 2. The note is cleared ------------------------------------------------------------------------------

update public.organizations
   set document_step_explanation = null
 where document_step_explanation is not null;

-- 3. Older apps read no note --------------------------------------------------------------------------

create or replace function public.get_document_step_explanation()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- RAPP-721: the explanation is the Documentació screen's help now.
  select null::jsonb;
$$;

-- 4. The note form's save ------------------------------------------------------------------------------

drop function if exists public.set_document_step_explanation(jsonb);

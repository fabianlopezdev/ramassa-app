-- Her names count as answered only once her profile holds them (RAPP-661).
--
-- WHY
--
-- `private.app_question_answered` (RAPP-661) said her names and her app
-- language were always answered, because they live on her account (D2). An
-- account with no profile yet has neither, so the wizard of a woman who signs
-- up on her own skipped its first screen and she was never asked her name:
-- `my_questions_to_ask()` left `first_name` and `last_name` out. Before
-- RAPP-661 the question counted as answered only when someone had answered it.
-- Found by the final QA: `onboarding-closure.web-qa.ts` opened on step 2.
--
-- WHAT THIS MIGRATION DOES
--
--   Her names are answered when her profile holds a name that is not blank;
--   her app language when her profile holds one. An invited woman whose
--   names staff gave keeps skipping the name screen, as before.

create or replace function private.app_question_answered(p_profile_id uuid, p_question text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_question = 'first_name' then exists (
      select 1 from public.profiles p
       where p.id = p_profile_id and nullif(btrim(p.first_name), '') is not null)
    when p_question = 'last_name' then exists (
      select 1 from public.profiles p
       where p.id = p_profile_id and nullif(btrim(p.last_name), '') is not null)
    when p_question = 'preferred_language' then exists (
      select 1 from public.profiles p
       where p.id = p_profile_id and p.preferred_language is not null)
    when p_question = 'avatar' then exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.avatar_url is not null)
    when p_question = 'season_number' then exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.season_number is not null)
    else exists (
      select 1 from public.profile_fields f
        join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
       where f.system_key is not null
         and private.system_key_question(f.system_key) = p_question
         and private.field_answer_now(p_profile_id, f) is not null)
  end;
$$;
revoke all on function private.app_question_answered(uuid, text) from public, anon, authenticated;

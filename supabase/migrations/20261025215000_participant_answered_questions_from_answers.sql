-- What she answered, for the team, from her answers (RAPP-662).
--
-- WHY
--
-- Her page and the staff phone ask which app questions she has answered, to
-- plan what her onboarding still asks. They read `profile_answers` straight
-- from the table, and no writer fills it since RAPP-661. They now call
-- `participant_answered_questions`, which reads her answers the way her own
-- `my_answered_questions` does (`private.answered_app_questions`).
--
-- WHAT CHANGES
--
--   1. `public.participant_answered_questions(profile)`: the app questions she
--      has an answer to, for a caller who may list her (participants.view, or
--      test_players.manage for a test player), as the `profile_answers` row
--      policy allowed. Which questions, never the answers: the plan needs
--      them all whatever their level.
--
-- Docs: https://www.postgresql.org/docs/17/xfunc-sql.html.

create or replace function public.participant_answered_questions(p_profile_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p
                  where p.id = p_profile_id and p.org_id = (select public.current_org_id()))
     or not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query select unnest(private.answered_app_questions(p_profile_id));
end;
$$;
revoke all on function public.participant_answered_questions(uuid) from public, anon;
grant execute on function public.participant_answered_questions(uuid) to authenticated, service_role;

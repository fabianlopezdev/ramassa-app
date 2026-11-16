-- RAPP-814: a player edits and resends her story when the team asks for changes.
--
-- The only UPDATE policy on `knowledge_articles` is the team's, so a story in
-- `changes_requested` was a dead end for its author. This function is her one
-- write path: her own participant story, only while it waits for changes, only
-- its title and text. The text is stored the way the first submission stores
-- it (one paragraph under her submission language), so the table's checks
-- validate it with the same rules, and the translations the team made of the
-- old text go with it. Photos, consent evidence and the submission language
-- stay as they are (`private.prepare_knowledge_article` keeps them immutable).
-- The status goes back to `submitted` through the existing transition rule.
-- The team's note is cleared, because `knowledge_articles_submitted_note_empty`
-- allows no note on a submitted story. No table policy changes.
create or replace function public.resend_participant_story(
  p_story_id uuid,
  p_title text,
  p_story text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  author uuid := (select auth.uid());
begin
  if author is null or (select public.current_app_role()) is distinct from 'player' then
    raise insufficient_privilege using message = 'Only a player can resend her story.';
  end if;
  if p_story_id is null
    or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_story is null or length(btrim(p_story)) not between 1 and 10000 then
    raise check_violation using message = 'A story, a title and a text are required.';
  end if;

  update public.knowledge_articles as article
     set title = jsonb_build_object(article.submission_language, btrim(p_title)),
         body = jsonb_build_object(
           article.submission_language,
           jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', btrim(p_story)))
         ),
         story_status = 'submitted',
         reviewer_note = null
   where article.id = p_story_id
     and article.org_id = (select public.current_org_id())
     and article.author_id = author
     and article.content_type = 'participant_story'
     and article.story_status = 'changes_requested'
     and article.submission_language is not null;

  if not found then
    raise no_data_found using message = 'No story of hers is waiting for changes.';
  end if;
end;
$$;

comment on function public.resend_participant_story is
  'The signed-in player resends her own participant story in changes_requested with a new title and text; it returns to submitted.';

revoke all on function public.resend_participant_story(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resend_participant_story(uuid, text, text)
  to authenticated;

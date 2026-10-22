-- The design role sees test players only, nothing about a real player (RAPP-615).
--
-- WHY
--
-- 20261021190000 limited the profile rows of a team member whose only access
-- is the design pair (onboarding.design, test_players.manage). Signed in as
-- that account, a verifier still read two real players' forum posts, two
-- replies and one community photo: those three policies admit any member of
-- the organization. The same account also signs in as test players on a
-- phone (RAPP-616), and a test player's session read the same posts, photos
-- and published stories.
--
-- AUDIT (every select policy and every function callable by authenticated
-- that reads player data, 2026-10-21)
--
-- Admitted any org member or any team member, and returned player data:
--   forum_posts_select_org_member, forum_replies_select_org_member,
--   media_items_select_tenant_privacy, public.can_read_media_object (the media
--   worker's read check mirrors that policy), knowledge_articles (published
--   participant stories, for the player role), and public.start_player_preview
--   (any team member opens a player session, which reads all of the above).
-- Already gated by a permission the design pair does not hold (pgTAP 0092
-- proves 0 real-player rows): conversations, messages, conversation history,
-- event signups, attendance, feedback, mentoring, surveys and responses,
-- service interests, push tokens, material handovers, notification groups and
-- sends, terms acceptances, participant notes, deletion requests,
-- authorization signatures and consent events, app terms signatures, season,
-- custom and prefilled answers, referrals, walk-in signings, invitations, the
-- audit log, and the functions that read them.
--
-- WHAT THIS MIGRATION DOES
--
--   1. private.sees_only_test_players(): true for a team member limited to
--      the design pair, and for a test player's own session.
--   2. private.authored_by_test_or_team(id): true when the author is a team
--      account or a test player. An erased author (null) is a real player.
--   3. The four policies and can_read_media_object show such a caller only
--      rows written by a test player or the team.
--   4. start_player_preview refuses a team member limited to the design pair.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- ("Call functions with select" and security definer helpers in a private
-- schema for checks that read other tables).

-- 1 and 2. Helpers -----------------------------------------------------------------------------------

create function private.sees_only_test_players()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.limited_to_test_players())
      or exists (
           select 1 from public.profiles as own
            where own.id = (select auth.uid())
              and own.is_test_account
              and own.role in ('player', 'invited'));
$$;

comment on function private.sees_only_test_players is
  'True for a team member limited to the design pair and for a test player''s own session: they read community rows of test players and the team only (RAPP-615).';

create function private.authored_by_test_or_team(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles as author
     where author.id = p_profile_id
       and (author.is_test_account or author.role not in ('player', 'invited'))
  );
$$;

comment on function private.authored_by_test_or_team is
  'True when the author is a team account or a test player. An erased or unknown author counts as a real player (RAPP-615).';

-- Row policies call these as the signed-in person. The private schema is not
-- exposed by the API, so neither becomes a callable endpoint.
revoke all on function private.sees_only_test_players() from public, anon;
revoke all on function private.authored_by_test_or_team(uuid) from public, anon;
grant execute on function private.sees_only_test_players() to authenticated;
grant execute on function private.authored_by_test_or_team(uuid) to authenticated;

-- 3. The community policies ----------------------------------------------------------------------------

alter policy forum_posts_select_org_member on public.forum_posts
  using (
    org_id = (select public.current_org_id())
    and (visibility in ('visible', 'deleted') or (select public.has_permission('forum.moderate')))
    and (not (select private.sees_only_test_players()) or private.authored_by_test_or_team(author_id))
  );

alter policy forum_replies_select_org_member on public.forum_replies
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('forum.moderate'))
      or (
        visibility in ('visible', 'deleted')
        and exists (
          select 1 from public.forum_posts as post
           where post.org_id = forum_replies.org_id
             and post.id = forum_replies.post_id
             and post.visibility in ('visible', 'deleted')
        )
      )
    )
    and (not (select private.sees_only_test_players()) or private.authored_by_test_or_team(author_id))
  );

alter policy media_items_select_tenant_privacy on public.media_items
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('gallery.moderate'))
      or (select public.has_permission('forum.moderate'))
      or (select public.has_permission('knowledge.edit'))
      or (select public.has_permission('knowledge.publish'))
      or (
        moderation_state = 'visible'
        and (uploaded_by = (select auth.uid()) or privacy_level = 'community')
      )
    )
    and (not (select private.sees_only_test_players()) or private.authored_by_test_or_team(uploaded_by))
  );

alter policy knowledge_articles_select_org_staff_visible_or_own_story on public.knowledge_articles
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('knowledge.edit'))
      or (select public.has_permission('knowledge.publish'))
      or (
        (select public.current_app_role()) = 'player'
        and (
          (is_published and published_at <= now() and (expires_at is null or expires_at > now()))
          or (content_type = 'participant_story' and author_id = (select auth.uid()))
        )
      )
    )
    -- A story is written by a player; articles by the team stay visible.
    and (
      content_type <> 'participant_story'
      or not (select private.sees_only_test_players())
      or private.authored_by_test_or_team(author_id)
    )
  );

-- The media worker asks this before it serves a file: the same rule as the policy.
create or replace function public.can_read_media_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with matching as (
    select item.*
    from public.media_items item
    where item.file_url = p_object_key or item.thumbnail_url = p_object_key
  ), authorized as (
    select item.id
    from matching item
    where item.org_id = (select public.current_org_id())
      and (
        (select (public.has_permission('gallery.moderate') or public.has_permission('forum.moderate') or public.has_permission('knowledge.edit') or public.has_permission('knowledge.publish')))
        or (
          item.moderation_state = 'visible'
          and (item.uploaded_by = (select auth.uid()) or item.privacy_level = 'community')
        )
      )
      and (not (select private.sees_only_test_players()) or private.authored_by_test_or_team(item.uploaded_by))
  )
  select exists (select 1 from matching)
    and not exists (
      select 1 from matching item
      where not exists (select 1 from authorized visible where visible.id = item.id)
    );
$$;

-- 4. No player session for the design role -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_player_preview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  preview_id uuid;
  preview_email text;
  preview_password text := encode(extensions.gen_random_bytes(24), 'base64');
  org_language text;
begin
  -- The design role signs in as test players instead (RAPP-615): the shared
  -- preview player reads real players' forum posts and photos.
  if actor_org is null or not (select public.is_team_member())
    or (select private.limited_to_test_players())
  then
    raise exception 'only a team member with a verified second factor can preview as a player'
      using errcode = '42501';
  end if;

  perform public.assert_within_hourly_limit('player.preview', 60);
  -- Two team members starting the first preview at once create one account.
  perform pg_advisory_xact_lock(hashtext('player-preview:' || actor_org::text));

  preview_email := 'preview+' || actor_org::text || '@preview.ramassa.invalid';
  select id into preview_id
  from public.profiles
  where org_id = actor_org and role = 'preview';

  if preview_id is null then
    preview_id := gen_random_uuid();
    select default_language into org_language from public.organizations where id = actor_org;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', preview_id,
      'authenticated', 'authenticated', preview_email, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      preview_id::text,
      preview_id,
      jsonb_build_object('sub', preview_id::text, 'email', preview_email, 'email_verified', true),
      'email', now(), now(), now()
    );

    -- No personal data: a fixed name, no document, no contact details.
    insert into public.profiles (
      id, org_id, role, first_name, last_name, preferred_language,
      document_type, terms_accepted_at
    ) values (
      preview_id, actor_org, 'preview', 'Preview', '', org_language, 'none', now()
    );
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(preview_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = preview_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
  values (actor_org, actor_id, 'player_preview.start', 'profile', preview_id);

  return jsonb_build_object('email', preview_email, 'password', preview_password);
end;
$function$;


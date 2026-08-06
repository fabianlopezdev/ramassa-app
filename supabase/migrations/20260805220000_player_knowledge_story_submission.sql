-- Player story submission evidence and language-faithful drafts.

alter table public.knowledge_articles
  add column submission_language text
    check (submission_language is null or submission_language in ('ca', 'es', 'en', 'ar', 'fa')),
  add column story_image_urls text[] not null default '{}',
  add column publication_consent boolean,
  add column publication_consent_at timestamptz,
  add column publication_consent_version text
    check (
      publication_consent_version is null
      or length(btrim(publication_consent_version)) between 1 and 100
    );

create or replace function public.is_story_image_urls_valid(
  image_urls text[],
  expected_org_id uuid,
  expected_author_id uuid
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select image_urls is not null
    and cardinality(image_urls) between 0 and 3
    and (
      cardinality(image_urls) = 0
      or (
        expected_org_id is not null
        and expected_author_id is not null
        and not exists (
          select 1
          from unnest(image_urls) as image_url
          where image_url is null
            or length(btrim(image_url)) not between 1 and 2000
            or image_url !~* (
              '^' || expected_org_id::text
              || '/stories/' || expected_author_id::text
              || '/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}[.](jpg|png|webp)$'
            )
        )
      )
    );
$$;

comment on function public.is_story_image_urls_valid is 'Allows up to three private image keys minted through the story author organization and upload prefix.';

create or replace function public.is_localized_content_valid_for_language(
  content jsonb,
  max_length integer,
  source_language text
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select source_language in ('ca', 'es', 'en', 'ar', 'fa')
    and jsonb_typeof(content) = 'object'
    and content ? source_language
    and not exists (
      select 1
      from jsonb_object_keys(content) as key(language_key)
      where language_key <> all(array['ca', 'es', 'en', 'ar', 'fa'])
    )
    and not exists (
      select 1
      from jsonb_each(content) as entry(language_key, localized_value)
      where jsonb_typeof(localized_value) <> 'string'
        or length(btrim(localized_value #>> '{}')) not between 1 and max_length
    );
$$;

comment on function public.is_localized_content_valid_for_language is 'Validates partial localized text while preserving a participant story in its actual source language.';

create or replace function public.is_knowledge_body_valid_for_language(
  content jsonb,
  source_language text
)
returns boolean
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  blocks jsonb;
  block jsonb;
begin
  if source_language not in ('ca', 'es', 'en', 'ar', 'fa')
    or jsonb_typeof(content) <> 'object'
    or not (content ? source_language) then
    return false;
  end if;

  if exists (
    select 1 from jsonb_object_keys(content) as key(language_key)
    where language_key <> all(array['ca', 'es', 'en', 'ar', 'fa'])
  ) then
    return false;
  end if;

  for blocks in select value from jsonb_each(content)
  loop
    if jsonb_typeof(blocks) <> 'array'
      or jsonb_array_length(blocks) not between 1 and 50 then
      return false;
    end if;

    for block in select value from jsonb_array_elements(blocks)
    loop
      if jsonb_typeof(block) <> 'object' or jsonb_typeof(block->'type') <> 'string' then
        return false;
      end if;

      if block->>'type' = 'paragraph' then
        if not (block ?& array['type', 'text'])
          or jsonb_typeof(block->'text') <> 'string'
          or length(btrim(block->>'text')) not between 1 and 10000 then
          return false;
        end if;
      elsif block->>'type' = 'step' then
        if not (block ?& array['type', 'title', 'text', 'imageUrl', 'imageAlt'])
          or jsonb_typeof(block->'title') <> 'string'
          or length(btrim(block->>'title')) not between 1 and 300
          or jsonb_typeof(block->'text') <> 'string'
          or length(btrim(block->>'text')) not between 1 and 10000
          or jsonb_typeof(block->'imageUrl') not in ('string', 'null')
          or jsonb_typeof(block->'imageAlt') not in ('string', 'null')
          or (
            jsonb_typeof(block->'imageUrl') = 'string'
            and length(btrim(block->>'imageUrl')) not between 1 and 2000
          )
          or (
            jsonb_typeof(block->'imageAlt') = 'string'
            and length(btrim(block->>'imageAlt')) not between 1 and 500
          )
          or (jsonb_typeof(block->'imageUrl') = 'string')
            <> (jsonb_typeof(block->'imageAlt') = 'string') then
          return false;
        end if;
      else
        return false;
      end if;
    end loop;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

comment on function public.is_knowledge_body_valid_for_language is 'Validates partial structured blocks while requiring the participant story source language rather than assuming Catalan.';

alter table public.knowledge_articles
  drop constraint knowledge_articles_title_valid,
  drop constraint knowledge_articles_body_valid;

alter table public.knowledge_articles
  add constraint knowledge_articles_title_valid
    check (
      case
        when content_type = 'participant_story' and submission_language is not null
          then public.is_localized_content_valid_for_language(title, 200, submission_language)
        else public.is_localized_content_valid(title, 200, false)
      end
    ),
  add constraint knowledge_articles_body_valid
    check (
      case
        when content_type = 'participant_story' and submission_language is not null
          then public.is_knowledge_body_valid_for_language(body, submission_language)
        else public.is_knowledge_body_valid(body, false)
      end
    ),
  add constraint knowledge_articles_story_images_valid
    check (
      public.is_story_image_urls_valid(story_image_urls, org_id, author_id)
      and (content_type = 'participant_story' or cardinality(story_image_urls) = 0)
    ),
  add constraint knowledge_articles_story_consent_consistent
    check (
      (
        content_type = 'participant_story'
        and (
          (
            publication_consent is null
            and publication_consent_at is null
            and publication_consent_version is null
            and submission_language is null
          )
          or (
            publication_consent = true
            and publication_consent_at is not null
            and publication_consent_version is not null
            and submission_language is not null
          )
        )
      )
      or (
        content_type <> 'participant_story'
        and submission_language is null
        and cardinality(story_image_urls) = 0
        and publication_consent is null
        and publication_consent_at is null
        and publication_consent_version is null
      )
    );

create or replace function private.prepare_knowledge_article()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_first_name text;
  author_is_current_player boolean;
  should_validate_author boolean;
begin
  if new.content_type = 'participant_story' then
    should_validate_author := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      should_validate_author := new.content_type is distinct from old.content_type
        or new.author_id is distinct from old.author_id
        or new.org_id is distinct from old.org_id;
    end if;

    if should_validate_author then
      select first_name, id = auth.uid() and role = 'player'
        into profile_first_name, author_is_current_player
      from public.profiles
      where id = new.author_id and org_id = new.org_id and role = 'player';

      if profile_first_name is null or length(btrim(profile_first_name)) = 0 then
        raise exception 'participant story author must be a player in this organization'
          using errcode = 'check_violation';
      end if;
      new.author_first_name := profile_first_name;
    end if;

    if tg_op = 'INSERT'
      and author_is_current_player
      and new.publication_consent = true
      and new.publication_consent_at is null then
      new.publication_consent_at := now();
    end if;
  else
    new.author_id := null;
    new.author_first_name := null;
    new.story_status := null;
    new.reviewer_note := null;
    new.submission_language := null;
    new.story_image_urls := '{}';
    new.publication_consent := null;
    new.publication_consent_at := null;
    new.publication_consent_version := null;
  end if;

  if tg_op = 'UPDATE' then
    if new.submission_language is distinct from old.submission_language
      or new.story_image_urls is distinct from old.story_image_urls
      or new.publication_consent is distinct from old.publication_consent
      or new.publication_consent_at is distinct from old.publication_consent_at
      or new.publication_consent_version is distinct from old.publication_consent_version then
      raise exception 'participant story submission evidence is immutable'
        using errcode = 'check_violation';
    end if;

    if old.story_status is not null
      and new.story_status is distinct from old.story_status then
      if not public.is_story_status_transition_allowed(old.story_status, new.story_status) then
        raise exception 'invalid participant story transition: % to %', old.story_status, new.story_status
          using errcode = 'check_violation';
      end if;
      new.reviewed_by := (select auth.uid());
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop policy knowledge_articles_insert_org_staff_or_own_story
  on public.knowledge_articles;

create policy knowledge_articles_insert_org_staff_or_own_story
  on public.knowledge_articles
  for insert
  to authenticated
  with check (
    org_id = (select public.current_org_id())
    and created_by = (select auth.uid())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and content_type = 'participant_story'
        and author_id = (select auth.uid())
        and story_status = 'submitted'
        and not is_published
        and published_at is null
        and expires_at is null
        and reviewer_note is null
        and submission_language in ('ca', 'es', 'en', 'ar', 'fa')
        and title ? submission_language
        and body ? submission_language
        and publication_consent = true
        and publication_consent_at is not null
        and publication_consent_version = 'story-publication-v1'
        and public.is_story_image_urls_valid(story_image_urls, org_id, author_id)
      )
    )
  );

revoke all on table public.knowledge_articles from anon, authenticated;
grant select on table public.knowledge_articles to authenticated;
grant insert (
  category_id, title, body, image_url, video_url, external_url, content_type,
  story_status, author_id, reviewer_note, is_published, published_at, expires_at,
  submission_language, story_image_urls, publication_consent,
  publication_consent_version
) on table public.knowledge_articles to authenticated;
grant update (
  category_id, title, body, image_url, video_url, external_url, content_type,
  story_status, reviewer_note, is_published, published_at, expires_at
) on table public.knowledge_articles to authenticated;
grant delete on table public.knowledge_articles to authenticated;

comment on column public.knowledge_articles.submission_language is 'The participant story source language. Immutable after submission and used as the translation source.';
comment on column public.knowledge_articles.story_image_urls is 'Up to three authenticated private media keys submitted with the story. Immutable after submission.';
comment on column public.knowledge_articles.publication_consent is 'Explicit participant consent for staff review and possible publication. New player submissions require true.';
comment on column public.knowledge_articles.publication_consent_at is 'Server-recorded consent timestamp. Clients receive no insert or update privilege on this column.';
comment on column public.knowledge_articles.publication_consent_version is 'Version of the localized publication-consent copy accepted by the participant.';

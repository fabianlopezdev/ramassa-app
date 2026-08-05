-- Tenant-scoped knowledge base and participant-story review pipeline.

create or replace function public.is_allowed_video_url(video_url text)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select video_url is null
    or video_url ~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{6,15}$'
    or video_url ~ '^https://player\.vimeo\.com/video/[0-9]{6,12}$';
$$;

comment on function public.is_allowed_video_url is 'Allows only canonical YouTube privacy embeds and Vimeo player embeds. The shared client normalizes ordinary watch URLs before storage.';

create or replace function public.is_knowledge_body_valid(
  content jsonb,
  require_all_languages boolean default false
)
returns boolean
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  language text;
  blocks jsonb;
  block jsonb;
  source_type text;
begin
  if jsonb_typeof(content) <> 'object' or not (content ? 'ca') then
    return false;
  end if;

  if exists (
    select 1 from jsonb_object_keys(content) as key(language_key)
    where language_key <> all(array['ca', 'es', 'en', 'ar', 'fa'])
  ) then
    return false;
  end if;

  if require_all_languages and not (content ?& array['ca', 'es', 'en', 'ar', 'fa']) then
    return false;
  end if;

  for language, blocks in select key, value from jsonb_each(content)
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
          or (jsonb_typeof(block->'imageUrl') not in ('string', 'null'))
          or (jsonb_typeof(block->'imageAlt') not in ('string', 'null'))
          or (
            jsonb_typeof(block->'imageUrl') = 'string'
            and length(btrim(block->>'imageUrl')) not between 1 and 2000
          )
          or (
            jsonb_typeof(block->'imageAlt') = 'string'
            and length(btrim(block->>'imageAlt')) not between 1 and 500
          )
          or (jsonb_typeof(block->'imageUrl') = 'string') <> (jsonb_typeof(block->'imageAlt') = 'string') then
          return false;
        end if;
      else
        return false;
      end if;
    end loop;
  end loop;

  if require_all_languages then
    foreach language in array array['es', 'en', 'ar', 'fa']
    loop
      if jsonb_array_length(content->language) <> jsonb_array_length(content->'ca') then
        return false;
      end if;
      for block_index in 0..jsonb_array_length(content->'ca') - 1
      loop
        source_type := content->'ca'->block_index->>'type';
        if content->language->block_index->>'type' <> source_type then
          return false;
        end if;
      end loop;
    end loop;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

comment on function public.is_knowledge_body_valid is 'Validates JSONB paragraph and step blocks. Published bodies require the same block count and types in CA, ES, EN, AR, and FA.';

create or replace function public.is_story_status_transition_allowed(
  old_status text,
  new_status text
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select case old_status
    when 'submitted' then new_status = 'in_review'
    when 'in_review' then new_status in ('changes_requested', 'published', 'rejected')
    when 'changes_requested' then new_status = 'submitted'
    else false
  end;
$$;

alter table public.profiles
  add constraint profiles_org_id_id_unique unique (org_id, id);

create table public.knowledge_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  name jsonb not null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  icon text not null check (length(btrim(icon)) between 1 and 100),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_categories_org_id_id_unique unique (org_id, id),
  constraint knowledge_categories_org_slug_unique unique (org_id, slug),
  constraint knowledge_categories_name_complete
    check (public.is_localized_content_valid(name, 200, true))
);

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  category_id uuid not null,
  title jsonb not null,
  body jsonb not null,
  image_url text check (image_url is null or length(btrim(image_url)) between 1 and 2000),
  video_url text,
  external_url text check (external_url is null or external_url ~ '^https://'),
  content_type text not null default 'article'
    check (content_type in ('article', 'tutorial', 'video', 'external_link', 'participant_story')),
  story_status text
    check (story_status in ('submitted', 'in_review', 'changes_requested', 'published', 'rejected')),
  author_id uuid,
  author_first_name text,
  reviewer_note text check (reviewer_note is null or length(btrim(reviewer_note)) between 1 and 2000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  is_published boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_articles_category_same_org
    foreign key (org_id, category_id)
    references public.knowledge_categories (org_id, id),
  constraint knowledge_articles_author_same_org
    foreign key (org_id, author_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint knowledge_articles_title_valid
    check (public.is_localized_content_valid(title, 200, false)),
  constraint knowledge_articles_body_valid
    check (public.is_knowledge_body_valid(body, false)),
  constraint knowledge_articles_video_allowed
    check (public.is_allowed_video_url(video_url)),
  constraint knowledge_articles_story_fields_consistent
    check (
      (
        content_type = 'participant_story'
        and author_id is not null
        and author_first_name is not null
        and story_status is not null
      )
      or (
        content_type <> 'participant_story'
        and author_id is null
        and author_first_name is null
        and story_status is null
        and reviewer_note is null
      )
    ),
  constraint knowledge_articles_submitted_note_empty
    check (story_status <> 'submitted' or reviewer_note is null),
  constraint knowledge_articles_story_publication_consistent
    check (
      content_type <> 'participant_story'
      or is_published = (story_status = 'published')
    ),
  constraint knowledge_articles_published_at_required
    check (not is_published or published_at is not null),
  constraint knowledge_articles_expiry_after_publication
    check (
      expires_at is null
      or (published_at is not null and expires_at > published_at)
    ),
  constraint knowledge_articles_published_languages_complete
    check (
      not is_published
      or (
        public.is_localized_content_valid(title, 200, true)
        and public.is_knowledge_body_valid(body, true)
      )
    ),
  constraint knowledge_articles_published_type_target
    check (
      not is_published
      or (content_type <> 'video' or video_url is not null)
      and (content_type <> 'external_link' or external_url is not null)
    )
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.prepare_knowledge_article()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_first_name text;
begin
  if new.content_type = 'participant_story' then
    select first_name into profile_first_name
    from public.profiles
    where id = new.author_id and org_id = new.org_id and role = 'player';

    if profile_first_name is null or length(btrim(profile_first_name)) = 0 then
      raise exception 'participant story author must be a player in this organization'
        using errcode = 'check_violation';
    end if;
    new.author_first_name := profile_first_name;
  else
    new.author_id := null;
    new.author_first_name := null;
    new.story_status := null;
    new.reviewer_note := null;
  end if;

  if tg_op = 'UPDATE'
    and old.story_status is not null
    and new.story_status is distinct from old.story_status then
    if not public.is_story_status_transition_allowed(old.story_status, new.story_status) then
      raise exception 'invalid participant story transition: % to %', old.story_status, new.story_status
        using errcode = 'check_violation';
    end if;
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

create trigger knowledge_articles_prepare
  before insert or update on public.knowledge_articles
  for each row execute function private.prepare_knowledge_article();

create trigger knowledge_categories_set_updated_at
  before update on public.knowledge_categories
  for each row execute function public.set_updated_at();

create trigger knowledge_articles_set_updated_at
  before update on public.knowledge_articles
  for each row execute function public.set_updated_at();

create or replace function private.remove_anonymized_participant_stories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.knowledge_articles where author_id = new.id;
  return new;
end;
$$;

create trigger profiles_remove_anonymized_stories
  after update of anonymized_at on public.profiles
  for each row
  when (old.anonymized_at is null and new.anonymized_at is not null)
  execute function private.remove_anonymized_participant_stories();

create index knowledge_categories_org_sort_idx
  on public.knowledge_categories (org_id, sort_order, id);

create index knowledge_articles_org_list_idx
  on public.knowledge_articles (org_id, content_type, is_published, updated_at desc, id);

create index knowledge_articles_org_visible_idx
  on public.knowledge_articles (org_id, category_id, published_at desc, id)
  where is_published;

create index knowledge_articles_org_story_queue_idx
  on public.knowledge_articles (org_id, story_status, updated_at desc, id)
  where content_type = 'participant_story';

create index knowledge_articles_org_author_idx
  on public.knowledge_articles (org_id, author_id, updated_at desc)
  where author_id is not null;

create index knowledge_articles_created_by_idx
  on public.knowledge_articles (created_by)
  where created_by is not null;

create index knowledge_articles_reviewed_by_idx
  on public.knowledge_articles (reviewed_by)
  where reviewed_by is not null;

alter table public.knowledge_categories enable row level security;
alter table public.knowledge_categories force row level security;
alter table public.knowledge_articles enable row level security;
alter table public.knowledge_articles force row level security;

create policy knowledge_categories_select_org_staff_or_player
  on public.knowledge_categories
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (select public.current_app_role()) = 'player'
    )
  );

create policy knowledge_categories_insert_org_staff
  on public.knowledge_categories
  for insert
  to authenticated
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy knowledge_categories_update_org_staff
  on public.knowledge_categories
  for update
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  )
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy knowledge_categories_delete_org_staff
  on public.knowledge_categories
  for delete
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy knowledge_articles_select_org_staff_visible_or_own_story
  on public.knowledge_articles
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and (
          (
            is_published
            and published_at <= now()
            and (expires_at is null or expires_at > now())
          )
          or (
            content_type = 'participant_story'
            and author_id = (select auth.uid())
          )
        )
      )
    )
  );

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
      )
    )
  );

create policy knowledge_articles_update_org_staff
  on public.knowledge_articles
  for update
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  )
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy knowledge_articles_delete_org_staff
  on public.knowledge_articles
  for delete
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

revoke all on table public.knowledge_categories from anon, authenticated;
grant select, insert, update, delete on table public.knowledge_categories to authenticated;

revoke all on table public.knowledge_articles from anon, authenticated;
grant select on table public.knowledge_articles to authenticated;
grant insert (
  category_id, title, body, image_url, video_url, external_url, content_type,
  story_status, author_id, reviewer_note, is_published, published_at, expires_at
) on table public.knowledge_articles to authenticated;
grant update (
  category_id, title, body, image_url, video_url, external_url, content_type,
  story_status, author_id, reviewer_note, is_published, published_at, expires_at
) on table public.knowledge_articles to authenticated;
grant delete on table public.knowledge_articles to authenticated;

create or replace function public.personal_data_disposition()
returns table (
  table_name text,
  participant_column text,
  disposition text,
  reason text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  values
    ('profiles', 'id', 'purge',
     'The record itself, including the four columns encrypted under ADR-004.'),
    ('participant_notes', 'profile_id', 'purge',
     'The team''s prose about her life. Append-only against editing, not against erasure.'),
    ('push_tokens', 'user_id', 'purge',
     'Device tokens. Anything left here could still deliver a notification to her phone.'),
    ('terms_acceptances', 'profile_id', 'purge',
     'Her consent records; there is nothing left for them to be consent to.'),
    ('deletion_requests', 'profile_id', 'purge',
     'Carries `reason`, written in her own words. The audit trail records that the request was fulfilled.'),
    ('invites', 'accepted_by', 'purge',
     'The invitation that admitted her, and separately every row carrying her email address.'),
    ('equipment_deliveries', 'profile_id', 'purge',
     'What she was given and when. Not neutral inventory: it says which women needed boots and in what month, which is an inference about her circumstances.'),
    ('audit_log', 'actor_id', 'purge',
     'Rows where SHE acted. The FK does not cascade, so leaving these would make her undeletable.'),
    ('audit_log', 'target_id', 'retain',
     'Kept on purpose (ADR-023): opaque ids only, never personal data (ADR-021). This is the evidence that access to her record was lawful and that the erasure happened, which art. 17(3) permits keeping and which erasing would destroy along with the thing it proves.'),
    ('announcements', null, 'not_personal',
     'Organization-owned operational content. Players cannot author it, and a removed staff author is detached with ON DELETE SET NULL.'),
    ('event_categories', null, 'not_personal',
     'Organization-owned event vocabulary with no participant data.'),
    ('events', null, 'not_personal',
     'Organization-owned schedules. A removed staff author is detached with ON DELETE SET NULL.'),
    ('event_occurrences', null, 'not_personal',
     'Materialized organization schedule instances with no participant data.'),
    ('knowledge_categories', null, 'not_personal',
     'Organization-owned knowledge vocabulary with no participant data.'),
    ('knowledge_articles', 'author_id', 'purge',
     'Participant stories contain her words and first-name attribution. Anonymization and erasure remove the whole story.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.');
$$;

comment on function public.personal_data_disposition is 'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';

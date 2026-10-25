-- The participants list, its search and the conversations read fields (RAPP-662, D7, D9, D12).
--
-- WHY
--
-- Step 3 of 7 (RAPP-660 to RAPP-666). The participants list showed, filtered
-- and sorted on four of her profile's columns, and searched a document the
-- database generated from seven of them. Those columns no longer change: every
-- writer saves answers by field since RAPP-661. The list now reads the fields
-- the feature registry names (D7), shows each column at its field's level (D9),
-- and searches an index of her names and her Normal and Personal text answers,
-- kept up to date on every write (D12). A Sensitive answer is never searchable.
--
-- WHAT CHANGES
--
--   1. `public.participant_search_documents`: one row per profile with two
--      documents, Normal (her names and her Normal text answers) and Personal
--      (those plus her Personal text answers). RLS on and forced with an
--      explicit deny policy, and no client grant: only the definer functions
--      read it.
--      Triggers refresh a profile's row when her names, one of her answers, or
--      the level or type of an answered field change. The text answers are
--      short and long text, country, municipality and list answers, of every
--      season.
--   2. `list_participants` keeps its arguments and its result. Nationality,
--      municipality, entity and dependents come from the registry's fields;
--      each column, filter and sort works only at the field's level for the
--      caller; the search reads the Personal document with
--      participants.view_personal (or a test player with test_players.manage)
--      and the Normal one otherwise.
--   3. `participant_filter_options`: entities and nationalities from the
--      answers, each list only for a caller who reads its field's level.
--   4. `get_conversation_peer` and `list_staff_conversations`: the municipality
--      from its field, at its level.
--   5. `municipality_compatibility_report`: answers of the municipality field
--      that name no municipality of the catalog (after a type change, say).
--   6. The erasure registry lists the search table.
--
-- The generated `profiles.search_document` and its index stay until RAPP-666
-- drops the old storage; nothing reads them any more.
--
-- Docs: https://www.postgresql.org/docs/17/textsearch-tables.html (a
-- tsvector column kept by triggers, GIN indexes),
-- https://www.postgresql.org/docs/17/plpgsql-trigger.html.

-- 1. The search index --------------------------------------------------------------------------------------

create table public.participant_search_documents (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  normal_document tsvector not null,
  personal_document tsvector not null,
  updated_at timestamptz not null default now()
);
comment on table public.participant_search_documents is
  'The participants search (RAPP-662, D12): her names and her Normal and Personal text answers. Sensitive answers are never indexed. Read only by definer functions.';
create index participant_search_documents_org_idx on public.participant_search_documents (org_id);
create index participant_search_documents_normal_idx on public.participant_search_documents using gin (normal_document);
create index participant_search_documents_personal_idx on public.participant_search_documents using gin (personal_document);
alter table public.participant_search_documents enable row level security;
alter table public.participant_search_documents force row level security;
-- An explicit deny, like the other tables only definer functions read.
create policy participant_search_documents_deny_client
  on public.participant_search_documents
  for all
  to public
  using (false)
  with check (false);
revoke all on table public.participant_search_documents from public, anon, authenticated;

-- Her names and her text answers at the given levels, as one text.
create or replace function private.participant_search_text(p_profile_id uuid, p_levels text[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ', p.first_name, p.last_name, (
    select string_agg(private.custom_answer_text(f, a.value), ' ' order by f.sort_order)
      from public.custom_answers a
      join public.profile_fields f on f.id = a.question_id
     where a.profile_id = p.id
       -- Only a stored value: a Sensitive answer is encrypted and never read here.
       and a.value is not null
       and f.privacy = any (p_levels)
       and f.privacy <> 'sensitive'
       and f.question_type in ('short_text', 'long_text', 'country', 'municipality', 'item_list')))
    from public.profiles p
   where p.id = p_profile_id;
$$;
revoke all on function private.participant_search_text(uuid, text[]) from public, anon, authenticated;

-- The document of a text: unaccented and as written, as the old generated
-- column did, so "Maria" finds "María".
create or replace function private.participant_search_vector(p_text text)
returns tsvector
language sql
immutable
set search_path = ''
as $$
  select to_tsvector('simple', public.immutable_unaccent(coalesce(p_text, '')) || ' ' || coalesce(p_text, ''));
$$;
revoke all on function private.participant_search_vector(text) from public, anon, authenticated;

create or replace function private.refresh_participant_search(p_profile_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.participant_search_documents (profile_id, org_id, normal_document, personal_document, updated_at)
  select p.id, p.org_id,
         private.participant_search_vector(private.participant_search_text(p.id, array['normal'])),
         private.participant_search_vector(private.participant_search_text(p.id, array['normal', 'personal'])),
         now()
    from public.profiles p
   where p.id = p_profile_id
  on conflict (profile_id) do update
    set org_id = excluded.org_id,
        normal_document = excluded.normal_document,
        personal_document = excluded.personal_document,
        updated_at = excluded.updated_at;
$$;
revoke all on function private.refresh_participant_search(uuid) from public, anon, authenticated;

create or replace function private.refresh_participant_search_on_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_participant_search(new.id);
  return null;
end;
$$;
revoke all on function private.refresh_participant_search_on_profile() from public, anon, authenticated;

create or replace function private.refresh_participant_search_on_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_participant_search(old.profile_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.profile_id <> old.profile_id) then
    perform private.refresh_participant_search(new.profile_id);
  end if;
  return null;
end;
$$;
revoke all on function private.refresh_participant_search_on_answer() from public, anon, authenticated;

-- A field that changes level or type changes what is searchable of every
-- answer to it (RAPP-665 makes both editable).
create or replace function private.refresh_participant_search_on_field()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_participant_search(a.profile_id)
     from (select distinct profile_id from public.custom_answers where question_id = new.id) a;
  return null;
end;
$$;
revoke all on function private.refresh_participant_search_on_field() from public, anon, authenticated;

create trigger profiles_refresh_participant_search
  after insert or update of first_name, last_name on public.profiles
  for each row execute function private.refresh_participant_search_on_profile();
create trigger custom_answers_refresh_participant_search
  after insert or update or delete on public.custom_answers
  for each row execute function private.refresh_participant_search_on_answer();
create trigger profile_fields_refresh_participant_search
  after update of privacy, question_type on public.profile_fields
  for each row
  when (old.privacy is distinct from new.privacy or old.question_type is distinct from new.question_type)
  execute function private.refresh_participant_search_on_field();

-- Every profile there is today.
do $$
begin
  perform private.refresh_participant_search(p.id) from public.profiles p;
end;
$$;

-- 2. One answer as the list shows it ---------------------------------------------------------------------------

-- Her answer to a field as text (a choice by its option's Catalan label), or
-- nothing when there is no field.
create or replace function private.field_text_now(p_profile_id uuid, p_field public.profile_fields)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_field.id is null then null
              else nullif(btrim(private.custom_answer_text(p_field, private.field_answer_now(p_profile_id, p_field))), '')
         end;
$$;
revoke all on function private.field_text_now(uuid, public.profile_fields) from public, anon, authenticated;

-- Whether a reader with these levels reads a field's level (D9). A field the
-- feature does not find has no level, and reads as nothing.
create or replace function private.level_read(p_privacy text, p_personal boolean, p_sensitive boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_privacy when 'normal' then true when 'personal' then p_personal
                                 when 'sensitive' then p_sensitive end, false);
$$;
revoke all on function private.level_read(text, boolean, boolean) from public, anon, authenticated;

-- 3. The participants list -------------------------------------------------------------------------------------

create or replace function public.list_participants(
  p_query text default '',
  p_entity text default null,
  p_nationality text default null,
  p_status text default 'all',
  p_dependents text default 'all',
  p_sort text default 'last_name',
  p_dir text default 'asc',
  p_page integer default 1,
  p_page_size integer default 25)
returns table (
  id uuid, first_name text, last_name text, nationality text, city text, reference_entity text,
  has_dependents boolean, num_dependents integer, is_active boolean, preferred_language text,
  created_at timestamptz, joined boolean, is_test_account boolean, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with access as (
    select
      (select public.has_permission('participants.view')) as can_view,
      (select public.has_permission('participants.view_personal')) as personal_permission,
      (select public.has_permission('participants.view_sensitive')) as sensitive_permission,
      (select public.has_permission('test_players.manage')) as manages_test_players
  ),
  -- The fields the registry names for the list (D7), once.
  feature as (
    select
      private.feature_field(org.id, 'participants.nationality') as nationality,
      private.feature_field(org.id, 'participants.city') as city,
      private.feature_field(org.id, 'participants.entity') as entity,
      private.feature_field(org.id, 'participants.has_dependents') as dependents,
      private.feature_field(org.id, 'participants.dependents_count') as dependents_count
    from (select public.current_org_id() as id) org
  ),
  candidate as (
    select
      profile.*,
      -- A test player's answers are made up: test_players.manage reads them.
      access.personal_permission or (profile.is_test_account and access.manages_test_players) as personal,
      access.sensitive_permission or (profile.is_test_account and access.manages_test_players) as sensitive
    from public.profiles as profile
    cross join access
    where (access.can_view or (access.manages_test_players and profile.is_test_account))
      and profile.org_id = (select public.current_org_id())
      -- Invited women are listed too, marked as not joined, so staff can
      -- complete their record before the first login (RAPP-300).
      and profile.role in ('player', 'invited')
  ),
  -- Each column only at its field's level for the caller (D9).
  shown as (
    select
      candidate.*,
      case when private.level_read((feature.nationality).privacy, candidate.personal, candidate.sensitive)
        then private.field_text_now(candidate.id, feature.nationality) end as nationality_text,
      case when private.level_read((feature.city).privacy, candidate.personal, candidate.sensitive)
        then private.field_text_now(candidate.id, feature.city) end as city_text,
      case when private.level_read((feature.entity).privacy, candidate.personal, candidate.sensitive)
        then private.field_text_now(candidate.id, feature.entity) end as entity_text,
      case when private.level_read((feature.dependents).privacy, candidate.personal, candidate.sensitive)
        then case private.answer_key(feature.dependents, private.field_answer_now(candidate.id, feature.dependents))
               when 'yes' then true when 'no' then false end end as dependents_answer,
      case when private.level_read((feature.dependents_count).privacy, candidate.personal, candidate.sensitive)
        then coalesce((private.field_answer_now(candidate.id, feature.dependents_count) #>> '{}')::numeric::integer, 0)
      end as dependents_count_answer,
      private.level_read((feature.nationality).privacy, candidate.personal, candidate.sensitive) as reads_nationality,
      private.level_read((feature.entity).privacy, candidate.personal, candidate.sensitive) as reads_entity,
      private.level_read((feature.dependents).privacy, candidate.personal, candidate.sensitive) as reads_dependents
    from candidate
    cross join feature
  ),
  roster as (
    select
      shown.*,
      case
        when p_sort = 'first_name' then shown.first_name
        when p_sort = 'city' then shown.city_text
        when p_sort = 'nationality' then shown.nationality_text
        when p_sort = 'reference_entity' then shown.entity_text
        when p_sort = 'created_at' then to_char(shown.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        else shown.last_name
      end as sort_key
    from shown
    left join public.participant_search_documents as search on search.profile_id = shown.id
    where (
        coalesce(p_query, '') = ''
        -- Her names and Normal text answers for everyone, her Personal ones
        -- with the Personal level; a Sensitive answer is never indexed (D12).
        or (case when shown.personal then search.personal_document else search.normal_document end)
             @@ to_tsquery('simple', p_query)
      )
      -- A filter on a field the caller does not read is left out, as before.
      and (p_entity is null or not shown.reads_entity or shown.entity_text = p_entity)
      and (p_nationality is null or not shown.reads_nationality or shown.nationality_text = p_nationality)
      and (
        p_status = 'all'
        or (p_status = 'invited' and shown.role = 'invited')
        or (p_status in ('active', 'inactive') and shown.role = 'player'
            and shown.is_active = (p_status = 'active'))
      )
      and (p_dependents = 'all' or not shown.reads_dependents
           or shown.dependents_answer = (p_dependents = 'with'))
  )
  select
    roster.id,
    roster.first_name,
    roster.last_name,
    roster.nationality_text,
    roster.city_text,
    roster.entity_text,
    roster.dependents_answer,
    roster.dependents_count_answer,
    roster.is_active,
    roster.preferred_language,
    roster.created_at,
    roster.role = 'player',
    roster.is_test_account,
    count(*) over ()
  from roster
  order by
    case when p_dir = 'desc' then null else roster.sort_key end asc nulls last,
    case when p_dir = 'desc' then roster.sort_key end desc nulls first,
    roster.id
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

create or replace function public.participant_filter_options()
returns table (entities text[], nationalities text[])
language sql
stable
security definer
set search_path = ''
as $$
  with feature as (
    select
      private.feature_field(org.id, 'participants.entity') as entity,
      private.feature_field(org.id, 'participants.nationality') as nationality
    from (select public.current_org_id() as id) org
  ),
  player as (
    select p.id
      from public.profiles as p
     where p.role = 'player'
       and not p.is_test_account
       and p.org_id = (select public.current_org_id())
       and (select public.has_permission('participants.view'))
  )
  select
    case when private.reads_privacy(null, (feature.entity).privacy) then coalesce((
      select array_agg(distinct value order by value)
        from (select private.field_text_now(player.id, feature.entity) as value from player) v
       where value is not null), '{}') else '{}'::text[] end,
    case when private.reads_privacy(null, (feature.nationality).privacy) then coalesce((
      select array_agg(distinct value order by value)
        from (select private.field_text_now(player.id, feature.nationality) as value from player) v
       where value is not null), '{}') else '{}'::text[] end
  from feature;
$$;

-- 4. Conversations -------------------------------------------------------------------------------------------

-- Her municipality for this caller: her own, or at its field's level (D9).
create or replace function private.city_for_reader(p_profile_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  field public.profile_fields;
begin
  field := private.feature_field((select p.org_id from public.profiles p where p.id = p_profile_id), 'participants.city');
  if field.id is null
     or not (p_profile_id = (select auth.uid()) or private.reads_privacy(p_profile_id, field.privacy)) then
    return null;
  end if;
  return private.field_text_now(p_profile_id, field);
end;
$$;
revoke all on function private.city_for_reader(uuid) from public, anon, authenticated;

create or replace function public.get_conversation_peer(p_user_id uuid)
returns table (id uuid, first_name text, last_name text, role text, city text, preferred_language text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    peer.id,
    peer.first_name,
    peer.last_name,
    peer.role,
    private.city_for_reader(peer.id),
    peer.preferred_language
  from public.profiles as peer
  where peer.id = p_user_id
    and peer.org_id = (select public.current_org_id())
    and peer.role in ('player', 'entity')
    and (peer.id = (select auth.uid()) or (select public.has_permission('messages.inbox')));
$$;

create or replace function public.list_staff_conversations(
  p_unread_only boolean default false,
  p_assigned_to_me boolean default false,
  p_participant_role text default 'all',
  p_query text default '')
returns table (
  conversation_id uuid, participant_id uuid, participant_first_name text, participant_last_name text,
  participant_role text, participant_city text, participant_language text, assigned_staff_id uuid,
  assigned_staff_first_name text, assigned_staff_last_name text, unread_count bigint,
  latest_message_at timestamptz, latest_message_preview text, latest_sender_id uuid,
  conversation_created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  search_query tsquery := private.conversation_prefix_tsquery(left(coalesce(p_query, ''), 200));
begin
  if actor is null or not (select public.has_permission('messages.inbox')) then
    raise exception 'only staff may list organization conversations'
      using errcode = 'insufficient_privilege';
  end if;
  if p_participant_role not in ('all', 'player', 'entity') then
    raise exception 'invalid conversation participant filter'
      using errcode = 'check_violation';
  end if;

  return query
  select
    conversation.id,
    participant.id,
    participant.first_name,
    participant.last_name,
    participant.role,
    -- Her municipality at its field's level (RAPP-662, D9).
    private.city_for_reader(participant.id),
    participant.preferred_language,
    conversation.assigned_staff_id,
    assigned.first_name,
    assigned.last_name,
    unread.total,
    latest.created_at,
    left(latest.content, 160),
    latest.sender_id,
    conversation.created_at
  from public.conversations as conversation
  join public.profiles as participant
    on participant.org_id = conversation.org_id
   and participant.id = conversation.user_id
  left join public.profiles as assigned
    on assigned.org_id = conversation.org_id
   and assigned.id = conversation.assigned_staff_id
  left join public.conversation_read_states as read_state
    on read_state.conversation_id = conversation.id
   and read_state.user_id = actor
  left join public.messages as read_message
    on read_message.id = read_state.last_read_message_id
  left join lateral (
    select message.sender_id, message.content, message.created_at
    from public.messages as message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  cross join lateral (
    select count(*)::bigint as total
    from public.messages as message
    where message.conversation_id = conversation.id
      and message.sender_id <> actor
      and (
        read_message.id is null
        or (message.created_at, message.id) > (read_message.created_at, read_message.id)
      )
  ) as unread
  where conversation.org_id = (select public.current_org_id())
    and (not p_unread_only or unread.total > 0)
    and (not p_assigned_to_me or conversation.assigned_staff_id = actor)
    and (p_participant_role = 'all' or participant.role = p_participant_role)
    and (
      search_query is null
      or to_tsvector(
        'simple',
        public.immutable_unaccent(
          concat_ws(' ', participant.first_name, participant.last_name)
        ) || ' ' || concat_ws(' ', participant.first_name, participant.last_name)
      ) @@ search_query
    )
  order by
    (unread.total > 0) desc,
    latest.created_at desc nulls last,
    conversation.created_at desc,
    conversation.id
  limit 200;
end;
$$;

-- 5. Municipality answers outside the catalog ------------------------------------------------------------------

create or replace view public.municipality_compatibility_report as
  select a.value #>> '{}' as legacy_value, count(*) as profile_count
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id and f.system_key = 'city'
    left join public.municipality_catalog municipality on municipality.canonical = a.value #>> '{}'
   where jsonb_typeof(a.value) = 'string'
     and municipality.code is null
   group by a.value #>> '{}';

-- 6. The erasure registry -------------------------------------------------------------------------------------

-- The search index holds her names and answers: it goes with her profile.
create or replace function public.personal_data_disposition()
 returns table(table_name text, participant_column text, disposition text, reason text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('profile_answers', 'profile_id', 'purge', 'Which intake questions were answered, and by whom.'),
    ('intake_question_states', 'profile_id', 'purge', 'Which intake questions staff chose to ask or not ask her.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('season_answers', 'profile_id', 'purge', 'Her registration answers, one row per season.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('builtin_question_overrides', null, 'not_personal', 'Staff wording for the built-in questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_required_questions', null, 'not_personal', 'Which built-in questions staff made required or optional.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Her answers to the questions staff added.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which of Ramassà''s own fields staff chose to ask or not ask her.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;

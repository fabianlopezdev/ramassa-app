-- Organization announcements with multilingual review, scheduling, and pinning.

create or replace function public.is_localized_content_valid(
  content jsonb,
  maximum_length integer,
  require_all_languages boolean default false
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select
    jsonb_typeof(content) = 'object'
    and content ? 'ca'
    and (
      not require_all_languages
      or content ?& array['ca', 'es', 'en', 'ar', 'fa']
    )
    and not exists (
      select 1
      from jsonb_each(content) as entry(language, value)
      where entry.language <> all(array['ca', 'es', 'en', 'ar', 'fa'])
         or jsonb_typeof(entry.value) <> 'string'
         or length(btrim(entry.value #>> '{}')) not between 1 and maximum_length
    );
$$;

create or replace function public.is_content_visible(
  content_status text,
  published_at timestamptz,
  expires_at timestamptz,
  visible_at timestamptz default now()
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select
    content_status = 'published'
    and published_at is not null
    and published_at <= visible_at
    and (expires_at is null or expires_at > visible_at);
$$;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  category text not null default 'info'
    check (category in ('info', 'training', 'social', 'urgent')),
  title jsonb not null,
  body jsonb not null,
  image_url text check (image_url is null or length(btrim(image_url)) > 0),
  image_alt jsonb,
  is_pinned boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid default auth.uid()
    references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_title_valid
    check (public.is_localized_content_valid(title, 200, false)),
  constraint announcements_body_valid
    check (public.is_localized_content_valid(body, 10000, false)),
  constraint announcements_image_alt_valid
    check (
      image_alt is null
      or public.is_localized_content_valid(image_alt, 500, false)
    ),
  constraint announcements_image_alt_required
    check (image_url is null or image_alt is not null),
  constraint announcements_published_at_required
    check (status = 'draft' or published_at is not null),
  constraint announcements_expiry_after_publication
    check (
      expires_at is null
      or (published_at is not null and expires_at > published_at)
    ),
  constraint announcements_published_languages_complete
    check (
      status = 'draft'
      or (
        public.is_localized_content_valid(title, 200, true)
        and public.is_localized_content_valid(body, 10000, true)
        and (
          image_url is null
          or public.is_localized_content_valid(image_alt, 500, true)
        )
      )
    )
);

comment on table public.announcements is 'Organization announcements. Catalan drafts stay private until staff approve all required translations and publish them.';
comment on column public.announcements.image_url is 'The R2 object key returned by the existing presigned upload path.';

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row
  execute function public.set_updated_at();

create index announcements_org_status_pinned_idx
  on public.announcements (org_id, status, is_pinned desc, published_at desc, created_at desc);

create index announcements_visible_idx
  on public.announcements (org_id, is_pinned desc, published_at desc)
  where status = 'published';

create index announcements_org_expires_idx
  on public.announcements (org_id, expires_at)
  where expires_at is not null;

create index announcements_org_created_by_idx
  on public.announcements (org_id, created_by)
  where created_by is not null;

alter table public.announcements enable row level security;
alter table public.announcements force row level security;

create policy announcements_select_org_staff_or_visible_player
  on public.announcements
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and public.is_content_visible(status, published_at, expires_at)
      )
    )
  );

create policy announcements_insert_org_staff
  on public.announcements
  for insert
  to authenticated
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
    and created_by = (select auth.uid())
  );

create policy announcements_update_org_staff
  on public.announcements
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

create policy announcements_delete_org_staff
  on public.announcements
  for delete
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

revoke all on table public.announcements from anon, authenticated;
grant select on table public.announcements to authenticated;
grant insert (category, title, body, image_url, image_alt, is_pinned, status, published_at, expires_at)
  on table public.announcements to authenticated;
grant update (category, title, body, image_url, image_alt, is_pinned, status, published_at, expires_at)
  on table public.announcements to authenticated;
grant delete on table public.announcements to authenticated;

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
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.');
$$;

comment on function public.personal_data_disposition is 'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';

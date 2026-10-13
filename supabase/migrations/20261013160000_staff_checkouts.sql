-- Staff checkout and check-in (RAPP-252, from RAPP-170, part of RAPP-212).
--
-- Material for a normal session is never recorded. A longer loan to a staff
-- member is (a 4-day trip, a tournament): the item, size, quantity, who has
-- it and when it comes back. It leaves stock with a checkout movement. At
-- check-in, the pieces that came back return to stock with a condition grade;
-- unusable ones are written off, and missing ones stay out as lost. A
-- checkout past its return date shows in Today, for the storeroom and for the
-- person who has it.
--
-- Checkouts are run by whoever keeps the storeroom: equipment.receive or
-- equipment.count.

create table public.staff_checkouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_type_id uuid not null references public.equipment_item_types (id) on delete restrict,
  size text check (size is null or length(btrim(size)) between 1 and 20),
  quantity integer not null check (quantity between 1 and 1000),
  checked_out_to uuid references public.profiles (id) on delete set null,
  checked_out_by uuid references public.profiles (id) on delete set null,
  checked_out_at timestamptz not null default now(),
  expected_return_on date not null,
  note text check (note is null or length(btrim(note)) between 1 and 500),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  returned_quantity integer check (returned_quantity is null or returned_quantity >= 0),
  return_condition text check (return_condition is null or return_condition in ('new', 'good', 'worn', 'unusable')),
  created_at timestamptz not null default now(),
  constraint staff_checkouts_checkin_complete check (
    (checked_in_at is null and returned_quantity is null and return_condition is null)
    or (checked_in_at is not null and returned_quantity is not null and returned_quantity <= quantity
        and (returned_quantity = 0 or return_condition is not null))
  )
);

comment on table public.staff_checkouts is 'Material lent to a staff member for longer than a session (RAPP-252).';

create index staff_checkouts_open_idx on public.staff_checkouts (org_id, expected_return_on)
  where checked_in_at is null;

alter table public.stock_movements
  add column checkout_id uuid references public.staff_checkouts (id) on delete restrict;

alter table public.staff_checkouts enable row level security;
alter table public.staff_checkouts force row level security;

-- The storeroom reads every checkout; a staff member reads the ones she has.
create policy staff_checkouts_read on public.staff_checkouts
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.items'))
      or (checked_out_to = (select auth.uid()) and (select public.is_team_member()))
    )
  );

revoke insert, update, delete, truncate on public.staff_checkouts from anon, authenticated;

-- Who can take material out ------------------------------------------------------------------------

create or replace function public.checkout_recipients()
returns table (profile_id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.last_name
  from public.profiles p
  where p.org_id = (select public.current_org_id())
    and p.role in ('staff', 'admin')
    and p.is_active
    and ((select public.has_permission('equipment.receive')) or (select public.has_permission('equipment.count')))
  order by p.first_name, p.last_name, p.id;
$$;

revoke all on function public.checkout_recipients() from public, anon;
grant execute on function public.checkout_recipients() to authenticated;

-- Checking out ------------------------------------------------------------------------------------

create or replace function public.record_staff_checkout(
  p_id uuid,
  p_item_type_id uuid,
  p_size text,
  p_quantity integer,
  p_staff_id uuid,
  p_expected_return_on date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  item_type public.equipment_item_types%rowtype;
  clean_size text := nullif(btrim(p_size), '');
begin
  if not ((select public.has_permission('equipment.receive')) or (select public.has_permission('equipment.count'))) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_checkouts where id = p_id and org_id = actor_org) then
    return p_id;
  end if;

  select * into item_type from public.equipment_item_types
   where id = p_item_type_id and org_id = actor_org and is_active;
  if item_type.id is null then
    raise exception 'STOCK/NO_ITEM_TYPE' using errcode = 'P0002';
  end if;
  if cardinality(item_type.sizes) > 0 then
    if clean_size is null or not clean_size = any (item_type.sizes) then
      raise exception 'STOCK/SIZE_REQUIRED' using errcode = 'check_violation';
    end if;
  else
    clean_size := null;
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_staff_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  ) then
    raise exception 'STOCK/NO_STAFF' using errcode = 'P0002';
  end if;
  if p_expected_return_on < (now() at time zone 'Europe/Madrid')::date then
    raise exception 'STOCK/RETURN_DATE' using errcode = 'check_violation';
  end if;

  insert into public.staff_checkouts (
    id, org_id, item_type_id, size, quantity, checked_out_to, checked_out_by,
    expected_return_on, note
  ) values (
    p_id, actor_org, item_type.id, clean_size, p_quantity, p_staff_id, actor,
    p_expected_return_on, nullif(btrim(p_note), '')
  );

  insert into public.stock_movements (
    org_id, item_type_id, size, quantity, kind, checkout_id, recorded_by
  ) values (
    actor_org, item_type.id, clean_size, -p_quantity, 'checkout', p_id, actor
  );

  return p_id;
end;
$$;

revoke all on function public.record_staff_checkout(uuid, uuid, text, integer, uuid, date, text) from public, anon;
grant execute on function public.record_staff_checkout(uuid, uuid, text, integer, uuid, date, text) to authenticated;

-- Checking in -------------------------------------------------------------------------------------

create or replace function public.record_staff_checkin(
  p_checkout_id uuid,
  p_returned integer,
  p_condition text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  checkout public.staff_checkouts%rowtype;
begin
  if not ((select public.has_permission('equipment.receive')) or (select public.has_permission('equipment.count'))) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into checkout from public.staff_checkouts
   where id = p_checkout_id and org_id = actor_org
   for update;
  if checkout.id is null then
    raise exception 'STOCK/NO_CHECKOUT' using errcode = 'P0002';
  end if;
  if checkout.checked_in_at is not null then
    raise exception 'STOCK/ALREADY_CHECKED_IN' using errcode = 'check_violation';
  end if;
  if p_returned is null or p_returned not between 0 and checkout.quantity then
    raise exception 'STOCK/CHECKIN_QUANTITY' using errcode = 'check_violation';
  end if;
  if p_returned > 0 and (p_condition is null or p_condition not in ('new', 'good', 'worn', 'unusable')) then
    raise exception 'STOCK/CONDITION_REQUIRED' using errcode = 'check_violation';
  end if;

  update public.staff_checkouts
     set checked_in_at = now(), checked_in_by = actor, returned_quantity = p_returned,
         return_condition = case when p_returned > 0 then p_condition end
   where id = checkout.id;

  if p_returned > 0 then
    insert into public.stock_movements (
      org_id, item_type_id, size, quantity, kind, condition, checkout_id, recorded_by
    ) values (
      actor_org, checkout.item_type_id, checkout.size, p_returned, 'checkin', p_condition,
      checkout.id, actor
    );
    -- Unusable pieces come back only to leave stock again.
    if p_condition = 'unusable' then
      insert into public.stock_movements (
        org_id, item_type_id, size, quantity, kind, condition, checkout_id, recorded_by, reason
      ) values (
        actor_org, checkout.item_type_id, checkout.size, -p_returned, 'write_off', 'unusable',
        checkout.id, actor, 'Checked in unusable'
      );
    end if;
  end if;
  -- Pieces that did not come back stay out of stock: the checkout movement
  -- already took them, and returned_quantity shows how many were lost.
end;
$$;

revoke all on function public.record_staff_checkin(uuid, integer, text) from public, anon;
grant execute on function public.record_staff_checkin(uuid, integer, text) to authenticated;

-- Open checkouts, with the name of who has them and whether they are late.
-- Same reach as the read policy: the storeroom sees all, a staff member hers.
create or replace function public.open_staff_checkouts()
returns table (
  checkout_id uuid,
  item_key text,
  size text,
  quantity integer,
  staff_id uuid,
  staff_first_name text,
  staff_last_name text,
  checked_out_at timestamptz,
  expected_return_on date,
  note text,
  is_overdue boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, t.key, c.size, c.quantity, c.checked_out_to, p.first_name, p.last_name,
         c.checked_out_at, c.expected_return_on, c.note,
         c.expected_return_on < (now() at time zone 'Europe/Madrid')::date
  from public.staff_checkouts c
  join public.equipment_item_types t on t.id = c.item_type_id
  left join public.profiles p on p.id = c.checked_out_to
  where c.org_id = (select public.current_org_id())
    and c.checked_in_at is null
    and (
      (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.items'))
      or (c.checked_out_to = (select auth.uid()) and (select public.is_team_member()))
    )
  order by c.expected_return_on, c.checked_out_at;
$$;

revoke all on function public.open_staff_checkouts() from public, anon;
grant execute on function public.open_staff_checkouts() to authenticated;

-- The erasure registry learns staff_checkouts (RAPP-26).

CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
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
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

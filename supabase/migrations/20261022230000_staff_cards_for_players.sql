-- Players see the team's first name and photo next to their messages, forum
-- posts and articles (RAPP-639).
--
-- WHY
--
-- A player cannot read a team member's `profiles` row (the row policy shows
-- her own row only), so the player app labels a staff reply with the
-- conversation title and shows no photo anywhere. Messages, forum posts,
-- replies and articles already carry the author's id (`sender_id`,
-- `author_id`, `created_by`), so the app only needs a way to turn a handful of
-- ids into a name and a photo.
--
-- WHAT THIS MIGRATION DOES
--
--   1. public.get_staff_cards(ids): for each id that is a team member (staff
--      or admin) of the caller's own organization, her id, first name and
--      photo key. Nothing for any other id: another organization's staff, a
--      player, an entity contact, an erased account, or an unknown id all
--      return no row, so the function reveals nothing about anyone but the
--      team, and about the team only those two columns.
--   2. public.can_read_profile_photo_object(key): the media worker's check for
--      a `profile-photos` object. Until now the worker served any object
--      under the caller's organization, so any member could read any profile
--      photo whose key she learned. Now: the team (as before), her own
--      uploads and her own current photo, and the CURRENT photo of a team
--      member of her organization. A player reads no other player's photo.
--
-- One SECURITY DEFINER function is smaller and safer than adding name and
-- photo columns to the message, forum and article reads: those reads are
-- direct table selects under row policies, so a new column would need a
-- denormalized copy on every row (kept in sync by triggers) or a view per
-- table. The function is one reviewed boundary that returns two columns, and
-- the app asks it once per screen for the distinct author ids.
--
-- Docs: https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker
-- ("set search_path = ''" for a security definer function).

create function public.get_staff_cards(p_profile_ids uuid[])
returns table (id uuid, first_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select staff.id, staff.first_name, staff.avatar_url
    from public.profiles as staff
   where staff.id = any (p_profile_ids)
     and staff.org_id = (select public.current_org_id())
     and staff.role in ('staff', 'admin')
     and staff.anonymized_at is null
   order by staff.id
   limit 200;
$$;

comment on function public.get_staff_cards(uuid[]) is
  'First name and photo key of the team members of the caller''s organization among the given ids; nothing for anyone else (RAPP-639).';

revoke all on function public.get_staff_cards(uuid[]) from public, anon;
grant execute on function public.get_staff_cards(uuid[]) to authenticated;

create function public.can_read_profile_photo_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.current_org_id()) is not null
    and split_part(p_object_key, '/', 1) = (select public.current_org_id())::text
    and split_part(p_object_key, '/', 2) = 'profile-photos'
    and (
      -- The team keeps reading every profile photo of its organization.
      (select public.is_team_member())
      -- Her own uploads: the worker writes the uploader's id into the key.
      or split_part(p_object_key, '/', 3) = (select auth.uid())::text
      -- Her own current photo, also when a team member took it for her.
      or exists (
        select 1 from public.profiles as own
         where own.id = (select auth.uid())
           and own.avatar_url = p_object_key
      )
      -- A team member's current photo, shown beside her messages (RAPP-639).
      or exists (
        select 1 from public.profiles as staff
         where staff.org_id = (select public.current_org_id())
           and staff.role in ('staff', 'admin')
           and staff.anonymized_at is null
           and staff.avatar_url = p_object_key
      )
    ),
    false
  );
$$;

comment on function public.can_read_profile_photo_object(text) is
  'True when the caller may read this profile photo: the team, its uploader, its owner, or any member of the organization for a team member''s current photo (RAPP-639).';

revoke all on function public.can_read_profile_photo_object(text) from public, anon;
grant execute on function public.can_read_profile_photo_object(text) to authenticated;

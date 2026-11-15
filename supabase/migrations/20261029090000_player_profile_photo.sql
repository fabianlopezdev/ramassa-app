-- Optional self-service profile photos (RAPP-731).
-- https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

create function public.set_own_profile_photo(p_profile_id uuid, p_object_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  organization uuid := (select public.current_org_id());
begin
  if caller is null or caller is distinct from p_profile_id or organization is null or not exists (
    select 1 from public.profiles
    where id = caller and org_id = organization and anonymized_at is null
      and role in ('player', 'invited') and is_active
  ) then
    raise insufficient_privilege using message = 'A player can change only her own photo';
  end if;
  if p_object_key is not null and p_object_key !~ (
    '^' || organization::text || '/profile-photos/' || caller::text
    || '/[0-9]{4}/[0-9]{2}/[0-9a-f]{32}\.(jpg|png|webp)$'
  ) then
    raise invalid_parameter_value using message = 'The photo must be an image uploaded by this player';
  end if;
  update public.profiles set avatar_url = p_object_key, updated_at = now()
  where id = caller and org_id = organization;
end;
$$;
revoke all on function public.set_own_profile_photo(uuid, text) from public, anon;
grant execute on function public.set_own_profile_photo(uuid, text) to authenticated;

-- Only the public invoker below is exposed through the API. It narrows the
-- requested ids using the existing row policies BEFORE reading these columns.
create function private.person_cards(p_profile_ids uuid[])
returns table (id uuid, first_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.avatar_url from public.profiles p
  where p.id = any(p_profile_ids) and p.org_id = (select public.current_org_id())
    and p.anonymized_at is null and p.role in ('player', 'invited', 'staff', 'admin')
  order by p.id limit 200;
$$;
revoke all on function private.person_cards(uuid[]) from public, anon;
grant execute on function private.person_cards(uuid[]) to authenticated;

create function public.get_person_cards(p_profile_ids uuid[])
returns table (id uuid, first_name text, avatar_url text)
language sql stable security invoker set search_path = '' as $$
  with requested as (
    select distinct unnest(p_profile_ids) as id limit 200
  ), visible as (
    select p.id from public.profiles p join requested r on r.id = p.id
    union
    select f.author_id from public.forum_posts f join requested r on r.id = f.author_id
      where f.visibility = 'visible'
    union
    select f.author_id from public.forum_replies f join requested r on r.id = f.author_id
      where f.visibility = 'visible'
    union
    select m.sender_id from public.messages m join requested r on r.id = m.sender_id
  )
  select * from private.person_cards(array(select id from visible))
  union
  select * from public.get_staff_cards(array(select id from requested));
$$;
revoke all on function public.get_person_cards(uuid[]) from public, anon;
grant execute on function public.get_person_cards(uuid[]) to authenticated;

-- Preserve existing access to team photos, including photos uploaded by a colleague.
create function private.is_current_team_photo(p_object_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.org_id = (select public.current_org_id())
      and p.role in ('staff', 'admin') and p.anonymized_at is null
      and p.avatar_url = p_object_key
  );
$$;
revoke all on function private.is_current_team_photo(text) from public, anon;
grant execute on function private.is_current_team_photo(text) to authenticated;

-- The worker calls this as the signed-in reader. RLS in get_person_cards
-- ensures a photo follows the same visibility as the interaction showing it.
create or replace function public.can_read_profile_photo_object(p_object_key text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select public.current_org_id()) is not null
    and split_part(p_object_key, '/', 1) = (select public.current_org_id())::text
    and split_part(p_object_key, '/', 2) = 'profile-photos'
    and (
      (select public.is_team_member())
      or private.is_current_team_photo(p_object_key)
      or split_part(p_object_key, '/', 3) = (select auth.uid())::text
      or exists (
        select 1 from public.profiles own
        where own.id = (select auth.uid()) and own.avatar_url = p_object_key
      )
      or exists (
        select 1 from public.get_person_cards(array[
          case when split_part(p_object_key, '/', 3) ~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(p_object_key, '/', 3)::uuid else null end
        ]) card where card.avatar_url = p_object_key
      )
    ), false
  );
$$;
revoke all on function public.can_read_profile_photo_object(text) from public, anon;
grant execute on function public.can_read_profile_photo_object(text) to authenticated;

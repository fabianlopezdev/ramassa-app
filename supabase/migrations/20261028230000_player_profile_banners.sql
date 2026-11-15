-- RAPP-729: an organization default and optional player overrides.
create table private.player_profile_banners (
  org_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  object_key text not null,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (org_id, profile_id)
);
create index player_profile_banners_profile_idx on private.player_profile_banners (profile_id)
  where profile_id is not null;
alter table private.player_profile_banners enable row level security;
revoke all on private.player_profile_banners from public, anon, authenticated;

create function public.get_player_profile_banner(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor_org uuid := (select public.current_org_id());
  image_key text;
begin
  if not coalesce(private.participant_permission(p_profile_id, 'participants.view'), false)
    or not exists (select 1 from public.profiles p where p.id = p_profile_id
      and p.org_id = actor_org and p.role in ('player', 'invited') and p.anonymized_at is null)
  then raise insufficient_privilege; end if;
  select b.object_key into image_key from private.player_profile_banners b
    where b.org_id = actor_org and (b.profile_id = p_profile_id or b.profile_id is null)
    order by b.profile_id nulls last limit 1;
  return jsonb_build_object(
    'objectKey', image_key,
    'canEdit', coalesce(private.participant_permission(p_profile_id, 'participants.view_personal'), false),
    'canApplyAll', coalesce(public.has_permission('settings.branding'), false)
  );
end;
$$;

create function public.set_player_profile_banner(p_profile_id uuid, p_object_key text, p_all_players boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_org uuid := (select public.current_org_id());
  target_profile uuid;
begin
  if not coalesce(private.participant_permission(p_profile_id, 'participants.view_personal'), false)
    or not exists (select 1 from public.profiles p where p.id = p_profile_id
      and p.org_id = actor_org and p.role in ('player', 'invited') and p.anonymized_at is null)
  then raise insufficient_privilege; end if;
  if p_all_players is null then raise check_violation; end if;
  if p_all_players and not coalesce(public.has_permission('settings.branding'), false)
  then raise insufficient_privilege; end if;
  -- Only an image uploaded by this actor to the dedicated tenant folder.
  if p_object_key is null or p_object_key !~ (
    '^' || actor_org::text || '/profile-banners/' || auth.uid()::text ||
    '/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\.(jpg|png|webp)$'
  ) then raise check_violation using message = 'Invalid banner object'; end if;
  -- Serialize both scopes so an all-player replacement cannot race an override.
  perform 1 from public.organizations where id = actor_org for update;
  -- Match erasure's row lock before attaching the image.
  perform 1 from public.profiles where id = p_profile_id and anonymized_at is null for update;
  if not found then raise insufficient_privilege; end if;
  if p_all_players then
    delete from private.player_profile_banners where org_id = actor_org;
    target_profile := null;
  else
    target_profile := p_profile_id;
  end if;
  insert into private.player_profile_banners (org_id, profile_id, object_key)
    values (actor_org, target_profile, p_object_key)
    on conflict (org_id, profile_id) do update
    set object_key = excluded.object_key, updated_at = now();
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (actor_org, auth.uid(), 'profile.banner_updated',
      case when p_all_players then 'organization' else 'profile' end,
      coalesce(target_profile, actor_org), jsonb_build_object('all_players', p_all_players));
  return public.get_player_profile_banner(p_profile_id);
end;
$$;

create function private.erase_player_profile_banner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from private.player_profile_banners where profile_id = new.id;
  return new;
end;
$$;
create trigger erase_player_profile_banner
after update of anonymized_at on public.profiles
for each row when (new.anonymized_at is not null)
execute function private.erase_player_profile_banner();

revoke all on function private.erase_player_profile_banner() from public, anon, authenticated;
revoke all on function public.get_player_profile_banner(uuid) from public, anon;
revoke all on function public.set_player_profile_banner(uuid, text, boolean) from public, anon;
grant execute on function public.get_player_profile_banner(uuid) to authenticated;
grant execute on function public.set_player_profile_banner(uuid, text, boolean) to authenticated;

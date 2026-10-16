-- Gallery moderation (RAPP-381).
--
-- A `gallery.moderate` holder can hide any gallery photo or video, also one
-- nobody reported, and show a hidden one again. Reported items already go
-- through `moderate_forum_target`, which can hide but cannot bring back an item
-- hidden for good. This function does both, closes the item's open reports the
-- way moderating them would (hiding acts on them, showing again dismisses
-- them), and records who did it in the audit log. Removing an item stays with
-- the media Worker, which deletes its files too.

create or replace function public.set_media_item_moderation(
  p_media_item_id uuid,
  p_state text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
begin
  if actor_org is null or not (select public.has_permission('gallery.moderate')) then
    raise exception 'only a gallery moderator can hide or show gallery items'
      using errcode = '42501';
  end if;
  if p_state not in ('visible', 'hidden') then
    raise exception 'unknown gallery moderation state %', p_state using errcode = '22023';
  end if;

  perform 1 from public.media_items
  where org_id = actor_org and id = p_media_item_id
  for update;
  if not found then
    raise exception 'gallery item not found' using errcode = 'P0002';
  end if;

  update public.forum_flags
  set state = case when p_state = 'hidden' then 'actioned' else 'dismissed' end,
    reviewed_at = now(),
    reviewed_by = actor
  where org_id = actor_org and state = 'pending' and media_id = p_media_item_id;

  update public.media_items
  set moderation_state = p_state, flag_count = 0
  where org_id = actor_org and id = p_media_item_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
  values (
    actor_org,
    actor,
    case when p_state = 'hidden' then 'gallery.hide' else 'gallery.show' end,
    'media_item',
    p_media_item_id
  );
end;
$$;

revoke all on function public.set_media_item_moderation(uuid, text) from public, anon;
grant execute on function public.set_media_item_moderation(uuid, text) to authenticated;

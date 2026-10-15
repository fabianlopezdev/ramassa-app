-- Narrow who may write gallery items directly (RAPP-388).
--
-- `authenticated` held UPDATE on every column of `media_items`, and the update
-- policy let forum and gallery moderators write any row of their organization.
-- So a moderator could change an item's file, thumbnail, uploader or consent
-- with a direct write that no audit row records.
--
-- Every app write goes through a function. All of them are SECURITY DEFINER
-- except `moderate_forum_target`, which runs as the caller and sets only
-- `moderation_state` and `flag_count` on a reported item (with `select ... for
-- update` first, which needs an UPDATE privilege). So the direct grant keeps
-- those two columns only, and the policy only gallery moderators, whom that
-- function already requires for gallery items.

revoke update on public.media_items from authenticated;
grant update (moderation_state, flag_count) on public.media_items to authenticated;

drop policy media_items_update_staff_moderation on public.media_items;
create policy media_items_update_gallery_moderation
  on public.media_items
  for update
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.has_permission('gallery.moderate'))
  )
  with check (
    org_id = (select public.current_org_id())
    and (select public.has_permission('gallery.moderate'))
  );

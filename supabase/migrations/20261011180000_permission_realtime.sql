-- Permission changes reach open sessions at once (RAPP-237, part of RAPP-211).
--
-- Every permission write goes through private.write_member_permissions, which
-- upserts the person's single row in team_member_access with a new updated_at.
-- Publishing that table lets each app listen to its own person's row (row
-- security lets her read it) and reload her permissions, so menus and screens
-- update without a sign-out. The permission rows themselves are not published:
-- a removed permission is a DELETE, and Realtime cannot filter deletes, so it
-- would announce one person's changes to everyone subscribed.

alter publication supabase_realtime add table public.team_member_access;

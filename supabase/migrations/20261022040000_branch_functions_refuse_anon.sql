-- The functions this branch changed are not open to the anonymous role
-- (RAPP-618).
--
-- A function created in public is executable by PUBLIC and anon by default.
-- Each of these four already refuses a caller without an account inside (its
-- first check needs a permission or a session); the grant goes too, so the
-- API never reaches them without one. The media Worker calls
-- `can_read_media_object` with the viewer's own token, so it keeps working.

revoke execute on function public.create_participant_invite(jsonb) from public, anon;
grant execute on function public.create_participant_invite(jsonb) to authenticated;

revoke execute on function public.update_participant_profile(uuid, jsonb) from public, anon;
grant execute on function public.update_participant_profile(uuid, jsonb) to authenticated;

revoke execute on function public.delete_participant_permanently(uuid) from public, anon;
grant execute on function public.delete_participant_permanently(uuid) to authenticated;

revoke execute on function public.can_read_media_object(text) from public, anon;
grant execute on function public.can_read_media_object(text) to authenticated;

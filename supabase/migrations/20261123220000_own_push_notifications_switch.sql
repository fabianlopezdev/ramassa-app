-- Her own notifications switch (RAPP-956).
--
-- `profiles.push_notifications_enabled` has existed since the push pipeline
-- (RAPP-36), and every send already leaves out a profile that has it off: the
-- avisos and activitats, the messages from l'equip tècnic, the notifications the
-- team writes, mentoring, forms, and the team's own forum and referral pushes.
-- What was missing is a way for her to change it: the only update policy on
-- `profiles` is the team's, so the column grant alone never let her write it.
--
-- This function is that way. It changes only the caller's own row and only this
-- one column, so it needs no new policy and no new table.

create function public.set_own_push_notifications(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  saved boolean;
begin
  if p_enabled is null then
    raise invalid_parameter_value using message = 'The notifications switch is on or off';
  end if;
  update public.profiles
  set push_notifications_enabled = p_enabled, updated_at = now()
  where id = caller and anonymized_at is null
  returning push_notifications_enabled into saved;
  if saved is null then
    raise insufficient_privilege using message = 'Only a signed-in person can change her own notifications';
  end if;
  return saved;
end;
$$;

comment on function public.set_own_push_notifications(boolean) is
  'Turns the caller''s own notifications on or off on every device (RAPP-956). Every push fan-out leaves out a profile with push_notifications_enabled off.';

revoke all on function public.set_own_push_notifications(boolean) from public, anon;
grant execute on function public.set_own_push_notifications(boolean) to authenticated;


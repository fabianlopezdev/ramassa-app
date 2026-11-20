-- "Ara no" puts a form off for later (RAPP-833).
--
-- Until now "Ara no" on an optional form closed the ask for good
-- (`dismiss_custom_form`): she could not find the form again and the team saw
-- it as discarded, although the words say "not now". From here on it puts the
-- form off: the ask stays pending and answerable, her phone lists it apart
-- from Per fer, and discarding it is a separate step she confirms.

alter table public.custom_form_responses
  add column put_off_at timestamptz;

comment on column public.custom_form_responses.put_off_at is
  'When she put the form off with "Ara no" (RAPP-833). The ask stays pending; null means it still waits in Per fer.';

-- The same rules as discarding: her own open ask, of an optional form that is
-- not a legal one (RAPP-771).
create function public.put_off_custom_form(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  response public.custom_form_responses;
begin
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is put off by the player it asks';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if exists (select 1 from public.custom_forms f where f.id = response.form_id and f.kind = 'legal') then
    raise check_violation using message = 'a legal form cannot be put off';
  end if;
  if not exists (select 1 from private.custom_form_live_version(response.form_id) v
                  where v.content ->> 'mandatory' = 'optional') then
    raise check_violation using message = 'only an optional form can be put off';
  end if;
  update public.custom_form_responses set put_off_at = coalesce(put_off_at, now())
   where id = response.id;
end;
$$;

comment on function public.put_off_custom_form(uuid) is
  'Puts her own open ask of an optional form off for later (RAPP-833). It stays pending and answerable.';

-- Her open asks that she put off. `my_custom_forms` still returns every open
-- ask, so a build from before this change keeps showing them on Home.
create function public.my_put_off_custom_forms()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id), '{}'::uuid[])
    from public.custom_form_responses r
   where r.profile_id = (select auth.uid())
     and r.status = 'pending'
     and r.put_off_at is not null;
$$;

comment on function public.my_put_off_custom_forms() is
  'The ids of her open form asks that she put off for later (RAPP-833).';

revoke all on function public.put_off_custom_form(uuid) from public, anon;
revoke all on function public.my_put_off_custom_forms() from public, anon;
grant execute on function public.put_off_custom_form(uuid) to authenticated;
grant execute on function public.my_put_off_custom_forms() to authenticated;

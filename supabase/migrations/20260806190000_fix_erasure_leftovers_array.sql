-- Keep the erasure post-check accumulator explicitly typed. The original
-- untyped '{}' literal is text to the PL/pgSQL linter even though PostgreSQL
-- can coerce it at runtime, which hides genuine type regressions in db lint.

create or replace function public.delete_participant_permanently(participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_email text;
  entry record;
  remaining bigint;
  leftovers text[] := array[]::text[];
begin
  if not (select public.is_admin()) then
    raise exception 'erasing a participant is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  select p.role into subject_role
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'DELETION_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  if subject_role <> 'player' then
    raise exception 'DELETION_NOT_A_PARTICIPANT: only a participant record can be erased here'
      using errcode = 'raise_exception';
  end if;

  if participant_id = actor then
    raise exception 'DELETION_SELF: an admin cannot erase her own account through this path'
      using errcode = 'raise_exception';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'profile.media_purged'
      and target_id = participant_id
      and actor_id = actor
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'DELETION_MEDIA_NOT_PURGED: her uploaded media must be removed before the record'
      using errcode = 'raise_exception';
  end if;

  select u.email into subject_email from auth.users u where u.id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.delete',
    'profile',
    participant_id,
    jsonb_build_object('erased', true)
  );

  delete from public.invites
   where accepted_by = participant_id
      or (subject_email is not null and email = subject_email);

  delete from public.audit_log where actor_id = participant_id;

  delete from auth.users where id = participant_id;

  for entry in
    select d.table_name, d.participant_column
    from public.personal_data_disposition() d
    where d.disposition = 'purge'
  loop
    execute format(
      'select count(*) from public.%I where %I = $1',
      entry.table_name, entry.participant_column
    ) into remaining using participant_id;
    if remaining > 0 then
      leftovers := leftovers || format('%s.%s', entry.table_name, entry.participant_column);
    end if;
  end loop;

  if array_length(leftovers, 1) > 0 then
    raise exception 'DELETION_INCOMPLETE: rows survived in %', array_to_string(leftovers, ', ')
      using errcode = 'raise_exception';
  end if;
end;
$$;

comment on function public.delete_participant_permanently is 'Erases a participant: every row registered for purge, her authentication identity, and the invitation carrying her address. Admin only, same organization only, and refused unless her R2 media was already swept and receipted. Audited before it runs; the audit trail of opaque ids survives (ADR-023). Verifies its own completeness from the registry and raises DELETION_INCOMPLETE rather than finishing partially.';

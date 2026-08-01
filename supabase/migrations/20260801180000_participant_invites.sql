-- Inviting a participant who DOES have an email, and carrying the referring
-- entity into the wizard she lands in (RAPP-25).
--
-- WHY THE INVITE IS BOUND TO AN ADDRESS AND NOT TO A LINK TOKEN
--
-- The obvious shape is a secret token in a URL: staff share the link, the app
-- reads the token, the wizard pre-fills from it. It does not survive the
-- journey. She opens the link, asks for a magic link, leaves for her inbox, and
-- comes back through a DIFFERENT URL in a different browser context. The token
-- then has to be parked client-side across that gap and re-attached afterwards,
-- and every step is a place to lose it. A bearer token in a URL is also a thing
-- that gets forwarded to a group chat.
--
-- Binding the invite to the ADDRESS removes all of that. It is looked up by the
-- email of whoever actually signed in, so the prefill cannot reach anyone else
-- even if the link is forwarded, there is no secret to leak, and it survives
-- any number of trips to the inbox. The "invite link" staff sends is then just
-- the app's own address, which is one less thing to get wrong.
--
-- The entity is a DEFAULT in her wizard, never a fact recorded about her: she
-- sees it, and she can change it. An invite is what the team believes; the
-- profile is what she says.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  -- Stored lowercased and trimmed, the way `loginEmailSchema` normalizes it, so
  -- an invite typed with a capital letter still matches the identity that
  -- signs in. Supabase treats addresses case-insensitively; this keeps the
  -- invite, the login and the identity in agreement.
  email text not null,
  reference_entity text,
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint invites_email_is_an_address check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.invites is 'A staff invitation for a participant who has an email (RAPP-25). Bound to the ADDRESS rather than to a link token, so the referring-entity prefill reaches the identity that signs in and nobody else, and survives the trip to her inbox.';

-- The wizard's lookup: one pending invite for one address. Partial, because the
-- only rows it ever reads are the unspent ones.
create index invites_pending_email_idx
  on public.invites (email)
  where accepted_at is null;

create index invites_org_created_at_idx on public.invites (org_id, created_at desc);
create index invites_invited_by_idx on public.invites (invited_by);
create index invites_accepted_by_idx on public.invites (accepted_by);

alter table public.invites enable row level security;

-- Staff see what their own organization has sent. A participant must not be
-- able to enumerate who has been invited (that is a list of people who are
-- about to be in the programme), and neither must an entity contact, however
-- legitimately interested she is in her own referrals.
create policy invites_select_org_staff
  on public.invites
  for select
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

-- Deliberately no INSERT, UPDATE or DELETE policy: creating goes through the
-- RPC below (which audits and rate-limits), and spending happens inside
-- `complete_onboarding`. A row nobody can write by hand is a row that cannot
-- be created without its audit entry.

-- Sending an invite ----------------------------------------------------------------

create or replace function public.create_participant_invite(payload jsonb)
returns table (invite_id uuid, email text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  email_value text := lower(btrim(payload ->> 'email'));
  reference_entity_value text := nullif(btrim(payload ->> 'reference_entity'), '');
  new_invite_id uuid;
  invite_expires_at timestamptz := now() + interval '30 days';
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'inviting a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  -- The same shape the CHECK constraint enforces, raised here as a clean error
  -- rather than as a constraint violation, because this one is shown to a staff
  -- member who mistyped an address.
  if email_value is null or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'create_participant_invite requires a valid email address'
      using errcode = 'invalid_parameter_value';
  end if;

  perform public.assert_within_hourly_limit('invite.create', 30);

  actor_org := (select public.current_org_id());

  insert into public.invites (org_id, email, reference_entity, invited_by, expires_at)
  values (actor_org, email_value, reference_entity_value, actor, invite_expires_at)
  returning id into new_invite_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'invite.create',
    'invite',
    new_invite_id,
    -- The referring entity is programme data, not personal data, so it is
    -- recorded. The invited ADDRESS is not: the audit trail says who invited
    -- and when, and the invite row itself holds who was invited.
    jsonb_build_object('reference_entity', reference_entity_value)
  );

  return query select new_invite_id, email_value, invite_expires_at;
end;
$$;

comment on function public.create_participant_invite is 'Records an invitation for a participant who has an email, with an optional referring-entity prefill her wizard will show. Staff only, audited, rate-limited, valid for 30 days.';

-- Reading your own invite ------------------------------------------------------------

-- Keyed on the caller's own address, taken from the verified JWT rather than
-- from an argument: there is nothing to pass, and therefore nothing to pass
-- that would widen it to somebody else's invite. Expired and spent invites are
-- invisible, so a stale link cannot quietly attach an entity to a woman a year
-- later.
create or replace function public.my_pending_invite()
returns table (reference_entity text, invited_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select i.reference_entity, i.created_at
  from public.invites i
  where i.email = lower(btrim(coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
         ''
       )))
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;
$$;

comment on function public.my_pending_invite is 'The pending invitation for the signed-in address, if any: what the onboarding wizard pre-fills its referring-entity field with. Takes no argument, so there is nothing to pass that could widen it to another address.';

-- Spending it ---------------------------------------------------------------------------

-- Onboarding completion is what spends an invite. Doing it in a trigger rather
-- than inside `complete_onboarding` keeps the two independent: the invite
-- feature can be changed without touching the wizard's RPC, and a profile
-- created by any other path (the staff account-creation RPC, a future import)
-- still clears a pending invite for the same address rather than leaving one
-- live behind it.
create or replace function public.spend_pending_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
  select u.email into owner_email from auth.users u where u.id = new.id;
  if owner_email is null then
    return new;
  end if;

  update public.invites
     set accepted_at = now(), accepted_by = new.id
   where email = lower(owner_email)
     and accepted_at is null;

  return new;
end;
$$;

comment on function public.spend_pending_invite is 'Marks any pending invitation for a new profile owner address as accepted, so a forwarded link cannot stay live behind her.';

create trigger profiles_spend_pending_invite
  after insert on public.profiles
  for each row
  execute function public.spend_pending_invite();

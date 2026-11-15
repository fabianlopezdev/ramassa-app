-- RAPP-703: the Onboarding board with chained forms (forms design §9).
--
-- WHY
--
-- Fabián, 2026-10-27: the Onboarding board shows, after Onboarding's own
-- screens and the app terms, the forms a new player goes through right after
-- her Onboarding, in an order the team sets. The season authorization is one
-- of them by default. A form taken out of the chain keeps applying by its own
-- rules (who it is for, when it must be answered, its Home card and its gate).
--
-- WHAT THIS MIGRATION DOES
--
--   1. `public.onboarding_form_chains`: per organization, the chained forms
--      in order, each `authorization` or `custom:<custom_forms.id>`. Every
--      organization starts with the authorization, a new one too. Saving the
--      chain is a live edit, like Onboarding's own screen order
--      (`save_intake_flow_order`).
--   2. `profiles.onboarding_chain_done_at`: when she finished the walk
--      through the chain. Players who finished Onboarding before today are
--      done, so the chain only reaches new players.
--   3. Her phone reads her chain (`my_onboarding_chain`, empty once done) and
--      ends it (`finish_onboarding_chain`). Older builds never call either,
--      so they keep the gates as they were.

-- 1. The chain ----------------------------------------------------------------------------------------

create table public.onboarding_form_chains (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  -- `authorization` or `custom:<custom_forms.id>`, in the order she walks them.
  form_refs text[] not null default array['authorization']::text[]
    check (cardinality(form_refs) <= 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
comment on table public.onboarding_form_chains is
  'The forms a new player goes through right after her Onboarding, in order (RAPP-703).';

alter table public.onboarding_form_chains enable row level security;
create policy onboarding_form_chains_select_org on public.onboarding_form_chains
  for select to authenticated using (org_id = (select public.current_org_id()));
revoke insert, update, delete, truncate on public.onboarding_form_chains from anon, authenticated;
grant select on public.onboarding_form_chains to authenticated;

insert into public.onboarding_form_chains (org_id)
select id from public.organizations
on conflict (org_id) do nothing;

-- A new organization starts with the authorization chained.
create or replace function private.seed_onboarding_form_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.onboarding_form_chains (org_id) values (new.id)
  on conflict (org_id) do nothing;
  return null;
end;
$$;
revoke all on function private.seed_onboarding_form_chain() from public, anon, authenticated;

create trigger organizations_seed_onboarding_form_chain
  after insert on public.organizations
  for each row execute function private.seed_onboarding_form_chain();

create or replace function public.save_onboarding_form_chain(p_refs text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  refs text[] := coalesce(p_refs, array[]::text[]);
begin
  if cardinality(refs) > 50 then
    raise check_violation using message = 'too many chained forms';
  end if;
  if (select count(distinct ref) from unnest(refs) ref) <> cardinality(refs) then
    raise check_violation using message = 'each form is chained once';
  end if;
  if exists (
    select 1 from unnest(refs) ref
     where ref <> 'authorization'
       and not (ref ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                and exists (select 1 from public.custom_forms f
                             where f.id = substr(ref, 8)::uuid and f.org_id = actor_org
                               and f.filled_by = 'player' and not f.is_archived
                               and f.published_at is not null))) then
    raise check_violation using message = 'not a published form of this organization';
  end if;

  insert into public.onboarding_form_chains (org_id, form_refs, updated_at, updated_by)
  values (actor_org, refs, now(), (select auth.uid()))
  on conflict (org_id) do update
    set form_refs = excluded.form_refs, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'onboarding.form_chain', 'organization', actor_org,
          jsonb_build_object('form_refs', to_jsonb(refs)));
end;
$$;
revoke all on function public.save_onboarding_form_chain(text[]) from public, anon;
grant execute on function public.save_onboarding_form_chain(text[]) to authenticated;

-- 2. Her walk through it ------------------------------------------------------------------------------

-- Every row existing now is done (stored once, no rewrite); new rows start
-- empty. A profile still in her Onboarding starts empty too.
alter table public.profiles add column onboarding_chain_done_at timestamptz default now();
alter table public.profiles alter column onboarding_chain_done_at drop default;
update public.profiles set onboarding_chain_done_at = null where terms_accepted_at is null;
comment on column public.profiles.onboarding_chain_done_at is
  'When she finished the forms chained after her Onboarding (RAPP-703); null while they are ahead of her.';

-- Her chain while it is ahead of her: a player who finished Onboarding and
-- not the chain. Her phone walks the ones that apply to her (a pending ask, an
-- authorization to sign) in this order.
create or replace function public.my_onboarding_chain()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             when p.role = 'player' and p.terms_accepted_at is not null
                  and p.onboarding_chain_done_at is null
             then coalesce(c.form_refs, array['authorization']::text[])
             else array[]::text[]
           end
      from public.profiles p
      left join public.onboarding_form_chains c on c.org_id = p.org_id
     where p.id = (select auth.uid())
  ), array[]::text[]);
$$;
revoke all on function public.my_onboarding_chain() from public, anon;
grant execute on function public.my_onboarding_chain() to authenticated;

create or replace function public.finish_onboarding_chain()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set onboarding_chain_done_at = now()
   where id = (select auth.uid()) and onboarding_chain_done_at is null;
$$;
revoke all on function public.finish_onboarding_chain() from public, anon;
grant execute on function public.finish_onboarding_chain() to authenticated;

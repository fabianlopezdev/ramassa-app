-- RAPP-691 follow-up: the standing rule wants an explicit policy on every public
-- table. A walk-in's pending block signatures are read by the team that reviews
-- walk-ins (participants.invite, as walk_in_signings), and only by its functions
-- otherwise: no grant is added, so the policy states the rule without widening it.

create policy walk_in_form_signatures_select_team on public.walk_in_form_signatures
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.has_permission('participants.invite'))
  );

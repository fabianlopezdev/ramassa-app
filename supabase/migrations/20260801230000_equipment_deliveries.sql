-- What the team handed a participant, when, and who handed it over (RAPP-27).
--
-- WHY THE ITEM IS A CATALOG AND NOT A TEXT FIELD
--
-- The question this table exists to answer is "how many pairs of boots did we
-- hand out this season", asked by a funder. A free-text item answers it wrong
-- forever: "botes", "Botes", "bota", "boots" and "botes (2n parell)" are five
-- buckets for one thing, and no amount of later cleaning recovers what was
-- meant. CLAUDE.md rule 18 says an enumerable answer is a picker; this is the
-- database half of that, so a client that skips the picker is still refused.
--
-- The catalog is duplicated between here and `packages/shared/schemas/equipment.ts`,
-- as `document_type` and `role` already are. `tests/equipment-catalog.test.ts`
-- asserts the two agree, so the duplication cannot drift silently.
--
-- WHY IT IS APPEND-ONLY
--
-- Same reason as `participant_notes` and `audit_log` next door: this is a record
-- of what happened, and a record the team can quietly rewrite is worth less than
-- no record. A delivery entered by mistake is corrected by recording the truth
-- beside it, not by making the mistake disappear.
--
-- WHY A PARTICIPANT CANNOT READ HER OWN LOG
--
-- It is not secrecy for its own sake. The log says which women needed boots and
-- when, which is an inference about somebody's circumstances rather than a fact
-- she told us, and it is kept for the programme rather than for her. If a later
-- phase decides she should see it, that is a policy to add deliberately, with
-- its own reason, rather than a default nobody chose.

create table public.equipment_deliveries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item text not null check (
    item in ('boots', 'shin_pads', 'socks', 'shorts', 'jersey', 'tracksuit', 'coat',
             'gloves', 'water_bottle', 'rucksack', 'ball', 'other')
  ),
  -- Nullable on purpose: a water bottle and a rucksack have no size, and a
  -- column that demanded one would push staff into typing a fake value.
  size text,
  delivered_on date not null default current_date,
  delivered_by uuid not null references public.profiles (id),
  -- The one free-text field, for what a catalog cannot carry ("segon parell,
  -- els primers li anaven petits"). Deliberately not the item.
  note text check (note is null or length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now()
);

comment on table public.equipment_deliveries is 'What the team handed a participant, when, and who handed it over (SPEC Phase 2 item 8). Append-only and staff-only: the log is the programme''s operational record, not the participant''s.';

comment on column public.equipment_deliveries.item is 'Drawn from a fixed catalog so the season report can count it. Mirrored in packages/shared/schemas/equipment.ts, and the two are asserted equal by test.';

-- The screen reads one participant's log, newest first, which is the only query
-- this table has.
create index equipment_deliveries_profile_id_delivered_on_idx
  on public.equipment_deliveries (profile_id, delivered_on desc);

-- A foreign key is not indexed automatically, and "what did I hand out" is the
-- second question staff ask of this table.
create index equipment_deliveries_delivered_by_idx
  on public.equipment_deliveries (delivered_by);

-- The season report groups by item within an organization, and gets there
-- through the subject profile.
create index equipment_deliveries_item_idx on public.equipment_deliveries (item, delivered_on desc);

alter table public.equipment_deliveries enable row level security;

create policy equipment_deliveries_select_org_staff
  on public.equipment_deliveries
  for select
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and exists (
      select 1 from public.profiles subject
      where subject.id = equipment_deliveries.profile_id
        and subject.org_id = (select public.current_org_id())
    )
  );

-- `delivered_by = auth.uid()` is the integrity story, the same one `audit_log`
-- uses: a staff member can only record a handover in her OWN name, so the log
-- never claims a colleague met a participant she never met.
create policy equipment_deliveries_insert_org_staff
  on public.equipment_deliveries
  for insert
  to authenticated
  with check (
    (select public.is_staff_or_admin())
    and delivered_by = (select auth.uid())
    and exists (
      select 1 from public.profiles subject
      where subject.id = equipment_deliveries.profile_id
        and subject.org_id = (select public.current_org_id())
    )
  );

-- Deliberately no UPDATE policy and no DELETE policy. Erasing a participant
-- (RAPP-26) still clears this table, through the cascade and through the
-- registry sweep, because SECURITY DEFINER is not subject to these policies.

-- RGPD coverage (RAPP-26 standing rule) ---------------------------------------------
--
-- The registry is extended IN THE MIGRATION THAT ADDS THE TABLE, which is the
-- rule working as intended rather than a courtesy: creating this table without
-- this block turns the coverage assertion in `0011` red, and it did, on purpose,
-- before this was written.
--
-- Nothing else is needed to make the erasure reach it. `profile_id` cascades
-- from `profiles`, so the existing `delete from auth.users` already clears these
-- rows; the registry entry is what makes that a CHECKED fact instead of a
-- hopeful one, because the post-check sweeps from this list.
create or replace function public.personal_data_disposition()
returns table (
  table_name text,
  participant_column text,
  disposition text,
  reason text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  values
    ('profiles', 'id', 'purge',
     'The record itself, including the four columns encrypted under ADR-004.'),
    ('participant_notes', 'profile_id', 'purge',
     'The team''s prose about her life. Append-only against editing, not against erasure.'),
    ('push_tokens', 'user_id', 'purge',
     'Device tokens. Anything left here could still deliver a notification to her phone.'),
    ('terms_acceptances', 'profile_id', 'purge',
     'Her consent records; there is nothing left for them to be consent to.'),
    ('deletion_requests', 'profile_id', 'purge',
     'Carries `reason`, written in her own words. The audit trail records that the request was fulfilled.'),
    ('invites', 'accepted_by', 'purge',
     'The invitation that admitted her, and separately every row carrying her email address.'),
    ('equipment_deliveries', 'profile_id', 'purge',
     'What she was given and when. Not neutral inventory: it says which women needed boots and in what month, which is an inference about her circumstances.'),
    ('audit_log', 'actor_id', 'purge',
     'Rows where SHE acted. The FK does not cascade, so leaving these would make her undeletable.'),
    ('audit_log', 'target_id', 'retain',
     'Kept on purpose (ADR-023): opaque ids only, never personal data (ADR-021). This is the evidence that access to her record was lawful and that the erasure happened, which art. 17(3) permits keeping and which erasing would destroy along with the thing it proves.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.');
$$;

comment on function public.personal_data_disposition is 'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';

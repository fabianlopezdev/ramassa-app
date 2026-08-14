-- Entity-scoped referral tracking, privacy-safe impact, read-only events,
-- collaborator invitations, and retained-history deactivation (RAPP-55).
begin;
select plan(37);

select has_table('public', 'collaborating_entities', 'collaborating entities exist');
select has_table('public', 'entity_invitations', 'entity invitations exist');
select has_column('public', 'profiles', 'collaborating_entity_id', 'entity profiles have a stable entity link');
select has_column('public', 'entity_referrals', 'collaborating_entity_id', 'referrals retain their entity link');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.collaborating_entities'::regclass),
  true,
  'collaborating entities force RLS'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.entity_invitations'::regclass),
  true,
  'entity invitations force RLS'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.list_entity_referrals())::int,
  4,
  'an entity collaborator sees every referral retained for her entity'
);
select is(
  (select count(*) from public.list_entity_referral_tracking())::int,
  3,
  'tracking lists the three linked participants referred by the entity'
);
select is(
  (select count(*) from public.list_entity_referral_tracking() where attendance_marked_count > 0)::int,
  3,
  'tracking includes a database-backed attendance summary for every linked participant'
);
select is(
  (select count(*) from public.get_entity_impact_summary())::int,
  1,
  'one aggregate impact summary is returned'
);
select is(
  (select suppressed from public.get_entity_impact_summary()),
  false,
  'a group of three is not suppressed'
);
select is(
  (select referred_count from public.get_entity_impact_summary()),
  3,
  'the aggregate exposes its participant denominator'
);
select ok(
  (select attendance_rate is not null from public.get_entity_impact_summary()),
  'the unsuppressed group has an attendance rate'
);
select is(
  (select count(*) from public.list_entity_participation_trend())::int,
  3,
  'participation trend returns three monthly aggregate points'
);
select is(
  (select count(*) from public.list_entity_upcoming_events())::int,
  (select count(*)::int from public.events
    where status = 'published'
      and published_at <= now()
      and (expires_at is null or expires_at > now())
      and starts_at >= now()),
  'the entity event list contains only currently published upcoming events'
);
select is(
  has_table_privilege('authenticated', 'public.events', 'INSERT'),
  false,
  'DENIAL: entities have no direct event insert privilege'
);
select throws_ok(
  $$ insert into public.events (
    org_id, category_id, title, location, starts_at, time_zone, signup_mode,
    status, published_at, created_by
  ) values (
    public.current_org_id(),
    '5eed0000-0000-4000-9000-000000000001',
    '{"ca":"No"}'::jsonb,
    'No', now() + interval '1 day', 'Europe/Madrid', 'none',
    'published', now(), auth.uid()
  ) $$,
  '42501',
  null::text,
  'DENIAL: an entity cannot create an event'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(
  (select suppressed from public.get_entity_impact_summary()),
  true,
  'a group smaller than three is suppressed'
);
select is(
  (select attendance_rate from public.get_entity_impact_summary()),
  null::numeric,
  'a suppressed attendance rate is not disclosed'
);
select is(
  (select active_count from public.get_entity_impact_summary()),
  null::integer,
  'a suppressed active count is not disclosed'
);
select is(
  (select count(*) from public.list_entity_participation_trend())::int,
  0,
  'a suppressed entity receives no trend points'
);
select is(
  (select count(*) from public.list_entity_referral_tracking()
    where referral_id = '5eed0000-0000-4000-8010-000000000002')::int,
  0,
  'DENIAL: tracking cannot cross the entity boundary'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.list_staff_referrals(null))::int,
  5,
  'staff retain the RAPP-54 organization referral queue'
);
select is(
  (select count(*) from public.list_collaborating_entities())::int,
  0,
  'DENIAL: staff cannot enter the admin-only entity management boundary'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.create_collaborating_entity('Fundació RAPP-55') $$,
  'an admin can add a collaborating entity'
);
select is(
  (select count(*) from public.list_collaborating_entities()
    where name = 'Fundació RAPP-55')::int,
  1,
  'the new entity appears in the admin list'
);
select lives_ok(
  $$ select * from public.invite_entity_collaborator(
    (select id from public.collaborating_entities where name = 'Fundació RAPP-55'),
    'new.entity.rapp55@example.test',
    'Núria',
    'Col·laboradora'
  ) $$,
  'an admin can invite a collaborator with the RAPP-25 address-bound pattern'
);
select lives_ok(
  $$ select * from public.list_entity_collaborators(
    (select id from public.collaborating_entities where name = 'Fundació RAPP-55')
  ) $$,
  'the admin collaborator list returns its declared runtime shape'
);
select is(
  (select role || '|' || is_active::text
    from public.profiles where id = (
      select profile_id from public.entity_invitations
      where email = 'new.entity.rapp55@example.test'
    )),
  'entity|true',
  'the invitation provisions an active entity profile'
);
reset role;
select is(
  (select count(*) from auth.users where email = 'new.entity.rapp55@example.test')::int,
  1,
  'the invitation provisions one passwordless auth identity'
);
set local role authenticated;
select lives_ok(
  $$ select public.set_entity_collaborator_active(
    (select profile_id from public.entity_invitations
      where email = 'new.entity.rapp55@example.test'),
    false
  ) $$,
  'an admin can remove a collaborator without deleting history'
);
select is(
  (select is_active from public.profiles where id = (
    select profile_id from public.entity_invitations
      where email = 'new.entity.rapp55@example.test'
  )),
  false,
  'removed collaborator profile is inactive'
);
reset role;
select ok(
  (select banned_until > now() from auth.users
    where email = 'new.entity.rapp55@example.test'),
  'removed collaborator cannot start a new auth session'
);
set local role authenticated;

select lives_ok(
  $$ select public.set_collaborating_entity_active(
    (select collaborating_entity_id from public.profiles
      where id = '5eed0000-0000-4000-8000-000000000004'),
    false
  ) $$,
  'an admin can deactivate an entity'
);
select is(
  (select count(*) from public.entity_referrals
    where collaborating_entity_id = (
      select id from public.collaborating_entities where name = 'Creu Roja Osona'
    ))::int,
  4,
  'deactivation retains referral history for staff'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(public.current_app_role(), null::text, 'a deactivated entity user loses her app role');
select is(
  (select count(*) from public.list_entity_referrals())::int,
  0,
  'DENIAL: a deactivated entity user cannot read retained referrals'
);

reset role;
select * from finish();
rollback;

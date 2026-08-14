-- Entity referral isolation, encrypted intake, staff completion, timeline updates,
-- assigned-staff notification, retention and erasure (RAPP-54).
begin;
select plan(38);

select has_table('public', 'entity_referrals', 'entity referrals exist');
select has_table('public', 'referral_updates', 'referral updates exist');
select col_type_is('public', 'entity_referrals', 'referred_phone', 'bytea', 'phone is ciphertext');
select col_type_is('public', 'entity_referrals', 'referred_email', 'bytea', 'email is ciphertext');
select col_type_is('public', 'entity_referrals', 'notes', 'bytea', 'referral notes are ciphertext');
select col_type_is('public', 'referral_updates', 'content', 'bytea', 'update content is ciphertext');
select is(
  (select provolatile::text from pg_proc where oid = 'public.encryption_key()'::regprocedure),
  's',
  'the Vault key lookup is stable within one database statement'
);
select is(
  (select provolatile::text from pg_proc where oid = 'public.decrypt_field(bytea)'::regprocedure),
  's',
  'field decryption is stable within one database statement'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.list_entity_referrals())::int,
  4,
  'the first entity sees all referrals retained for its stable entity'
);
select is(
  (select count(*) from public.list_entity_referrals()
    where id = '5eed0000-0000-4000-8010-000000000003')::int,
  0,
  'DENIAL: the first entity cannot see the second entity referral'
);
select throws_ok(
  $$ select * from public.get_entity_referral('5eed0000-0000-4000-8010-000000000003') $$,
  'P0002',
  null::text,
  'DENIAL: a direct detail lookup cannot cross the entity boundary'
);
select throws_ok(
  $$ select public.add_referral_update(
    '5eed0000-0000-4000-8010-000000000003', 'housing', 'No ha de passar'
  ) $$,
  '42501',
  null::text,
  'DENIAL: an entity cannot update another entity referral'
);
select is(
  (select count(*) from public.list_referral_updates(
    '5eed0000-0000-4000-8010-000000000003'
  ))::int,
  0,
  'DENIAL: an entity cannot list another entity referral updates'
);

select is(
  (select referred_phone from public.get_entity_referral(
    '5eed0000-0000-4000-8010-000000000001'
  )),
  '+34930005401',
  'the owner reads the decrypted phone through the narrow RPC'
);
select isnt(
  (select encode(referred_phone, 'escape') from public.entity_referrals
    where id = '5eed0000-0000-4000-8010-000000000001'),
  '+34930005401',
  'the phone is not stored in plaintext'
);
select isnt(
  (select encode(referred_email, 'escape') from public.entity_referrals
    where id = '5eed0000-0000-4000-8010-000000000001'),
  'amina.referral@example.test',
  'the email is not stored in plaintext'
);

select lives_ok(
  $$ select public.create_entity_referral(jsonb_build_object(
    'firstName', 'Наталія',
    'lastName', 'Àlvarez',
    'phone', '+34930005499',
    'email', 'nataliia.rapp54@example.test',
    'documentationStatus', 'in_progress',
    'notes', 'Suport en العربية'
  )) $$,
  'an entity can submit one validated multilingual referral'
);
select throws_ok(
  $$ select public.create_entity_referral('{"firstName":"","lastName":"Test","documentationStatus":"unknown"}') $$,
  '23514',
  null::text,
  'invalid referral input is refused at the database boundary'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(
  (select count(*) from public.list_entity_referrals())::int,
  1,
  'the second entity sees only its own referral'
);
select is(
  (select count(*) from public.entity_referrals
    where entity_user_id = '5eed0000-0000-4000-8000-000000000004')::int,
  0,
  'DENIAL: direct table reads cannot cross the entity boundary'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.list_staff_referrals(null))::int,
  6,
  'staff see every referral in their organization'
);
select lives_ok(
  $$ select public.complete_entity_referral(
    '5eed0000-0000-4000-8010-000000000001',
    '5eed0000-0000-4000-8000-000000000015'
  ) $$,
  'staff link a pending referral to a same-tenant player'
);
select is(
  (select referred_profile_id::text || '|' || assigned_staff_id::text || '|' || status
   from public.entity_referrals
   where id = '5eed0000-0000-4000-8010-000000000001'),
  '5eed0000-0000-4000-8000-000000000015|5eed0000-0000-4000-8000-000000000002|active',
  'completion atomically links the player, assignee and status'
);
select throws_ok(
  $$ select public.complete_entity_referral(
    (select id from public.entity_referrals where referred_first_name = 'Наталія'),
    '5eed0000-0000-4000-8000-000000000015'
  ) $$,
  '23505',
  null::text,
  'one player cannot be linked to two referrals'
);

insert into public.push_tokens (user_id, token, platform, device_id)
values (
  '5eed0000-0000-4000-8000-000000000002',
  'ExponentPushToken[rapp54-pgtap]',
  'web',
  'rapp54-pgtap'
)
on conflict (user_id, device_id) do update set token = excluded.token;

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  public.add_referral_update(
    '5eed0000-0000-4000-8010-000000000001',
    'education',
    'Ha començat català amb أمينة'
  ) is not null,
  true,
  'staff may add a typed update'
);
select is(
  (select count(*) from public.participant_activity(
    '5eed0000-0000-4000-8000-000000000015'
  ) where kind = 'referral_update' and detail = 'Ha començat català amb أمينة')::int,
  1,
  'the update appears decrypted on the linked participant timeline'
);

reset role;

select is(
  (select count(*) from public.push_publications
    where content_type = 'referral_update'
      and content_id in (
        select id from public.referral_updates
        where referral_id = '5eed0000-0000-4000-8010-000000000001'
      )
      and recipient_id = '5eed0000-0000-4000-8000-000000000002')::int,
  1,
  'the assigned staff member receives one durable push publication'
);
select is(
  (select count(*) from public.push_deliveries as delivery
    join public.push_publications as publication on publication.id = delivery.publication_id
    where publication.content_type = 'referral_update'
      and publication.content_id in (
        select id from public.referral_updates
        where referral_id = '5eed0000-0000-4000-8010-000000000001'
      )
      and delivery.recipient_id = '5eed0000-0000-4000-8000-000000000002')::int,
  (select count(*) from public.push_tokens
    where user_id = '5eed0000-0000-4000-8000-000000000002')::int,
  'the assigned staff push has one delivery per registered device'
);
select isnt(
  (select encode(content, 'escape') from public.referral_updates
    where referral_id = '5eed0000-0000-4000-8010-000000000001'
    order by created_at desc limit 1),
  'Ha començat català amb أمينة',
  'timeline prose is ciphertext at rest'
);

update public.profiles set is_active = false
where id = '5eed0000-0000-4000-8000-000000000015';
select is(
  (select status from public.entity_referrals
   where id = '5eed0000-0000-4000-8010-000000000001'),
  'inactive',
  'participant deactivation synchronizes the entity-visible referral status'
);

select is(
  (select disposition from public.personal_data_disposition()
   where table_name = 'entity_referrals' and participant_column = 'referred_profile_id'),
  'purge',
  'linked referral intake is explicitly registered for participant erasure'
);
select is(
  (select disposition from public.personal_data_disposition()
   where table_name = 'referral_updates' and participant_column = 'author_id'),
  'purge',
  'participant-authored referral updates are explicitly registered for erasure'
);
select ok(
  exists(
    select 1 from public.personal_data_disposition()
    where table_name = 'entity_referrals'
      and participant_column is null
      and disposition = 'retain_limited'
      and reason like '%24 months%'
  ),
  'unlinked referrals carry an explicit 24 month retention rule'
);

insert into public.entity_referrals (
  id, org_id, entity_user_id, collaborating_entity_id,
  referred_first_name, referred_last_name,
  documentation_status, status, created_at, updated_at
) values
  (
    '5eed0000-0000-4000-8010-000000000090',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8030-000000000001',
    'Expired', 'Referral', 'none', 'pending',
    now() - interval '25 months', now() - interval '25 months'
  ),
  (
    '5eed0000-0000-4000-8010-000000000091',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8030-000000000001',
    'Recent', 'Referral', 'none', 'pending',
    now() - interval '23 months', now() - interval '23 months'
  );

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  has_function_privilege(
    'authenticated',
    'public.purge_expired_entity_referrals(timestamptz)',
    'EXECUTE'
  ),
  false,
  'DENIAL: an entity cannot execute the retention purge'
);

reset role;
set local role service_role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
select is(
  public.purge_expired_entity_referrals(now()),
  1,
  'the retention job purges exactly the unlinked referral older than 24 months'
);
reset role;
select is(
  (select count(*) from public.entity_referrals
   where id = '5eed0000-0000-4000-8010-000000000090')::int,
  0,
  'the expired unlinked referral is gone'
);
select is(
  (select count(*) from public.entity_referrals
   where id = '5eed0000-0000-4000-8010-000000000091')::int,
  1,
  'a recent unlinked referral remains available'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$ select public.create_entity_referral('{"firstName":"No","lastName":"Player","documentationStatus":"none"}') $$,
  '42501',
  null::text,
  'DENIAL: a participant cannot submit an entity referral'
);

reset role;
select * from finish();
rollback;

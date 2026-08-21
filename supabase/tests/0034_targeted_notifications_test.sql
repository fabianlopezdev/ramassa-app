-- Staff-authored multilingual templates, targeted audiences, custom groups,
-- durable delivery rows, and audited history (RAPP-59).
begin;
select plan(35);

delete from public.push_publications where content_type = 'targeted_notification';
delete from public.targeted_notification_sends;

select has_table('public', 'notification_templates', 'notification templates exist');
select has_table('public', 'custom_notification_groups', 'custom groups exist');
select has_table('public', 'custom_notification_group_members', 'custom group membership exists');
select has_table('public', 'targeted_notification_sends', 'targeted send history exists');

select is(
  (select count(*) from public.notification_templates
   where id = '5eed0000-0000-4000-8033-000000000001')::integer,
  1,
  'the weekly reminder template is seeded once'
);
select is(
  (select count(*) from jsonb_object_keys(
    (select title from public.notification_templates
     where id = '5eed0000-0000-4000-8033-000000000001')) )::integer,
  5,
  'the weekly reminder title round-trips all five languages'
);
select is(
  (select count(*) from public.custom_notification_group_members
   where group_id = '5eed0000-0000-4000-8034-000000000001')::integer,
  5,
  'the seeded weekly group has five curated members'
);

select is(
  (select count(*) from public.personal_data_disposition()
   where table_name = 'custom_notification_group_members'
     and participant_column = 'participant_id'
     and disposition = 'purge')::integer,
  1,
  'custom group membership is registered for participant erasure'
);
select is(
  (select count(*) from public.personal_data_disposition()
   where table_name in ('notification_templates', 'custom_notification_groups', 'targeted_notification_sends')
     and disposition = 'not_personal')::integer,
  3,
  'organization-owned notification records have explicit RGPD disposition'
);
select is(
  private.valid_notification_copy(
    '{"ca":"A","es":"A","en":"A","ar":"A","fa":null}'::jsonb,
    120
  ),
  false,
  'notification copy rejects a null translation'
);
select is(
  private.valid_notification_copy(
    '{"ca":"A","es":"A","en":"A","ar":"A","fa":123}'::jsonb,
    120
  ),
  false,
  'notification copy rejects a non-string translation'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.preview_notification_audience(
    'custom_group', '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb
  ))::integer,
  5,
  'custom group preview includes every seeded eligible device owner'
);
select is(
  (select string_agg(language, ',' order by language)
   from public.preview_notification_audience(
    'custom_group', '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb
   )),
  'ar,ca,en,es,fa',
  'custom group preview preserves all five recipient languages'
);
select is(
  (select count(*) from public.preview_notification_audience(
    'interest', '{"service_category_id":"5eed0000-0000-4000-8009-000000000002"}'::jsonb
  ))::integer,
  1,
  'interest targeting resolves the seeded language-course participant'
);
select is(
  (select participant_id from public.preview_notification_audience(
    'interest', '{"service_category_id":"5eed0000-0000-4000-8009-000000000002"}'::jsonb
  )),
  '5eed0000-0000-4000-8000-000000000012'::uuid,
  'interest targeting returns the exact participant'
);
select is(
  (select count(*) from public.preview_notification_audience(
    'signup', '{"event_id":"5eed0000-0000-4000-8003-000000000005"}'::jsonb
  ))::integer,
  2,
  'signup targeting includes active seeded signups with devices'
);
select is(
  (select count(*) from public.preview_notification_audience(
    'entity', '{"entity_name":"Creu Roja Osona"}'::jsonb
  ))::integer,
  7,
  'entity targeting resolves active opted-in device owners'
);
select is(
  (select count(*) from public.preview_notification_audience('all', '{}'::jsonb))::integer,
  18,
  'all targeting counts distinct active opted-in device owners'
);

select lives_ok(
  $$ select public.create_targeted_notification_send(
    '5eed0000-0000-4000-8033-000000000001',
    '{"ca":"Recordatori","es":"Recordatorio","en":"Reminder","ar":"تذكير","fa":"یادآوری"}'::jsonb,
    '{"ca":"Entrenament aquesta tarda","es":"Entrenamiento esta tarde","en":"Training this afternoon","ar":"التدريب بعد ظهر اليوم","fa":"تمرین امروز بعدازظهر"}'::jsonb,
    'custom_group',
    '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb,
    5
  ) $$,
  'staff can confirm and create a targeted send'
);

select is(
  (select recipient_count from public.targeted_notification_sends order by created_at desc limit 1),
  5,
  'send history stores the confirmed audience size'
);

reset role;

select is(
  (select count(*) from public.push_publications
   where content_type = 'targeted_notification')::integer,
  1,
  'the send reuses the durable push publication pipeline'
);
select is(
  (select count(*) from public.push_deliveries as delivery
   join public.push_publications as publication on publication.id = delivery.publication_id
   where publication.content_type = 'targeted_notification')::integer,
  5,
  'the send creates exactly one durable delivery per seeded group device'
);
select is(
  (select string_agg(delivery.language, ',' order by delivery.language)
   from public.push_deliveries as delivery
   join public.push_publications as publication on publication.id = delivery.publication_id
   where publication.content_type = 'targeted_notification'),
  'ar,ca,en,es,fa',
  'durable deliveries retain each recipient language'
);
select is(
  (select count(*) from public.audit_log
   where action = 'targeted_notification_sent'
     and changes->>'recipient_count' = '5')::integer,
  1,
  'the confirmed targeted send is audited with audience size'
);

set local role authenticated;

select is(
  (select count(*) from public.list_notification_send_history())::integer,
  1,
  'staff can read one accurate history row'
);

reset role;
insert into public.push_tokens (id, user_id, token, platform, device_id)
values (
  '5eed0000-0000-4000-8000-000000990011',
  '5eed0000-0000-4000-8000-000000000011',
  'ExponentPushToken[test-rapp59-second-device]',
  'ios',
  'test-rapp59-second-device'
);
set local role authenticated;
select is(
  (select sum(device_count)::integer from public.preview_notification_audience(
    'custom_group', '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb
  )),
  6,
  'audience preview counts every eligible device while deduplicating recipients'
);
select lives_ok(
  $$ select public.create_targeted_notification_send(
    '5eed0000-0000-4000-8033-000000000001',
    '{"ca":"Recordatori","es":"Recordatorio","en":"Reminder","ar":"تذكير","fa":"یادآوری"}'::jsonb,
    '{"ca":"Entrenament aquesta tarda","es":"Entrenamiento esta tarde","en":"Training this afternoon","ar":"التدريب بعد ظهر اليوم","fa":"تمرین امروز بعدازظهر"}'::jsonb,
    'custom_group',
    '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb,
    5
  ) $$,
  'staff can send to five recipients across six devices'
);
reset role;
select is(
  (select publication.recipient_count
   from public.push_publications as publication
   join public.targeted_notification_sends as send
     on publication.content_type = 'targeted_notification' and publication.content_id = send.id
   where publication.recipient_count = 6
   order by send.created_at desc, send.id desc limit 1),
  6,
  'send history stores the exact device count before dispatch starts'
);
select is(
  (select count(*)::integer
   from public.push_deliveries as delivery
   join public.push_publications as publication on publication.id = delivery.publication_id
   join public.targeted_notification_sends as send on send.id = publication.content_id
   where publication.content_type = 'targeted_notification'
     and send.id = (
       select six_device_send.id
       from public.targeted_notification_sends as six_device_send
       join public.push_publications as six_device_publication
         on six_device_publication.content_type = 'targeted_notification'
        and six_device_publication.content_id = six_device_send.id
       where six_device_publication.recipient_count = 6
       order by six_device_send.created_at desc, six_device_send.id desc limit 1
     )),
  6,
  'the multi-device send creates one durable delivery per eligible device'
);
delete from public.push_tokens where id = '5eed0000-0000-4000-8000-000000990011';

select throws_ok(
  $$ select public.create_targeted_notification_send(
    '5eed0000-0000-4000-8033-000000000001',
    '{"ca":"A","es":"A","en":"A","ar":"A","fa":"A"}'::jsonb,
    '{"ca":"B","es":"B","en":"B","ar":"B","fa":"B"}'::jsonb,
    'custom_group',
    '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb,
    4
  ) $$,
  'P0001',
  'NOTIFICATIONS/AUDIENCE_CHANGED',
  'confirmation cannot send when the live audience changed'
);

reset role;
update public.profiles
set push_notifications_enabled = false
where id = '5eed0000-0000-4000-8000-000000000016';
set local role authenticated;
select is(
  (select count(*) from public.preview_notification_audience(
    'custom_group', '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb
  ))::integer,
  4,
  'global push opt-out is enforced during audience preview'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$ select * from public.preview_notification_audience('all', '{}'::jsonb) $$,
  '42501',
  'NOTIFICATIONS/STAFF_ONLY',
  'DENIAL: players cannot preview notification audiences'
);
select throws_ok(
  $$ select public.create_targeted_notification_send(
    null,
    '{"ca":"A","es":"A","en":"A","ar":"A","fa":"A"}'::jsonb,
    '{"ca":"B","es":"B","en":"B","ar":"B","fa":"B"}'::jsonb,
    'all', '{}'::jsonb, 18
  ) $$,
  '42501',
  'NOTIFICATIONS/STAFF_ONLY',
  'DENIAL: players cannot send targeted notifications'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select count(*) from public.notification_templates)::integer,
  0,
  'DENIAL: entity users cannot read staff templates'
);

reset role;
select is(
  (select count(*) from pg_class
   where oid in (
     'public.notification_templates'::regclass,
     'public.custom_notification_groups'::regclass,
     'public.custom_notification_group_members'::regclass,
     'public.targeted_notification_sends'::regclass
   ) and relrowsecurity)::integer,
  4,
  'RLS is enabled on every targeted notification table'
);

select * from finish();
rollback;

begin;
select plan(12);

-- What she has seen on Inici (RAPP-821).

select has_table('public', 'announcement_reads', 'seen announcements are recorded per person');
select has_table('public', 'event_reads', 'opened activities are recorded per person');

select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition()
   where table_name = 'announcement_reads'),
  'purge:user_id',
  'seen announcements are purged with her'
);
select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition()
   where table_name = 'event_reads'),
  'purge:user_id',
  'opened activities are purged with her'
);

-- One announcement published now and one still a draft, both copies of a seeded one.
insert into public.announcements (id, org_id, category, title, body, is_pinned, status, published_at, created_by)
select '5eed0000-0000-4000-8821-000000000001', org_id, category, title, body, false, 'published', now(), created_by
from public.announcements
where status = 'published' and published_at <= now()
order by published_at desc
limit 1;
insert into public.announcements (id, org_id, category, title, body, is_pinned, status, published_at, created_by)
select '5eed0000-0000-4000-8821-000000000002', org_id, category, title, body, false, 'draft', null, created_by
from public.announcements
where id = '5eed0000-0000-4000-8821-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select public.my_home_seen() -> 'announcement_ids'),
  '[]'::jsonb,
  'she starts with nothing seen'
);
select ok(
  (select (public.my_home_seen() ->> 'since')::timestamptz) <= now(),
  'her record starts at a moment in the past'
);

select throws_ok(
  $$ insert into public.announcement_reads (org_id, announcement_id, user_id)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8821-000000000001',
       '5eed0000-0000-4000-8000-000000000011'
     ) $$,
  '42501',
  null,
  'a seen row is never written by a direct insert'
);

select lives_ok(
  $$ select public.mark_home_items_seen(
       array[
         '5eed0000-0000-4000-8821-000000000001',
         '5eed0000-0000-4000-8821-000000000002'
       ]::uuid[],
       array['5eed0000-0000-4000-8003-000000000001']::uuid[]
     ) $$,
  'she marks an announcement and an activity as seen'
);
select is(
  (select public.my_home_seen() -> 'announcement_ids'),
  '["5eed0000-0000-4000-8821-000000000001"]'::jsonb,
  'the published announcement is recorded and the draft is not'
);
select is(
  (select public.my_home_seen() -> 'event_ids'),
  '["5eed0000-0000-4000-8003-000000000001"]'::jsonb,
  'the activity is recorded'
);
select lives_ok(
  $$ select public.mark_home_items_seen(
       array['5eed0000-0000-4000-8821-000000000001']::uuid[]
     ) $$,
  'marking the same announcement again changes nothing'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select count(*) from public.announcement_reads) + (select count(*) from public.event_reads),
  0::bigint,
  'another player sees none of her rows'
);

select * from finish();
rollback;

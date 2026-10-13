-- Desktop to phone photo handoff (RAPP-254).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only someone who may add internal documents opens a handoff for one.
--   2. Completing it registers the document under the requested name, once.
--   3. It is bound to its requester: anyone else finds nothing.
--   4. It expires; it takes photos only; the folder check still applies.

begin;
select plan(10);

create temp table handoff (id uuid);
grant all on handoff to authenticated;

set local role authenticated;

-- 1. Who opens one ----------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select * from public.create_photo_handoff('internal_document', 'Receipt') $$,
  '42501', null::text, 'staff without the documents permission open no handoff'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into handoff select handoff_id from public.create_photo_handoff('internal_document', '  Shop receipt  ');
select is(
  (select document_name || ' ' || (expires_at - created_at between interval '9 minutes' and interval '11 minutes')
     from public.photo_handoffs where id = (select id from handoff)),
  'Shop receipt true', 'a handoff is opened for ten minutes, under a clean name'
);

-- 4. Photos only, and the folder still counts -----------------------------------------------------------

select throws_ok(
  $$ select public.complete_photo_handoff((select id from handoff),
       '5eed0000-0000-4000-8000-000000000000/documents/5eed0000-0000-4000-8000-000000000001/2026/10/a.pdf',
       'application/pdf', 1000) $$,
  '23514', 'HANDOFF/NOT_A_PHOTO', 'a handoff takes photos only'
);
select throws_ok(
  $$ select public.complete_photo_handoff((select id from handoff),
       '5eed0000-0000-4000-8000-000000000000/gallery/x.jpg', 'image/jpeg', 1000) $$,
  '23514', null::text, 'and only from the documents folder'
);

-- 3. Bound to its requester ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::int from public.photo_handoffs where id = (select id from handoff)),
  0, 'someone else does not read it'
);
select throws_ok(
  $$ select public.complete_photo_handoff((select id from handoff),
       '5eed0000-0000-4000-8000-000000000000/documents/x/2026/10/b.jpg', 'image/jpeg', 1000) $$,
  'P0002', 'HANDOFF/NOT_FOUND', 'nor completes it'
);

-- 2. Completing it ----------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  public.complete_photo_handoff((select id from handoff),
    '5eed0000-0000-4000-8000-000000000000/documents/5eed0000-0000-4000-8000-000000000001/2026/10/0123456789abcdef0123456789abcdef.jpg',
    'image/jpeg', 120000) is not null,
  'the phone completes it'
);
select is(
  (select d.name from public.internal_documents d
     join public.photo_handoffs h on h.result_id = d.id where h.id = (select id from handoff)),
  'Shop receipt', 'and the document is registered under the requested name'
);
select throws_ok(
  $$ select public.complete_photo_handoff((select id from handoff),
       '5eed0000-0000-4000-8000-000000000000/documents/5eed0000-0000-4000-8000-000000000001/2026/10/1123456789abcdef0123456789abcdef.jpg',
       'image/jpeg', 120000) $$,
  '23514', 'HANDOFF/USED', 'once'
);

-- 4. Expiry -----------------------------------------------------------------------------------------------

reset role;
update public.photo_handoffs set completed_at = null, expires_at = now() - interval '1 minute'
 where id = (select id from handoff);
set local role authenticated;
select throws_ok(
  $$ select public.complete_photo_handoff((select id from handoff),
       '5eed0000-0000-4000-8000-000000000000/documents/5eed0000-0000-4000-8000-000000000001/2026/10/2123456789abcdef0123456789abcdef.jpg',
       'image/jpeg', 120000) $$,
  '23514', 'HANDOFF/EXPIRED', 'an expired handoff is refused'
);

select * from finish();
rollback;

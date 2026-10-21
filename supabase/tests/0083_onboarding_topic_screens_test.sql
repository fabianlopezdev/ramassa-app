begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select results_eq(
  $$ select id::text, screen_id::text from public.custom_questions
      where id in ('5eed0000-0000-4000-8045-000000000001',
                   '5eed0000-0000-4000-8045-000000000002',
                   '5eed0000-0000-4000-8045-000000000003') order by id $$,
  $$ values ('5eed0000-0000-4000-8045-000000000001', '5eed0000-0000-4000-8044-000000000001'),
            ('5eed0000-0000-4000-8045-000000000002', '5eed0000-0000-4000-8044-000000000002'),
            ('5eed0000-0000-4000-8045-000000000003', '5eed0000-0000-4000-8044-000000000003') $$,
  'transport, discovery and participation are separate topics with stable question IDs'
);
select is(
  (select count(*)::integer from public.intake_screens
    where id in ('5eed0000-0000-4000-8044-000000000001',
                 '5eed0000-0000-4000-8044-000000000002',
                 '5eed0000-0000-4000-8044-000000000003')
      and after_screen = 'logistics' and not is_archived),
  3, 'all three screens are active at the existing wizard anchor'
);
select ok(
  not exists (select 1 from public.intake_screens
    where id in ('5eed0000-0000-4000-8044-000000000001',
                 '5eed0000-0000-4000-8044-000000000002',
                 '5eed0000-0000-4000-8044-000000000003')
      and not (title ?& array['ca','es','en','ar','fa'])),
  'topic titles are translated into all five languages'
);
select ok(
  not exists (select 1 from public.custom_questions
    where id in ('5eed0000-0000-4000-8045-000000000001',
                 '5eed0000-0000-4000-8045-000000000002',
                 '5eed0000-0000-4000-8045-000000000003')
      and not (label ?& array['ca','es','en','ar','fa']))
  and not exists (select 1 from public.custom_question_options
    where question_id = '5eed0000-0000-4000-8045-000000000002' and not is_archived
      and not (label ?& array['ca','es','en','ar','fa'])),
  'question and offered option labels are translated into all five languages'
);
select ok(
  (select help is null and privacy = 'sensitive' from public.custom_questions
    where id = '5eed0000-0000-4000-8045-000000000003'),
  'participation omits the helper sentence while keeping sensitive access rules'
);
select * from finish();
rollback;

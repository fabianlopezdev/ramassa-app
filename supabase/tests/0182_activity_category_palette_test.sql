-- Activity categories take their colour from the shared section palette (RAPP-893).
-- Runs with: bunx supabase test db

begin;
select plan(10);

select is(
  (select count(*) from pg_constraint
   where conrelid = 'public.event_categories'::regclass
     and conname = 'event_categories_color_catalog'),
  1::bigint,
  'one check holds the colour of an activity category'
);

select lives_ok(
  $$ insert into public.event_categories (org_id, name, icon, color, sort_order)
     select
       '5eed0000-0000-4000-8000-000000000000',
       '{"ca":"Paleta","es":"Paleta","en":"Palette","ar":"لوحة","fa":"پالت"}',
       'users',
       palette.color,
       900 + palette.position
     from unnest(
       array['primary', 'sky', 'green', 'purple', 'orange', 'pink', 'teal', 'amber', 'indigo']
     ) with ordinality as palette (color, position) $$,
  'every palette colour can be saved, the club colour and the eight hues'
);

select throws_ok(
  format(
    $$ insert into public.event_categories (org_id, name, icon, color)
       values (
         '5eed0000-0000-4000-8000-000000000000',
         '{"ca":"Antiga","es":"Antigua","en":"Old","ar":"قديمة","fa":"قدیمی"}',
         'users',
         %L
       ) $$,
    old_color
  ),
  '23514',
  null::text,
  format('the older name %s can no longer be saved', old_color)
)
from unnest(array['secondary', 'accent', 'chart-1', 'chart-2', 'chart-3']) as old_color;

select throws_ok(
  $$ insert into public.event_categories (org_id, name, icon, color)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '{"ca":"Urgent","es":"Urgente","en":"Urgent","ar":"عاجل","fa":"فوری"}',
       'users',
       'error'
     ) $$,
  '23514',
  null::text,
  'the red of urgent avisos is never an activity colour'
);

select is(
  (select count(*) from public.event_categories
   where color not in ('primary', 'sky', 'green', 'purple', 'orange', 'pink', 'teal', 'amber', 'indigo')),
  0::bigint,
  'no stored activity category keeps a colour outside the palette'
);

select results_eq(
  $$ select name ->> 'ca', color from public.event_categories
     where id in (
       '5eed0000-0000-4000-8002-000000000001',
       '5eed0000-0000-4000-8002-000000000002',
       '5eed0000-0000-4000-8002-000000000003',
       '5eed0000-0000-4000-8002-000000000004',
       '5eed0000-0000-4000-8002-000000000005',
       '5eed0000-0000-4000-8002-000000000006'
     )
     order by sort_order $$,
  $$ values
       ('Entrenaments', 'primary'),
       ('Cursos', 'sky'),
       ('Activitats culturals', 'amber'),
       ('Inserció laboral', 'pink'),
       ('Cursos d''idiomes', 'purple'),
       ('Sortides', 'amber') $$,
  'the default categories carry their approved colours'
);

select * from finish();
rollback;

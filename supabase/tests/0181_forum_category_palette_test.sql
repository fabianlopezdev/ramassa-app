begin;
select plan(5);

-- Forum categories take their colour from the shared section palette (RAPP-893).

select results_eq(
  $$ select slug, color from public.forum_categories
     where org_id = '5eed0000-0000-4000-8000-000000000000'
       and slug in ('housing', 'jobs', 'recommendations', 'general')
     order by sort_order $$,
  $$ values ('housing', 'orange'), ('jobs', 'pink'), ('recommendations', 'teal'),
            ('general', 'neutral') $$,
  'the default categories carry one palette hue each, and general keeps no colour'
);

select is(
  (select count(*)::integer from public.forum_categories
   where color in ('secondary', 'info', 'error')),
  0,
  'no category keeps a colour name from before the palette'
);

select is(
  (select count(*)::integer from public.forum_categories where color = 'error'),
  0,
  'the red of urgent avisos is no forum colour'
);

select lives_ok(
  $$ insert into public.forum_categories (org_id, name, slug, icon, color, sort_order)
     values ('5eed0000-0000-4000-8000-000000000000',
       '{"ca":"Antiga","es":"Antigua","en":"Old","fr":"Ancienne","ar":"قديمة","fa":"قدیمی"}',
       'palette-older-name', 'bubble', 'secondary', 90) $$,
  'an older colour name is still stored, so hosted rows keep working before they move'
);

select throws_ok(
  $$ insert into public.forum_categories (org_id, name, slug, icon, color, sort_order)
     values ('5eed0000-0000-4000-8000-000000000000',
       '{"ca":"Buida","es":"Vacía","en":"Empty","fr":"Vide","ar":"فارغة","fa":"خالی"}',
       'palette-blank-name', 'bubble', '  ', 91) $$,
  '23514',
  null,
  'a blank colour is still refused'
);

select * from finish();
rollback;

-- Activity categories take their colour from the shared section palette
-- (RAPP-893), the one avisos, the forum, services and guides read, so a topic
-- keeps one colour across the app. A colour is `primary` (the club's own
-- colour) or one of the eight `tokens.colors.category` hues.
--
-- The six default categories exist only where `supabase/seed.sql` ran: no
-- migration or function inserts them, and a hosted database holds the
-- categories its staff created. They are found by their Catalan name together
-- with the colour the seed gave them, so a copy staff made by hand moves the
-- same way and a colour staff changed since falls to the general map below.

alter table public.event_categories
  drop constraint event_categories_color_catalog;

update public.event_categories as category
set color = defaults.color
from (
  values
    ('Cursos', 'secondary', 'sky'),
    ('Activitats culturals', 'accent', 'amber'),
    ('Inserció laboral', 'chart-1', 'pink'),
    ('Cursos d''idiomes', 'chart-2', 'purple'),
    ('Sortides', 'chart-3', 'amber')
) as defaults (catalan_name, seeded_color, color)
where category.name ->> 'ca' = defaults.catalan_name
  and category.color = defaults.seeded_color;

-- Every other row moves by its old name. The red of `chart-3` belongs to
-- urgent avisos alone, so it becomes pink.
update public.event_categories as category
set color = moved.color
from (
  values
    ('secondary', 'amber'),
    ('accent', 'sky'),
    ('chart-1', 'green'),
    ('chart-2', 'amber'),
    ('chart-3', 'pink')
) as moved (old_color, color)
where category.color = moved.old_color;

alter table public.event_categories
  add constraint event_categories_color_catalog
    check (
      color in ('primary', 'sky', 'green', 'purple', 'orange', 'pink', 'teal', 'amber', 'indigo')
    );

-- Forum categories take their colour from the shared section palette
-- (RAPP-893), the same names as avisos, Ajuda and activitats, so a topic
-- keeps one colour across the app and a post opens onto the shade of its
-- card. Data only: the check on `forum_categories.color` stays as it is, and
-- the app still reads every older name.
--
-- The default categories get one hue each, only while they still hold the
-- colour they were created with, so a colour staff already chose is left
-- alone. `general` keeps `neutral`, no colour.

update public.forum_categories as category
set color = defaults.color
from (
  values
    ('housing', 'primary', 'orange'),
    ('jobs', 'secondary', 'pink'),
    ('recommendations', 'info', 'teal')
) as defaults (slug, old_color, color)
where category.slug = defaults.slug
  and category.color = defaults.old_color;

-- Every other row moves from an older name to its palette hue. The red of
-- `error` belongs to urgent avisos alone, so it becomes pink. `primary` is the
-- club colour and stays, and a name this list does not know stays as stored.

update public.forum_categories as category
set color = renamed.color
from (
  values
    ('secondary', 'amber'),
    ('info', 'teal'),
    ('error', 'pink')
) as renamed (old_color, color)
where category.color = renamed.old_color;

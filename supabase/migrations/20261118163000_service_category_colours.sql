-- Each Ajuda service category carries its own colour (RAPP-856). The player
-- app washes the category's icon circle and its list with one of the
-- `tokens.colors.category` hues. The eight default categories get one hue
-- each, only while they still hold the old default (primary or secondary),
-- so a colour staff already chose is left alone.

update public.service_categories as category
set color = defaults.color
from (
  values
    ('housing', 'orange'),
    ('language-courses', 'purple'),
    ('job-insertion', 'pink'),
    ('legal-aid', 'indigo'),
    ('health', 'green'),
    ('training', 'sky'),
    ('leisure-culture', 'amber'),
    ('documentation', 'teal')
) as defaults (slug, color)
where category.slug = defaults.slug
  and category.color in ('primary', 'secondary');

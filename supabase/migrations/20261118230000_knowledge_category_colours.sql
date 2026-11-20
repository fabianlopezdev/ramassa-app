-- Each guide category carries its own colour (RAPP-868), from the same
-- `tokens.colors.category` hues as the service categories (RAPP-856). The
-- player app washes the category's icon circle and its open list with it,
-- and staff pick it in the dashboard (RAPP-869). The four default categories
-- get one hue each; any other category starts on `sky`.

alter table public.knowledge_categories
  add column color text not null default 'sky';

alter table public.knowledge_categories
  add constraint knowledge_categories_color_check check (length(btrim(color)) > 0);

update public.knowledge_categories as category
set color = defaults.color
from (
  values
    ('rights-asylum', 'indigo'),
    ('digital-literacy', 'sky'),
    ('digital-skills', 'sky'),
    ('gender-equality', 'purple'),
    ('gender-based-violence', 'purple'),
    ('general-resources', 'teal')
) as defaults (slug, color)
where category.slug = defaults.slug;

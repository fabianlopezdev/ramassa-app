/**
 * The identifier a new forum category gets from its Catalan name (RAPP-386):
 * lowercase letters and numbers joined by hyphens, as the database requires
 * (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). "Cursos i tallers" becomes
 * "cursos-i-tallers". A pure module, so the unit tests run without the app's
 * Supabase client.
 */
export const FORUM_CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function forumCategorySlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

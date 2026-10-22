/**
 * The organization this admin build belongs to, by slug, for what is shown
 * before sign-in (its brand colours and logo). Same variable and default as the
 * player app (`EXPO_PUBLIC_ORGANIZATION_SLUG`, .env.example).
 */
export const organizationSlug: string =
  (import.meta.env.EXPO_PUBLIC_ORGANIZATION_SLUG as string | undefined)?.trim() || 'ramassa';

/** The media worker's public logo link for this organization, or null without a worker. */
export function publicOrganizationLogoUrl(mediaWorkerOrigin: string): string | null {
  const origin = mediaWorkerOrigin.replace(/\/+$/, '');
  if (origin === '') return null;
  return `${origin}/branding/${encodeURIComponent(organizationSlug)}/logo`;
}

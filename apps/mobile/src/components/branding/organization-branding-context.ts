/**
 * The organization's branding as the app holds it, apart from the provider
 * that loads it (RAPP-893). A low piece such as a raised surface reads the
 * brand colour from here without pulling in the data layer behind the
 * provider.
 */
import { createContext, use } from 'react';
import type { OrganizationRow } from '@ramassa/shared/organization-settings';
import { tokens } from '@ramassa/shared/tokens';

export const OrganizationBrandingContext = createContext<OrganizationRow | null>(null);

export function useOrganizationBranding(): OrganizationRow | null {
  return use(OrganizationBrandingContext);
}

/**
 * The organization's brand colour as a value, for native parts that cannot
 * read the theme's classes: an icon's tint, the tab bar's badges (RAPP-832).
 */
export function useBrandColor(): string {
  return use(OrganizationBrandingContext)?.primary_color ?? tokens.colors.primary.DEFAULT;
}

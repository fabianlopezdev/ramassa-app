import { organizationSlug } from '@/lib/organization-slug';
import { supabase } from '@/lib/supabase';
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  brandThemeVariables,
  fetchOrganizationSettings,
  fetchPublicOrganizationBranding,
  type OrganizationRow,
  type PublicOrganizationBranding,
} from '@ramassa/shared/organization-settings';
import { tokens } from '@ramassa/shared/tokens';

const AdminBrandingContext = createContext<OrganizationRow | null>(null);
const PublicBrandingReadyContext = createContext(true);

/** The longest the login waits for the brand colours before showing anyway. */
const PUBLIC_BRANDING_WAIT_MS = 1200;

export const ORGANIZATION_BRANDING_CHANGED_EVENT = 'ramassa:organization-branding-changed';

/** The shadcn brand variables app.css points at the brand colours. */
const BRAND_ALIASES = {
  '--primary': 'var(--ramassa-color-primary)',
  '--secondary': 'var(--ramassa-color-secondary)',
  '--sidebar-primary': 'var(--ramassa-color-primary)',
} as const;

export function useAdminBranding(): OrganizationRow | null {
  return use(AdminBrandingContext);
}

/**
 * True once the login's brand colours are known (or the wait ran out), so the
 * screen appears once in the right colours instead of flashing the default.
 */
export function usePublicBrandingReady(): boolean {
  return use(PublicBrandingReadyContext);
}

export function OrganizationBrandingProvider({ children }: { readonly children: ReactNode }) {
  const { session } = useAuth();
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);
  // Before sign-in the login screens still wear the organization's colours
  // (RAPP-626), read from the same public branding the player app uses.
  const [publicBranding, setPublicBranding] = useState<PublicOrganizationBranding | null>(null);
  const [publicBrandingReady, setPublicBrandingReady] = useState(false);

  useEffect(() => {
    if (session !== null) return undefined;
    let active = true;
    const settle = () => {
      if (active) setPublicBrandingReady(true);
    };
    const timeout = window.setTimeout(settle, PUBLIC_BRANDING_WAIT_MS);
    void fetchPublicOrganizationBranding(supabase, organizationSlug)
      .then((branding) => {
        if (active) setPublicBranding(branding);
      })
      .catch(() => {
        if (active) setPublicBranding(null);
      })
      .finally(settle);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [session]);

  useEffect(() => {
    let active = true;
    const loadOrganization = () => {
      void fetchOrganizationSettings(supabase)
        .then((next) => {
          if (active) setOrganization(next);
        })
        .catch(() => {
          if (active) setOrganization(null);
        });
    };
    if (session === null) {
      setOrganization(null);
      return undefined;
    }
    loadOrganization();
    window.addEventListener(ORGANIZATION_BRANDING_CHANGED_EVENT, loadOrganization);
    return () => {
      active = false;
      window.removeEventListener(ORGANIZATION_BRANDING_CHANGED_EVENT, loadOrganization);
    };
  }, [session]);

  const style = useMemo(
    () =>
      ({
        ...brandThemeVariables({
          primaryColor:
            organization?.primary_color ??
            publicBranding?.primary_color ??
            tokens.colors.primary.DEFAULT,
          secondaryColor:
            organization?.secondary_color ??
            publicBranding?.secondary_color ??
            tokens.colors.secondary.DEFAULT,
        }),
        // app.css resolves these at :root, before the brand variables above
        // exist, so they are declared again here or buttons and links keep the
        // default colour (RAPP-626).
        ...BRAND_ALIASES,
      }) as CSSProperties,
    [organization, publicBranding],
  );

  return (
    <AdminBrandingContext value={organization}>
      <PublicBrandingReadyContext value={session !== null || publicBrandingReady}>
        <div className="contents" style={style} data-testid="organization-theme-root">
          {children}
        </div>
      </PublicBrandingReadyContext>
    </AdminBrandingContext>
  );
}

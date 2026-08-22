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
  type OrganizationRow,
} from '@ramassa/shared/organization-settings';
import { tokens } from '@ramassa/shared/tokens';

const AdminBrandingContext = createContext<OrganizationRow | null>(null);

export const ORGANIZATION_BRANDING_CHANGED_EVENT = 'ramassa:organization-branding-changed';

export function useAdminBranding(): OrganizationRow | null {
  return use(AdminBrandingContext);
}

export function OrganizationBrandingProvider({ children }: { readonly children: ReactNode }) {
  const { session } = useAuth();
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);

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
      brandThemeVariables({
        primaryColor: organization?.primary_color ?? tokens.colors.primary.DEFAULT,
        secondaryColor: organization?.secondary_color ?? tokens.colors.secondary.DEFAULT,
      }) as CSSProperties,
    [organization],
  );

  return (
    <AdminBrandingContext value={organization}>
      <div className="contents" style={style} data-testid="organization-theme-root">
        {children}
      </div>
    </AdminBrandingContext>
  );
}

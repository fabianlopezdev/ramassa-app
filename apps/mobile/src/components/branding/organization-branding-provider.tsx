import { i18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { vars } from 'nativewind';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import {
  brandThemeVariables,
  fetchOrganizationSettings,
  fetchPublicOrganizationBranding,
  type OrganizationRow,
  type PublicOrganizationBranding,
} from '@ramassa/shared/organization-settings';
import { tokens } from '@ramassa/shared/tokens';

const fullScreenStyle = { flex: 1 } as const;
const organizationSlug = process.env.EXPO_PUBLIC_ORGANIZATION_SLUG?.trim() || 'ramassa';
const OrganizationBrandingContext = createContext<OrganizationRow | null>(null);

export function useOrganizationBranding(): OrganizationRow | null {
  return use(OrganizationBrandingContext);
}

export function OrganizationBrandingProvider({ children }: { readonly children: ReactNode }) {
  const { session } = useAuth();
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);
  const [publicBranding, setPublicBranding] = useState<PublicOrganizationBranding | null>(null);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;

    async function refreshPublicBranding() {
      const request = ++latestRequest;
      try {
        const next = await fetchPublicOrganizationBranding(supabase, organizationSlug);
        if (active && request === latestRequest) setPublicBranding(next);
      } catch {
        // Branding must never block entry when the network is unavailable.
      }
    }

    void refreshPublicBranding();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPublicBranding();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (session === null) {
      setOrganization(null);
      return undefined;
    }
    void fetchOrganizationSettings(supabase)
      .then((next) => {
        if (!active) return;
        setOrganization(next);
        if (
          !(next.available_languages as readonly string[]).includes(i18n.resolvedLanguage ?? '')
        ) {
          void i18n.changeLanguage(next.default_language);
        }
      })
      .catch(() => {
        if (active) setOrganization(null);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const themeStyle = useMemo(
    () =>
      vars(
        brandThemeVariables({
          primaryColor:
            organization?.primary_color ??
            publicBranding?.primary_color ??
            tokens.colors.primary.DEFAULT,
          secondaryColor:
            organization?.secondary_color ??
            publicBranding?.secondary_color ??
            tokens.colors.secondary.DEFAULT,
        }),
      ),
    [organization, publicBranding],
  );

  return (
    <OrganizationBrandingContext value={organization}>
      <View style={[fullScreenStyle, themeStyle]}>{children}</View>
    </OrganizationBrandingContext>
  );
}

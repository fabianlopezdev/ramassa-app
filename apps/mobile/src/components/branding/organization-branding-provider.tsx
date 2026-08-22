import { i18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { vars } from 'nativewind';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import {
  brandThemeVariables,
  fetchOrganizationSettings,
  type OrganizationRow,
} from '@ramassa/shared/organization-settings';
import { tokens } from '@ramassa/shared/tokens';

const fullScreenStyle = { flex: 1 } as const;
const OrganizationBrandingContext = createContext<OrganizationRow | null>(null);

export function useOrganizationBranding(): OrganizationRow | null {
  return use(OrganizationBrandingContext);
}

export function OrganizationBrandingProvider({ children }: { readonly children: ReactNode }) {
  const { session } = useAuth();
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);

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
          primaryColor: organization?.primary_color ?? tokens.colors.primary.DEFAULT,
          secondaryColor: organization?.secondary_color ?? tokens.colors.secondary.DEFAULT,
        }),
      ),
    [organization],
  );

  return (
    <OrganizationBrandingContext value={organization}>
      <View style={[fullScreenStyle, themeStyle]}>{children}</View>
    </OrganizationBrandingContext>
  );
}

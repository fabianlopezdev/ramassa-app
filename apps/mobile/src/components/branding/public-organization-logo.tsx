import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { mobileClientEnv } from '@/lib/supabase';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const logoStyle = { width: '100%', height: tokens.onboarding.logoHeight } as const;
const organizationSlug = process.env.EXPO_PUBLIC_ORGANIZATION_SLUG?.trim() || 'ramassa';

export function PublicOrganizationLogo() {
  const { t } = useTranslation('common');
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRevision((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);
  const origin = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
  if (origin === undefined) return null;
  return (
    <FadeSlideIn preset="logo" ready={loaded}>
      <Image
        key={revision}
        source={`${origin.replace(/\/+$/, '')}/branding/${encodeURIComponent(organizationSlug)}/logo`}
        accessibilityLabel={t('appName')}
        onLoad={() => setLoaded(true)}
        contentFit="contain"
        cachePolicy="none"
        style={logoStyle}
      />
    </FadeSlideIn>
  );
}

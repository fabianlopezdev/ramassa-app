/**
 * The club's logo, as the dashboard sets it, in every place the app shows it.
 *
 * - `onboarding`: full width above the language choice (RAPP-124). It reloads
 *   each time the app comes back to the front, so a new logo shows at once.
 * - `header`: beside "Hola" and her name at the top of Inici (RAPP-907).
 * - `footer`: at the foot of her profile, above the credits (RAPP-907).
 * - `backdrop`: large and faint behind the bubbles of a chat (RAPP-907). It is
 *   decoration only: screen readers skip it and touches pass through it.
 *
 * Inside the app the logo is kept in memory for the session, so a tab or a
 * chat that opens again shows it without a new download or a blink. The three
 * in-app places start on the club shield bundled with the app, so the logo is
 * there at once and with no connection; the dashboard's logo replaces it when
 * it loads. The bundled shield is its own image under the dashboard's, placed
 * exactly like it: an expo-image placeholder always sits centred, so in the
 * header it jumped sideways when the logo arrived (RAPP-947).
 */
import bundledClubLogo from '@/assets/images/ramassa-splash.png';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { mobileClientEnv } from '@/lib/supabase';
import { Image, type ImageContentPosition, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, I18nManager, StyleSheet, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

type OrganizationLogoVariant = 'onboarding' | 'header' | 'footer' | 'backdrop';

interface VariantLook {
  readonly style: ImageProps['style'];
  readonly cachePolicy: ImageProps['cachePolicy'];
  readonly decorative: boolean;
}

const VARIANT_LOOKS: Readonly<Record<OrganizationLogoVariant, VariantLook>> = {
  onboarding: {
    style: { width: '100%', height: tokens.onboarding.logoHeight },
    cachePolicy: 'none',
    decorative: false,
  },
  header: {
    style: { width: tokens.brandLogo.headerSize, height: tokens.brandLogo.headerSize },
    cachePolicy: 'memory',
    decorative: false,
  },
  footer: {
    style: { width: '100%', height: tokens.brandLogo.footerHeight },
    cachePolicy: 'memory',
    decorative: false,
  },
  backdrop: {
    style: { width: '100%', height: tokens.brandLogo.backdropHeight },
    cachePolicy: 'memory',
    decorative: true,
  },
};

const backdropStyles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing['2xl'],
    opacity: tokens.brandLogo.backdropOpacity,
  },
});

// A logo narrower than its square box sits against the start of the row, so
// it lines up with the page edge in both reading directions.
const headerContentPosition: ImageContentPosition = I18nManager.isRTL
  ? { right: 0, top: '50%' }
  : { left: 0, top: '50%' };

const BUNDLED_CLUB_LOGO = bundledClubLogo;

const organizationSlug = process.env.EXPO_PUBLIC_ORGANIZATION_SLUG?.trim() || 'ramassa';

export function PublicOrganizationLogo({
  variant = 'onboarding',
}: {
  readonly variant?: OrganizationLogoVariant;
}) {
  const { t } = useTranslation('common');
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const refreshesOnForeground = variant === 'onboarding';
  useEffect(() => {
    if (!refreshesOnForeground) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRevision((value) => value + 1);
    });
    return () => subscription.remove();
  }, [refreshesOnForeground]);
  const origin = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
  if (origin === undefined) return null;
  const look = VARIANT_LOOKS[variant];
  const startsOnBundledLogo = variant !== 'onboarding';
  const contentPosition = variant === 'header' ? headerContentPosition : 'center';
  const logo = (
    <FadeSlideIn
      preset="logo"
      ready={loaded || startsOnBundledLogo}
      className={variant === 'backdrop' ? 'w-full' : ''}
    >
      <View>
        {startsOnBundledLogo && !loaded ? (
          <Image
            testID="organization-logo-bundled"
            source={BUNDLED_CLUB_LOGO}
            accessible={false}
            contentFit="contain"
            contentPosition={contentPosition}
            style={[StyleSheet.absoluteFill, look.style]}
          />
        ) : null}
        <Image
          key={revision}
          source={`${origin.replace(/\/+$/, '')}/branding/${encodeURIComponent(organizationSlug)}/logo`}
          accessible={!look.decorative}
          accessibilityLabel={look.decorative ? undefined : t('appName')}
          onLoad={() => setLoaded(true)}
          contentFit="contain"
          contentPosition={contentPosition}
          cachePolicy={look.cachePolicy}
          transition={0}
          style={look.style}
        />
      </View>
    </FadeSlideIn>
  );
  if (!look.decorative) return logo;
  return (
    <View
      testID="organization-logo-backdrop"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={backdropStyles.layer}
    >
      {logo}
    </View>
  );
}

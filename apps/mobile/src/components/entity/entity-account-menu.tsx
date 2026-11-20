/**
 * The partner entity's settings and sign-out (RAPP-803), opened from a button
 * at the leading edge of every entity tab's header, on the phone and beside
 * the tablet sidebar alike. The sheet holds her language (the staff side's
 * three), the way to the app lock where the lock exists, and sign-out.
 */
import { GlassIconSurface } from '@/components/forms/glass-icon-surface';
import { Icon } from '@/components/icons/icon';
import { AppSheet } from '@/components/layout/app-sheet';
import { RaisedCard } from '@/components/layout/raised-card';
import { PressableScale } from '@/components/motion/pressable-scale';
import { LanguageSwitcher } from '@/components/profile/language-switcher';
import { useGuardedLogout } from '@/lib/sign-out-guard';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text } from 'react-native';
import { STAFF_LANGUAGES } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

export function EntityAccountButton() {
  const { t } = useTranslation('auth');
  const { t: tProfile } = useTranslation('profile');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const signOut = useGuardedLogout();
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);
  const title = t('teamSettingsTitle');

  return (
    <>
      <PressableScale
        testID="entity-account-button"
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={() => setIsOpen(true)}
        haptic="selection"
        className="rounded-full"
      >
        <GlassIconSurface>
          <Icon
            name="user-circle"
            weight="boldDuotone"
            size={tokens.fontSize.xl}
            color={tokens.colors.primary.dark}
          />
        </GlassIconSurface>
      </PressableScale>
      <AppSheet testID="entity-account-sheet" title={title} visible={isOpen} onClose={close}>
        <LanguageSwitcher languages={STAFF_LANGUAGES} />
        {/* The lock does not exist on the web. */}
        {Platform.OS === 'web' ? null : (
          <RaisedCard
            testID="open-app-lock"
            accessibilityLabel={t('appLockTitle')}
            onOpen={() => {
              close();
              push('/app-lock' as Href);
            }}
          >
            <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>
              {t('appLockTitle')}
            </Text>
          </RaisedCard>
        )}
        <RaisedCard
          testID="entity-sign-out"
          accessibilityLabel={tProfile('signOutAction')}
          onOpen={() => {
            close();
            signOut();
          }}
        >
          <Text className={`text-start text-md font-semibold text-primary-dark ${fontClass}`}>
            {tProfile('signOutAction')}
          </Text>
        </RaisedCard>
      </AppSheet>
    </>
  );
}

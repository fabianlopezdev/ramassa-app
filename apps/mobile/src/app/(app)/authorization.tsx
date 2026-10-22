/**
 * Ramassà's participation authorization for the season (RAPP-304).
 *
 * A player without a valid authorization sees only this screen. She reads the
 * text staff published (always visible), ticks each consent, gives the
 * medical answer, optionally an emergency contact, and draws her signature with
 * her finger. A player who cannot draw (a screen reader, a motor impairment)
 * signs with the ticks alone, and the record says so.
 */

import { AuthorizationForm } from '@/components/authorization/authorization-form';
import { ReregistrationSteps } from '@/components/authorization/reregistration-steps';
import { useAuthorizationStatus, useSignAuthorization } from '@/lib/authorization';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

export default function AuthorizationScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const fontClass = useLanguageFontClass();
  const router = useRouter();
  const language = (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca';
  const status = useAuthorizationStatus(true);
  const sign = useSignAuthorization();
  const [hasFailed, setHasFailed] = useState(false);
  // A returning player checks her details and answers the season questions
  // first (RAPP-306); a new player signs straight away.
  const [hasReregistered, setHasReregistered] = useState(false);

  if (status.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator
          accessibilityLabel={t('common:loading')}
          color={tokens.colors.primary.DEFAULT}
        />
      </View>
    );
  }
  const current = status.data;
  if (status.isError || current === null || current === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-50 p-lg">
        <Text selectable className={`text-center text-form text-neutral-700 ${fontClass}`}>
          {t('authorizationLoadFailed')}
        </Text>
      </SafeAreaView>
    );
  }
  if (current.isReturning && !hasReregistered) {
    return (
      <ReregistrationSteps
        seasonName={current.seasonName}
        texts={current.content.texts}
        onDone={() => setHasReregistered(true)}
      />
    );
  }

  return (
    <AuthorizationForm
      testID="authorization-screen"
      content={current.content}
      seasonName={current.seasonName}
      language={language}
      isBusy={sign.isPending}
      hasFailed={hasFailed}
      onSubmit={(signing) => {
        setHasFailed(false);
        sign.mutate(
          {
            versionId: current.versionId,
            content: current.content,
            signing,
            language,
            device: `${Platform.OS} ${String(Platform.Version)}`,
          },
          {
            onSuccess: () => {
              playHaptic('success');
              router.replace('/' as Href);
            },
            onError: () => {
              playHaptic('error');
              setHasFailed(true);
            },
          },
        );
      }}
    />
  );
}

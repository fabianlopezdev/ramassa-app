/**
 * Re-registration for a returning player (RAPP-306), before she signs the new
 * season's authorization: she checks her details ("Is this still correct?")
 * and can open her profile to correct them, then answers this season's
 * questions. Her answers are kept for this season; last season's stay as they
 * were.
 */

import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import { SeasonAnswerFields, type SeasonAnswers } from '@/components/profile/season-answer-fields';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { countryLabelForCanonical } from '@ramassa/shared/i18n/countries';
import { municipalityLabelForCanonical } from '@ramassa/shared/i18n/municipalities';
import { fetchOwnProfile } from '@ramassa/shared/profile';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { updateMySeasonAnswers } from '@ramassa/shared/seasons';
import { tokens } from '@ramassa/shared/tokens';

function ActionButton({
  label,
  onPress,
  isPrimary,
  isBusy = false,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly isPrimary: boolean;
  readonly isBusy?: boolean;
  readonly testID: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isBusy={isBusy}
      isDisabled={isBusy}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md px-lg ${
        isPrimary ? 'bg-primary' : 'border border-primary bg-white'
      }`}
    >
      <Text
        className={`text-center text-md font-bold ${
          isPrimary ? 'text-white' : 'text-primary-dark'
        } ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function ReregistrationSteps({
  seasonName,
  onDone,
}: {
  readonly seasonName: string;
  readonly onDone: () => void;
}) {
  const { t, i18n } = useTranslation(['onboarding', 'profile']);
  const fontClass = useLanguageFontClass();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca';
  const [phase, setPhase] = useState<'review' | 'season'>('review');
  const [answers, setAnswers] = useState<SeasonAnswers | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  // Read fresh: she may have just corrected her details on the profile screen.
  const profile = useQuery({
    queryKey: ['reregistration-profile', user?.id ?? 'signed-out'],
    queryFn: ({ signal }) => fetchOwnProfile(supabase, { signal }),
    refetchOnMount: 'always',
  });
  const save = useMutation({
    mutationFn: (value: SeasonAnswers) =>
      updateMySeasonAnswers(supabase, {
        applicantStatus: value.applicantStatus ?? undefined,
        supportingEntities: [...value.supportingEntities],
        childcareNeed: value.childcareNeed ?? undefined,
        specificNeeds: value.specificNeeds.trim() === '' ? undefined : value.specificNeeds,
      }),
  });

  const data = profile.data;
  if (profile.isPending || data === undefined || data === null) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      </View>
    );
  }
  const notGiven = t('profile:notProvided');
  const shown = (value: string | null | undefined) =>
    value === null || value === undefined || value === '' ? notGiven : value;
  const current: SeasonAnswers = answers ?? {
    applicantStatus: data.applicant_status ?? null,
    supportingEntities: data.supporting_entities ?? [],
    seasonNumber: null,
    childcareNeed: data.childcare_need ?? null,
    specificNeeds: data.specific_needs ?? '',
  };

  return (
    <SafeAreaView
      testID={`reregistration-${phase}`}
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <PageWidth className="gap-lg p-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('reregistrationTitle', { season: seasonName })}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {phase === 'review' ? t('reregistrationReviewIntro') : t('seasonStepIntro')}
            </Text>
          </View>

          {phase === 'review' ? (
            <>
              <ProfileSection title={t('summarySectionName')}>
                <ProfileRow label={t('firstNameLabel')} value={data.first_name} />
                <ProfileRow label={t('lastNameLabel')} value={data.last_name} />
                <ProfileRow label={t('dateOfBirthLabel')} value={shown(data.date_of_birth)} />
                <ProfileRow
                  label={t('nationalityLabel')}
                  value={shown(
                    data.nationality === null
                      ? null
                      : (countryLabelForCanonical(data.nationality, locale) ?? data.nationality),
                  )}
                />
              </ProfileSection>
              <ProfileSection title={t('logisticsTitle')}>
                <ProfileRow label={t('phoneLabel')} value={shown(data.phone)} />
                <ProfileRow label={t('addressLabel')} value={shown(data.address)} />
                <ProfileRow
                  label={t('cityLabel')}
                  value={shown(
                    data.city === null
                      ? null
                      : (municipalityLabelForCanonical(data.city, locale) ?? data.city),
                  )}
                />
                <ProfileRow label={t('clothingSizeLabel')} value={shown(data.clothing_size)} />
                <ProfileRow label={t('shoeSizeLabel')} value={shown(data.shoe_size)} />
              </ProfileSection>
              <ActionButton
                testID="reregistration-correct"
                label={t('reregistrationCorrect')}
                isPrimary
                onPress={() => setPhase('season')}
              />
              <ActionButton
                testID="reregistration-edit"
                label={t('reregistrationEdit')}
                isPrimary={false}
                onPress={() => router.push('/profile-edit' as Href)}
              />
            </>
          ) : (
            <>
              <SeasonAnswerFields
                testIDPrefix="reregistration"
                value={current}
                onChange={(patch) => setAnswers({ ...current, ...patch })}
                entityNames={[]}
                showSensitive
              />
              {hasFailed ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className={`text-start text-md text-error ${fontClass}`}
                >
                  {t('reregistrationSaveFailed')}
                </Text>
              ) : null}
              <ActionButton
                testID="reregistration-continue"
                label={t('continueAction')}
                isPrimary
                isBusy={save.isPending}
                onPress={() => {
                  setHasFailed(false);
                  save.mutate(current, {
                    onSuccess: onDone,
                    onError: () => {
                      playHaptic('error');
                      setHasFailed(true);
                    },
                  });
                }}
              />
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

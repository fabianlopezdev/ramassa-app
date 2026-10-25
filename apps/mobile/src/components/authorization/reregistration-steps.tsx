/**
 * Re-registration for a returning player (RAPP-306), before she signs the new
 * season's authorization: she checks her details ("Is this still correct?")
 * and can open her profile to correct them, then answers this season's
 * questions. Her answers are kept for this season; last season's stay as they
 * were.
 *
 * The Fitxa fields placed on the season form (RAPP-655) follow the built-in
 * ones, in their order and worded for her, and save with them. When they
 * cannot load, the built-in ones still work and the failure is logged.
 */

import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import {
  CustomQuestionList,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import {
  missingSeasonAnswers,
  SeasonAnswerFields,
  type SeasonAnswers,
  type SeasonQuestion,
} from '@/components/profile/season-answer-fields';
import { continuousCorners } from '@/lib/continuous-corners';
import { checkCustomAnswers } from '@/lib/custom-answer-errors';
import { playHaptic } from '@/lib/haptics/haptics';
import { logger } from '@/lib/observability';
import { customAnswersToSave, mergedCustomAnswers } from '@/lib/onboarding-intake';
import { useBuiltinWording } from '@/lib/onboarding-intake-context';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import {
  AUTHORIZATION_BUNDLED_TEXT_KEYS,
  authorizationWording,
  type AuthorizationContent,
  type AuthorizationTextField,
} from '@ramassa/shared/authorization';
import { toAppError } from '@ramassa/shared/errors';
import { countryLabelForCanonical } from '@ramassa/shared/i18n/countries';
import { municipalityLabelForCanonical } from '@ramassa/shared/i18n/municipalities';
import { isRequiredQuestion, type IntakeQuestion } from '@ramassa/shared/intake';
import {
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  requiredBuiltinQuestions,
  reregistrationAsks,
  seasonFormQuestions,
  type CustomAnswers,
  type IntakeCatalog,
  type SystemFieldIndex,
} from '@ramassa/shared/intake-builder';
import { fetchOwnProfile } from '@ramassa/shared/profile';
import { profileFormOf, type LanguageCode } from '@ramassa/shared/schemas';
import { mySeasonAnswers, updateMySeasonAnswers } from '@ramassa/shared/seasons';
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
  texts,
  onDone,
}: {
  readonly seasonName: string;
  /** The version's wording (RAPP-614); a field left out shows the app's text. */
  readonly texts?: AuthorizationContent['texts'];
  readonly onDone: () => void;
}) {
  const { t, i18n } = useTranslation(['onboarding', 'profile']);
  const fontClass = useLanguageFontClass();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca';
  const words = (field: AuthorizationTextField) =>
    (
      authorizationWording(texts, field, locale) ??
      t(AUTHORIZATION_BUNDLED_TEXT_KEYS.texts[field], { season: seasonName })
    ).replace(/\{\{\s*season\s*\}\}/gu, seasonName);
  const [phase, setPhase] = useState<'review' | 'season'>('review');
  const [answers, setAnswers] = useState<SeasonAnswers | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomAnswerDraft>({});
  // Each staff answer that does not fit its question, with the wizard's words (RAPP-610).
  const [customErrors, setCustomErrors] = useState<Readonly<Record<string, string>>>({});
  // The season questions staff made required (RAPP-611) that she left empty.
  const [missing, setMissing] = useState<ReadonlySet<SeasonQuestion>>(new Set());

  // Read fresh: she may have just corrected her details on the profile screen.
  const profile = useQuery({
    queryKey: ['reregistration-profile', user?.id ?? 'signed-out'],
    queryFn: ({ signal }) => fetchOwnProfile(supabase, { signal }),
    refetchOnMount: 'always',
  });
  // The staff questions never block her: a failed load reads as none.
  const staffQuestions = useQuery({
    queryKey: ['reregistration-staff-questions', user?.id ?? 'signed-out'],
    queryFn: async (): Promise<{ catalog: IntakeCatalog; answers: CustomAnswers }> => {
      try {
        const [catalog, answers] = await Promise.all([
          fetchIntakeCatalog(supabase),
          fetchMyCustomAnswers(supabase),
        ]);
        return { catalog, answers };
      } catch (error) {
        logger.warn('reregistration.catalog.load_failed', { error: toAppError(error) });
        return { catalog: EMPTY_INTAKE_CATALOG, answers: {} };
      }
    },
    refetchOnMount: 'always',
  });
  // Her answers are read and written by field, through her organization's fields (RAPP-663).
  const fields: SystemFieldIndex = profile.data?.fields ?? new Map();
  const catalog = staffQuestions.data?.catalog ?? EMPTY_INTAKE_CATALOG;
  const storedCustom = staffQuestions.data?.answers ?? {};
  const customQuestions = seasonFormQuestions(catalog);
  // The same hide rule as her wizard (RAPP-612): a hidden season screen hides its question here too.
  const asks = reregistrationAsks(catalog);
  const wording = useBuiltinWording(catalog);
  const save = useMutation({
    mutationFn: async ({
      season: value,
      custom,
    }: {
      readonly season: SeasonAnswers;
      readonly custom: CustomAnswerDraft;
    }) => {
      // The app's season questions and the team's, by field, in the one call
      // that ends her re-registration and re-checks every required answer
      // (RAPP-611, RAPP-663).
      await updateMySeasonAnswers(supabase, {
        ...mySeasonAnswers(fields, {
          applicantStatus: value.applicantStatus ?? undefined,
          supportingEntities: [...value.supportingEntities],
          childcareNeed: value.childcareNeed ?? undefined,
          specificNeeds: value.specificNeeds.trim() === '' ? undefined : value.specificNeeds,
        }),
        ...customAnswersToSave(customQuestions, custom, storedCustom),
      });
    },
  });

  const data = profile.data;
  const her = data === undefined || data === null ? null : profileFormOf(data);
  if (profile.isPending || staffQuestions.isPending || her === null) {
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
    applicantStatus: (her.applicantStatus as SeasonAnswers['applicantStatus']) ?? null,
    supportingEntities: her.supportingEntities,
    seasonNumber: null,
    childcareNeed: (her.childcareNeed as SeasonAnswers['childcareNeed']) ?? null,
    specificNeeds: her.specificNeeds ?? '',
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
              {words('reregistration_title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {phase === 'review'
                ? words('reregistration_intro')
                : words('reregistration_season_intro')}
            </Text>
          </View>

          {phase === 'review' ? (
            <>
              <ProfileSection title={t('summarySectionName')}>
                <ProfileRow label={t('firstNameLabel')} value={her.firstName} />
                <ProfileRow label={t('lastNameLabel')} value={her.lastName} />
                <ProfileRow label={t('dateOfBirthLabel')} value={shown(her.dateOfBirth)} />
                <ProfileRow
                  label={t('nationalityLabel')}
                  value={shown(
                    her.nationality === ''
                      ? null
                      : (countryLabelForCanonical(her.nationality, locale) ?? her.nationality),
                  )}
                />
              </ProfileSection>
              <ProfileSection title={t('logisticsTitle')}>
                <ProfileRow label={t('phoneLabel')} value={shown(her.phone)} />
                <ProfileRow label={t('addressLabel')} value={shown(her.address)} />
                <ProfileRow
                  label={t('cityLabel')}
                  value={shown(
                    her.city === undefined
                      ? null
                      : (municipalityLabelForCanonical(her.city, locale) ?? her.city),
                  )}
                />
                <ProfileRow label={t('clothingSizeLabel')} value={shown(her.clothingSize)} />
                <ProfileRow label={t('shoeSizeLabel')} value={shown(her.shoeSize)} />
              </ProfileSection>
              <ActionButton
                testID="reregistration-correct"
                label={words('reregistration_correct_label')}
                isPrimary
                onPress={() => setPhase('season')}
              />
              <ActionButton
                testID="reregistration-edit"
                label={words('reregistration_edit_label')}
                isPrimary={false}
                onPress={() => router.push('/profile-edit' as Href)}
              />
            </>
          ) : (
            <>
              <SeasonAnswerFields
                testIDPrefix="reregistration"
                value={current}
                missing={missing}
                onChange={(patch) => {
                  setAnswers({ ...current, ...patch });
                  setMissing(new Set());
                }}
                entityNames={[]}
                showSensitive
                shows={(question: IntakeQuestion) => asks(question)}
                wording={wording}
              />
              <CustomQuestionList
                testID="reregistration-fields"
                questions={customQuestions}
                answers={mergedCustomAnswers(storedCustom, customDraft)}
                errors={customErrors}
                onChange={(questionId, value) => {
                  setCustomDraft((current) => ({ ...current, [questionId]: value }));
                  setCustomErrors((current) =>
                    current[questionId] === undefined
                      ? current
                      : Object.fromEntries(
                          Object.entries(current).filter(([id]) => id !== questionId),
                        ),
                  );
                }}
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
                label={words('continue_label')}
                isPrimary
                isBusy={save.isPending}
                onPress={() => {
                  setHasFailed(false);
                  // The same check and words as her wizard: nothing is sent
                  // while an answer does not fit its question.
                  const checked = checkCustomAnswers(
                    customQuestions,
                    mergedCustomAnswers(storedCustom, customDraft),
                    t,
                  );
                  setCustomErrors(checked.errors);
                  const required = requiredBuiltinQuestions(catalog);
                  const unanswered = missingSeasonAnswers(
                    current,
                    (question) => asks(question) && isRequiredQuestion(question, required),
                  );
                  setMissing(unanswered);
                  if (Object.keys(checked.errors).length > 0 || unanswered.size > 0) {
                    playHaptic('warning');
                    return;
                  }
                  // Tidied as the wizard does: a phone without separators.
                  const tidied: CustomAnswerDraft = Object.fromEntries(
                    Object.entries(customDraft).map(([id, value]) => [
                      id,
                      checked.answers[id] ?? value,
                    ]),
                  );
                  setCustomDraft(tidied);
                  save.mutate(
                    { season: current, custom: tidied },
                    {
                      onSuccess: onDone,
                      onError: () => {
                        playHaptic('error');
                        setHasFailed(true);
                      },
                    },
                  );
                }}
              />
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

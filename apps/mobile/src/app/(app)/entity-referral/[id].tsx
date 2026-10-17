/**
 * One referral on the phone (RAPP-413), as the web portal's referral page:
 * the referred woman with her status, the contact details the entity sent,
 * and the updates shared with the team, newest first. Once the team has
 * welcomed her and she has an account, the entity shares a new update with
 * its type (housing, documentation, education, employment, health or other)
 * and what changed; before that a note says when updates open.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useEntityReferral, useReferralActions } from '@/lib/entity-referrals';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { countryLabelForCanonical } from '@ramassa/shared/i18n/countries';
import { municipalityLabelForCanonical } from '@ramassa/shared/i18n/municipalities';
import { REFERRAL_UPDATE_TYPES } from '@ramassa/shared/referrals';
import type { ReferralAnswers } from '@ramassa/shared/referrals';

type UpdateType = (typeof REFERRAL_UPDATE_TYPES)[number];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-xs" accessible accessibilityLabel={`${label}: ${value}`}>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{label}</Text>
      <Text className="text-start text-md text-neutral-900">{value}</Text>
    </View>
  );
}

/** The season answers as label and value rows, skipping what was not given. */
function referralAnswerRows(
  answers: ReferralAnswers,
  t: (key: string) => string,
  locale: string,
): readonly { readonly label: string; readonly value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const add = (labelKey: string, value: string | null) => {
    if (value !== null && value !== '') rows.push({ label: t(labelKey), value });
  };
  const language = locale as SupportedLanguage;
  add('onboarding:dateOfBirthLabel', answers.dateOfBirth);
  add(
    'onboarding:nationalityLabel',
    answers.nationality === null
      ? null
      : (countryLabelForCanonical(answers.nationality, language) ?? answers.nationality),
  );
  add(
    'onboarding:documentTypeLabel',
    answers.documentType === null ? null : t(DOCUMENT_TYPE_KEYS[answers.documentType]),
  );
  add('onboarding:documentNumberLabel', answers.documentNumber);
  add(
    'onboarding:cityLabel',
    answers.city === null
      ? null
      : (municipalityLabelForCanonical(answers.city, language) ?? answers.city),
  );
  add(
    'onboarding:applicantStatusLabel',
    answers.applicantStatus === null ? null : t(APPLICANT_STATUS_KEYS[answers.applicantStatus]),
  );
  add(
    'onboarding:supportingEntitiesLabel',
    answers.supportingEntities.length === 0 ? null : answers.supportingEntities.join(', '),
  );
  add('onboarding:referenceContactNameLabel', answers.referenceContactName);
  add(
    'onboarding:seasonNumberLabel',
    answers.seasonNumber === null ? null : t(`onboarding:seasonNumber${answers.seasonNumber}`),
  );
  add(
    'onboarding:childcareNeedLabel',
    answers.childcareNeed === null ? null : t(CHILDCARE_KEYS[answers.childcareNeed]),
  );
  add('onboarding:specificNeedsLabel', answers.specificNeeds);
  return rows;
}

const DOCUMENT_TYPE_KEYS = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
} as const;

const APPLICANT_STATUS_KEYS = {
  asylum_seeker: 'onboarding:applicantStatusAsylumSeeker',
  refugee: 'onboarding:applicantStatusRefugee',
  migrant: 'onboarding:applicantStatusMigrant',
  other: 'onboarding:applicantStatusOther',
  prefer_not_to_say: 'onboarding:applicantStatusPreferNotToSay',
} as const;

const CHILDCARE_KEYS = {
  yes: 'onboarding:childcareNeedYes',
  no: 'onboarding:childcareNeedNo',
  maybe: 'onboarding:childcareNeedMaybe',
} as const;

export default function EntityReferralScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(['referrals', 'onboarding']);
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { referral, updates } = useEntityReferral(id);
  const { addUpdate } = useReferralActions();
  const [updateType, setUpdateType] = useState<UpdateType>('documentation');
  const [content, setContent] = useState('');
  const [hasFailed, setHasFailed] = useState(false);
  const dates = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const data = referral.data;
  const canShare = content.trim().length > 0 && !addUpdate.isPending;

  return (
    <SafeAreaView
      testID="entity-referral"
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
          <PressableScale
            testID="entity-referral-back"
            accessibilityLabel={t('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('back')}</Text>
          </PressableScale>
          {data === undefined ? null : (
            <>
              <View className="gap-xs">
                <Text
                  accessibilityRole="header"
                  className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
                >
                  {`${data.referredFirstName} ${data.referredLastName}`.trim()}
                </Text>
                <Text
                  testID="entity-referral-status"
                  className={`text-start text-md font-semibold text-neutral-700 ${fontClass}`}
                >
                  {t(`status.${data.status}`)}
                </Text>
              </View>

              <Section title={t('contactTitle')}>
                {data.referredPhone === null ? null : (
                  <Detail label={t('phone')} value={data.referredPhone} />
                )}
                {data.referredEmail === null ? null : (
                  <Detail label={t('email')} value={data.referredEmail} />
                )}
                <Detail
                  label={t('documentationLabel')}
                  value={t(`documentation.${data.documentationStatus}`)}
                />
                <Detail label={t('createdLabel')} value={dates.format(new Date(data.createdAt))} />
                {data.notes === null ? null : <Detail label={t('notes')} value={data.notes} />}
              </Section>

              {/* What the entity sent, while the referral is pending (RAPP-303). */}
              {data.answers === null ? null : (
                <Section title={t('onboarding:seasonSectionTitle')}>
                  {referralAnswerRows(data.answers, t, i18n.resolvedLanguage ?? 'ca').map((row) => (
                    <Detail key={row.label} label={row.label} value={row.value} />
                  ))}
                </Section>
              )}

              <Section title={t('updatesTitle')}>
                {data.referredProfileId === null ? (
                  <Text
                    testID="entity-referral-updates-locked"
                    className={`text-start text-md text-neutral-600 ${fontClass}`}
                  >
                    {t('updatesAfterOnboarding')}
                  </Text>
                ) : (
                  <>
                    <Text
                      className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}
                    >
                      {t('updateType')}
                    </Text>
                    <View className="flex-row flex-wrap gap-sm">
                      {REFERRAL_UPDATE_TYPES.map((type) => (
                        <ChoiceOption
                          key={type}
                          testID={`entity-referral-update-type-${type}`}
                          value={type}
                          label={t(`updateTypes.${type}`)}
                          selected={type === updateType}
                          onSelect={(next) => {
                            setHasFailed(false);
                            setUpdateType(next);
                          }}
                          languageFontClass={fontClass}
                        />
                      ))}
                    </View>
                    <AuthTextField
                      testID="entity-referral-update-content"
                      label={t('updateContent')}
                      value={content}
                      onChangeText={(next) => {
                        setHasFailed(false);
                        setContent(next);
                      }}
                      multiline
                      maxLength={4000}
                    />
                    {hasFailed ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        className={`text-start text-md text-error ${fontClass}`}
                      >
                        {t('updateError')}
                      </Text>
                    ) : null}
                    <PressableScale
                      testID="entity-referral-update-submit"
                      accessibilityRole="button"
                      accessibilityLabel={t('updateSubmit')}
                      onPress={() =>
                        addUpdate.mutate(
                          { referralId: data.id, update: { updateType, content } },
                          {
                            onSuccess: () => {
                              playHaptic('success');
                              setContent('');
                            },
                            onError: () => {
                              playHaptic('error');
                              setHasFailed(true);
                            },
                          },
                        )
                      }
                      isBusy={addUpdate.isPending}
                      isDisabled={!canShare}
                      haptic="tapLight"
                      style={continuousCorners}
                      className={`min-h-recommended items-center justify-center rounded-md px-lg ${
                        canShare ? 'bg-primary' : 'bg-neutral-200'
                      }`}
                    >
                      <Text
                        className={`text-center text-md font-bold ${canShare ? 'text-white' : 'text-neutral-500'} ${fontClass}`}
                      >
                        {t('updateSubmit')}
                      </Text>
                    </PressableScale>
                  </>
                )}

                {(updates.data ?? []).length === 0 ? (
                  <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                    {t('noUpdates')}
                  </Text>
                ) : (
                  (updates.data ?? []).map((update) => (
                    <View
                      key={update.id}
                      testID={`entity-referral-update-${update.id}`}
                      style={continuousCorners}
                      className="gap-xs rounded-md bg-neutral-50 p-md"
                    >
                      <View className="flex-row flex-wrap items-center justify-between gap-sm">
                        <Text
                          className={`text-start text-sm font-semibold text-neutral-800 ${fontClass}`}
                        >
                          {t(`updateTypes.${update.updateType}`)}
                        </Text>
                        <Text className={`text-sm tabular-nums text-neutral-600 ${fontClass}`}>
                          {dates.format(new Date(update.createdAt))}
                        </Text>
                      </View>
                      <Text className="text-start text-md text-neutral-900">{update.content}</Text>
                      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                        {update.authorName}
                      </Text>
                    </View>
                  ))
                )}
              </Section>
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

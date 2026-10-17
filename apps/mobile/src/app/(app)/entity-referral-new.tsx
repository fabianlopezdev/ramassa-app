/**
 * A new referral from the phone (RAPP-413), as the web portal's referral form:
 * first and last name, an optional phone and email, the documentation status
 * and optional notes. Since RAPP-303 it also asks the season registration
 * questions entities answered in their own form until now, every one optional,
 * and the entity confirms she agreed to share her data. A field the form
 * refuses says why until it changes; once sent, the referral opens.
 *
 * The questions staff added for the referral form (RAPP-307) follow, grouped
 * by screen. Their answers are saved right after the referral; when that
 * fails, the form says the referral is saved and offers to try again.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { CountryPicker } from '@/components/onboarding/country-picker';
import {
  CustomQuestionSections,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { MunicipalityPicker } from '@/components/onboarding/municipality-picker';
import { OptionChip } from '@/components/onboarding/option-chip';
import { BirthDateField } from '@/components/profile/profile-form-fields';
import {
  EMPTY_SEASON_ANSWERS,
  SeasonAnswerFields,
  type SeasonAnswers,
} from '@/components/profile/season-answer-fields';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  useReferralActions,
  useReferralQuestions,
  useSupportingEntityNames,
} from '@/lib/entity-referrals';
import { playHaptic } from '@/lib/haptics/haptics';
import { customAnswersToSave } from '@/lib/onboarding-intake';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createReferralSchema,
  DOCUMENTATION_STATUSES,
  type CreateReferralInput,
} from '@ramassa/shared/referrals';
import { DOCUMENT_TYPES, type DocumentType } from '@ramassa/shared/schemas';

type Field =
  'firstName' | 'lastName' | 'email' | 'dateOfBirth' | 'documentNumber' | 'consentConfirmed';

const FIELDS: readonly Field[] = [
  'firstName',
  'lastName',
  'email',
  'dateOfBirth',
  'documentNumber',
  'consentConfirmed',
];

const DOCUMENT_TYPE_KEYS: Readonly<Record<DocumentType, string>> = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
};

/** The form's own state; the season answers are kept in the block's shape. */
interface FormState {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email: string;
  readonly documentationStatus: CreateReferralInput['documentationStatus'];
  readonly notes: string;
  readonly dateOfBirth: string;
  readonly nationality: string;
  readonly documentType: DocumentType | null;
  readonly documentNumber: string;
  readonly city: string;
  readonly referenceContactName: string;
  readonly season: SeasonAnswers;
  readonly consentConfirmed: boolean;
}

function toInput(form: FormState): Record<string, unknown> {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    email: form.email,
    documentationStatus: form.documentationStatus,
    notes: form.notes,
    dateOfBirth: form.dateOfBirth,
    nationality: form.nationality,
    documentType: form.documentType ?? '',
    documentNumber: form.documentNumber,
    city: form.city,
    referenceContactName: form.referenceContactName,
    applicantStatus: form.season.applicantStatus ?? '',
    supportingEntities: form.season.supportingEntities,
    seasonNumber: form.season.seasonNumber ?? '',
    childcareNeed: form.season.childcareNeed ?? '',
    specificNeeds: form.season.specificNeeds,
    consentConfirmed: form.consentConfirmed,
  };
}

export default function EntityReferralNewScreen() {
  const { t } = useTranslation(['referrals', 'onboarding']);
  const entityNames = useSupportingEntityNames();
  const fontClass = useLanguageFontClass();
  const { back, replace } = useRouter();
  const { create, saveAnswers } = useReferralActions();
  const questions = useReferralQuestions();
  const customScreens = questions.data ?? [];
  const [customAnswers, setCustomAnswers] = useState<CustomAnswerDraft>({});
  // Set when the referral is saved and its custom answers are not.
  const [savedReferralId, setSavedReferralId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    documentationStatus: 'none',
    notes: '',
    dateOfBirth: '',
    nationality: '',
    documentType: null,
    documentNumber: '',
    city: '',
    referenceContactName: '',
    season: EMPTY_SEASON_ANSWERS,
    consentConfirmed: false,
  });
  const [invalid, setInvalid] = useState<ReadonlySet<Field>>(new Set());
  const [hasFailed, setHasFailed] = useState(false);
  const set = (patch: Partial<FormState>) => {
    setHasFailed(false);
    setInvalid((current) => {
      const next = new Set(current);
      for (const field of Object.keys(patch)) next.delete(field as Field);
      return next.size === current.size ? current : next;
    });
    setForm((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    const parsed = createReferralSchema.safeParse(toInput(form));
    if (!parsed.success) {
      setInvalid(
        new Set(
          parsed.error.issues
            .map((issue) => issue.path[0])
            .filter((path): path is Field => FIELDS.includes(path as Field)),
        ),
      );
      playHaptic('warning');
      return;
    }
    setInvalid(new Set());
    create.mutate(parsed.data, {
      onSuccess: (referralId) => saveCustomAnswers(referralId),
      onError: () => {
        playHaptic('error');
        setHasFailed(true);
      },
    });
  };

  const openReferral = (referralId: string) => replace(`/entity-referral/${referralId}` as Href);

  function saveCustomAnswers(referralId: string) {
    const answers = customAnswersToSave(customScreens, customAnswers, {});
    if (Object.keys(answers).length === 0) {
      playHaptic('success');
      openReferral(referralId);
      return;
    }
    saveAnswers.mutate(
      { referralId, answers },
      {
        onSuccess: () => {
          playHaptic('success');
          openReferral(referralId);
        },
        onError: () => {
          playHaptic('error');
          setSavedReferralId(referralId);
        },
      },
    );
  }

  const ERROR_KEYS: Readonly<Record<Field, string>> = {
    firstName: 'referrals:requiredError',
    lastName: 'referrals:requiredError',
    email: 'referrals:emailError',
    dateOfBirth: 'referrals:dateOfBirthError',
    documentNumber: 'referrals:documentNumberError',
    consentConfirmed: 'referrals:consentRequired',
  };
  const errorFor = (field: Field) => (invalid.has(field) ? t(ERROR_KEYS[field]) : undefined);

  return (
    <SafeAreaView
      testID="entity-referral-form"
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
            testID="entity-referral-form-back"
            accessibilityLabel={t('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('back')}</Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('formTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('formIntro')}
            </Text>
          </View>
          <AuthTextField
            testID="entity-referral-first-name"
            label={t('firstName')}
            value={form.firstName}
            onChangeText={(firstName) => set({ firstName })}
            errorMessage={errorFor('firstName')}
            maxLength={100}
          />
          <AuthTextField
            testID="entity-referral-last-name"
            label={t('lastName')}
            value={form.lastName}
            onChangeText={(lastName) => set({ lastName })}
            errorMessage={errorFor('lastName')}
            maxLength={100}
          />
          <AuthTextField
            testID="entity-referral-phone"
            label={t('phone')}
            value={form.phone ?? ''}
            onChangeText={(phone) => set({ phone })}
            keyboardType="phone-pad"
            maxLength={50}
          />
          <AuthTextField
            testID="entity-referral-email"
            label={t('email')}
            value={form.email ?? ''}
            onChangeText={(email) => set({ email })}
            errorMessage={errorFor('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
          />
          <View className="gap-sm">
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('documentationLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {DOCUMENTATION_STATUSES.map((status) => (
                <ChoiceOption
                  key={status}
                  testID={`entity-referral-documentation-${status}`}
                  value={status}
                  label={t(`documentation.${status}`)}
                  selected={status === form.documentationStatus}
                  onSelect={(documentationStatus) => set({ documentationStatus })}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </View>
          <AuthTextField
            testID="entity-referral-notes"
            label={t('notes')}
            value={form.notes ?? ''}
            onChangeText={(notes) => set({ notes })}
            multiline
            maxLength={4000}
          />

          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('onboarding:seasonSectionTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('referrals:seasonSectionIntro')}
            </Text>
          </View>
          <BirthDateField
            testIDPrefix="entity-referral"
            value={form.dateOfBirth}
            onChange={(dateOfBirth) => set({ dateOfBirth })}
            errorMessage={errorFor('dateOfBirth')}
          />
          <CountryPicker
            label={t('onboarding:nationalityLabel')}
            value={form.nationality}
            onChange={(nationality) => set({ nationality })}
          />
          <View className="gap-sm">
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('onboarding:documentTypeLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {DOCUMENT_TYPES.map((type) => (
                <OptionChip
                  key={type}
                  testID={`entity-referral-document-${type}`}
                  label={t(DOCUMENT_TYPE_KEYS[type])}
                  accessibilityHint={t('onboarding:documentTypeLabel')}
                  isSelected={form.documentType === type}
                  onPress={() => set({ documentType: form.documentType === type ? null : type })}
                />
              ))}
            </View>
          </View>
          {form.documentType === null || form.documentType === 'none' ? null : (
            <AuthTextField
              testID="entity-referral-document-number"
              label={t('onboarding:documentNumberLabel')}
              value={form.documentNumber}
              onChangeText={(documentNumber) => set({ documentNumber })}
              errorMessage={errorFor('documentNumber')}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={50}
            />
          )}
          <MunicipalityPicker
            label={t('onboarding:cityLabel')}
            value={form.city}
            onChange={(city) => set({ city })}
          />
          <AuthTextField
            testID="entity-referral-contact-name"
            label={t('onboarding:referenceContactNameLabel')}
            value={form.referenceContactName}
            onChangeText={(referenceContactName) => set({ referenceContactName })}
            maxLength={200}
          />
          <SeasonAnswerFields
            testIDPrefix="entity-referral"
            value={form.season}
            onChange={(patch) => set({ season: { ...form.season, ...patch } })}
            entityNames={entityNames.data ?? []}
            showSensitive
            showSeasonNumber
          />

          {customScreens.length === 0 ? null : (
            <View className="gap-lg">
              <Text
                accessibilityRole="header"
                className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
              >
                {t('onboarding:customQuestionsTitle')}
              </Text>
              <CustomQuestionSections
                screens={customScreens}
                answers={customAnswers}
                onChange={(questionId, value) =>
                  setCustomAnswers((current) => ({ ...current, [questionId]: value }))
                }
              />
            </View>
          )}

          <View className="gap-xs">
            <OptionChip
              testID="entity-referral-consent"
              label={t('referrals:consentLabel')}
              isSelected={form.consentConfirmed}
              onPress={() => set({ consentConfirmed: !form.consentConfirmed })}
            />
            {errorFor('consentConfirmed') === undefined ? null : (
              <Text
                accessibilityLiveRegion="polite"
                className={`text-start text-sm text-error ${fontClass}`}
              >
                {errorFor('consentConfirmed')}
              </Text>
            )}
            <Text className={`text-start text-sm text-neutral-500 ${fontClass}`}>
              {t('referrals:privacyNote')}
            </Text>
          </View>
          {hasFailed ? (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-start text-md text-error ${fontClass}`}
            >
              {t('saveError')}
            </Text>
          ) : null}
          {savedReferralId === null ? (
            <PressableScale
              testID="entity-referral-save"
              accessibilityRole="button"
              accessibilityLabel={t('save')}
              onPress={submit}
              isBusy={create.isPending || saveAnswers.isPending}
              isDisabled={create.isPending || saveAnswers.isPending}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {t('save')}
              </Text>
            </PressableScale>
          ) : (
            // The referral exists: saving the form again would send it twice.
            <View className="gap-sm">
              <Text
                testID="entity-referral-custom-answers-failed"
                accessibilityLiveRegion="polite"
                className={`text-start text-md text-error ${fontClass}`}
              >
                {t('onboarding:customReferralAnswersFailed')}
              </Text>
              <PressableScale
                testID="entity-referral-custom-answers-retry"
                accessibilityRole="button"
                accessibilityLabel={t('onboarding:customReferralRetryAction')}
                onPress={() => saveCustomAnswers(savedReferralId)}
                isBusy={saveAnswers.isPending}
                isDisabled={saveAnswers.isPending}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
              >
                <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                  {t('onboarding:customReferralRetryAction')}
                </Text>
              </PressableScale>
              <PressableScale
                testID="entity-referral-open-saved"
                accessibilityRole="button"
                accessibilityLabel={t('onboarding:customReferralOpenAction')}
                onPress={() => openReferral(savedReferralId)}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-primary bg-white px-lg"
              >
                <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                  {t('onboarding:customReferralOpenAction')}
                </Text>
              </PressableScale>
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

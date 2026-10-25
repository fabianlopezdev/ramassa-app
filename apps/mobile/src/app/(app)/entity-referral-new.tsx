/**
 * A new referral from the phone (RAPP-413), as the web portal's referral form
 * (RAPP-652, RAPP-655): the Fitxa fields staff placed on the form, in their
 * order, worded for the entity and marked when required, then the referral's
 * own parts (her address, her documentation, her season, the entity's notes)
 * and her consent. The answers to Ramassà's own fields travel with the
 * referral in one call, so it is never saved without them, and the database
 * checks every required field again. A field the form refuses says why until
 * it changes; once sent, the referral opens.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import {
  ReferralBuiltinField,
  type ReferralCheckedField,
} from '@/components/entity/referral-builtin-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { OptionChip } from '@/components/onboarding/option-chip';
import {
  EMPTY_SEASON_ANSWERS,
  SeasonAnswerFields,
  type SeasonAnswers,
} from '@/components/profile/season-answer-fields';
import { continuousCorners } from '@/lib/continuous-corners';
import { checkCustomAnswers } from '@/lib/custom-answer-errors';
import {
  useReferralActions,
  useReferralFormItems,
  useSupportingEntityNames,
} from '@/lib/entity-referrals';
import { playHaptic } from '@/lib/haptics/haptics';
import { customAnswersToSave } from '@/lib/onboarding-intake';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  entityFormQuestions,
  isCustomQuestionVisible,
  missingEntityFormFields,
  updateCustomAnswer,
  type BuilderText,
  type CustomQuestion,
  type EntityFormItem,
} from '@ramassa/shared/intake-builder';
import {
  createReferralSchema,
  DOCUMENTATION_STATUSES,
  referralSystemValues,
  type CreateReferralInput,
} from '@ramassa/shared/referrals';
import type { DocumentType } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

/** Only the season number is asked here: the season questions are placed fields. */
const hidesSeasonQuestions = () => false;

type Field = ReferralCheckedField | 'email' | 'consentConfirmed';

const FIELDS: readonly Field[] = [
  'firstName',
  'lastName',
  'email',
  'dateOfBirth',
  'documentNumber',
  'consentConfirmed',
];

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

/** A required Ramassà field reads with an asterisk, as on the portal. */
function markedRequired(item: Extract<EntityFormItem, { kind: 'custom' }>): CustomQuestion {
  if (!item.placement.required) return item.question;
  const label = Object.fromEntries(
    Object.entries(item.question.label).map(([language, text]) => [language, `${text} *`]),
  ) as BuilderText;
  return { ...item.question, label };
}

export default function EntityReferralNewScreen() {
  const { t } = useTranslation(['referrals', 'onboarding']);
  const { language } = useLanguage();
  const entityNames = useSupportingEntityNames();
  const fontClass = useLanguageFontClass();
  const { back, replace } = useRouter();
  const { create } = useReferralActions();
  const formItems = useReferralFormItems();
  const items = useMemo(() => formItems.data ?? [], [formItems.data]);
  const questions = useMemo(() => entityFormQuestions(items), [items]);
  const [customAnswers, setCustomAnswers] = useState<CustomAnswerDraft>({});
  // Each Ramassà answer that does not fit its field, with the wizard's words (RAPP-610).
  const [customErrors, setCustomErrors] = useState<Readonly<Record<string, string>>>({});
  // The required fields left empty, by field id.
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
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
    const next = { ...form, ...patch };
    setForm(next);
    // A required field she filled in no longer says it is missing.
    setMissing((current) =>
      current.size === 0
        ? current
        : new Set(
            missingEntityFormFields(
              items,
              referralSystemValues(toInput(next)),
              customAnswers,
            ).filter((id) => current.has(id)),
          ),
    );
  };

  const submit = () => {
    const input = toInput(form);
    const parsed = createReferralSchema.safeParse(input);
    // The Ramassà fields are checked with the same words as her wizard; a
    // required field left empty says so, as the database would refuse it.
    const checked = checkCustomAnswers(questions, customAnswers, t, { enforceRequired: false });
    const empty = new Set(
      missingEntityFormFields(items, referralSystemValues(input), checked.answers),
    );
    setCustomErrors(checked.errors);
    setMissing(empty);
    const fieldsFit = Object.keys(checked.errors).length === 0 && empty.size === 0;
    if (fieldsFit) setCustomAnswers(checked.answers);
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
    if (!fieldsFit) {
      playHaptic('warning');
      return;
    }
    create.mutate(
      { referral: parsed.data, fields: customAnswersToSave(questions, checked.answers, {}) },
      {
        onSuccess: (referralId) => {
          playHaptic('success');
          replace(`/entity-referral/${referralId}` as Href);
        },
        onError: () => {
          playHaptic('error');
          setHasFailed(true);
        },
      },
    );
  };

  const changeAnswer = (questionId: string, value: CustomAnswerDraft[string]) => {
    setHasFailed(false);
    setCustomAnswers((current) => updateCustomAnswer(questions, current, questionId, value));
    setCustomErrors((current) =>
      current[questionId] === undefined
        ? current
        : Object.fromEntries(Object.entries(current).filter(([id]) => id !== questionId)),
    );
    setMissing((current) => {
      if (!current.has(questionId)) return current;
      const next = new Set(current);
      next.delete(questionId);
      return next;
    });
  };

  const ERROR_KEYS: Readonly<Record<Field, string>> = {
    firstName: 'referrals:requiredError',
    lastName: 'referrals:requiredError',
    email: 'referrals:emailError',
    dateOfBirth: 'referrals:dateOfBirthError',
    documentNumber: 'referrals:documentNumberError',
    consentConfirmed: 'referrals:consentRequired',
  };
  const errorFor = (field: Field) => (invalid.has(field) ? t(ERROR_KEYS[field]) : undefined);

  if (formItems.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator
          accessibilityLabel={t('formTitle')}
          color={tokens.colors.primary.DEFAULT}
        />
      </View>
    );
  }

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
            accessibilityRole="button"
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

          {items.map((item) => {
            if (item.kind === 'builtin') {
              return (
                <ReferralBuiltinField
                  key={item.placement.id}
                  item={item}
                  values={form}
                  onChange={set}
                  errorFor={errorFor}
                  isMissing={missing.has(item.field.id)}
                  language={language}
                  entityNames={entityNames.data ?? []}
                />
              );
            }
            if (!isCustomQuestionVisible(item.question, customAnswers)) return null;
            return (
              <CustomQuestionField
                key={item.placement.id}
                question={markedRequired(item)}
                value={customAnswers[item.field.id]}
                errorMessage={
                  customErrors[item.field.id] ??
                  (missing.has(item.field.id) ? t('requiredError') : undefined)
                }
                onChange={(value) => changeAnswer(item.field.id, value)}
              />
            );
          })}

          <AuthTextField
            testID="entity-referral-email"
            label={t('email')}
            value={form.email}
            onChangeText={(email) => set({ email })}
            errorMessage={errorFor('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
          />
          <View className="gap-sm">
            <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
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
          <SeasonAnswerFields
            testIDPrefix="entity-referral"
            value={form.season}
            onChange={(patch) => set({ season: { ...form.season, ...patch } })}
            entityNames={[]}
            showSensitive={false}
            showSeasonNumber
            shows={hidesSeasonQuestions}
          />
          <AuthTextField
            testID="entity-referral-notes"
            label={t('notes')}
            value={form.notes}
            onChangeText={(notes) => set({ notes })}
            multiline
            maxLength={4000}
          />

          <View className="gap-xs">
            <OptionChip
              testID="entity-referral-consent"
              label={t('consentLabel')}
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
              {t('privacyNote')}
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
          <PressableScale
            testID="entity-referral-save"
            accessibilityRole="button"
            accessibilityLabel={t('save')}
            onPress={submit}
            isBusy={create.isPending}
            isDisabled={create.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('save')}
            </Text>
          </PressableScale>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

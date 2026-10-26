/**
 * A question staff added in the question builder (RAPP-307), with the control
 * its type needs (RAPP-610), each one the control the app's own screens use
 * for that kind of answer, so a staff question looks like the rest:
 *
 *   - short and long text: the form text field and area;
 *   - a number, a phone, an email: the form text field with the right keyboard;
 *   - a date: day, month and year fields, as her date of birth;
 *   - yes / no / maybe, yes / no, a choice: option chips; several: chips too;
 *   - a long list: the searchable picker, as her country;
 *   - a country, a municipality of Catalonia: the app's own pickers, the
 *     ones of her nationality and her municipality (RAPP-663);
 *   - a list she adds to: the supporting organizations list;
 *   - a file: a photo or a PDF, uploaded to her private folder.
 *
 * A signature is no question: it is a block of the screen (RAPP-690,
 * `signature-block-field.tsx`).
 *
 * Every staff question is optional (RAPP-611 adds required ones), so tapping a
 * chosen chip again clears it. The texts are staff's, in her app language with
 * the Catalan fallback. A choice that was archived since she picked it stays
 * visible and chosen, marked as no longer offered, until she changes it.
 * `errorMessage` is set by the screen when she continues with an answer that
 * does not fit the question (the shared schema says so).
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { FormTextArea } from '@/components/forms/form-text-area';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PressableScale } from '@/components/motion/pressable-scale';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { FieldErrorText } from '@/components/onboarding/field-error-text';
import { MunicipalityPicker } from '@/components/onboarding/municipality-picker';
import { OptionChip } from '@/components/onboarding/option-chip';
import { ChoiceGrid } from '@/components/onboarding/option-grid';
import { OptionSearchPicker } from '@/components/onboarding/option-search-picker';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { SupportingEntitiesField } from '@/components/profile/supporting-entities-field';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  answerUploadsAvailable,
  pickAndUploadAnswerDocument,
  pickAndUploadAnswerPhoto,
} from '@/lib/custom-answer-upload';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View, type TextStyle } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  fileSettings,
  isCustomQuestionVisible,
  itemListSettings,
  LIST_ITEM_MAX_LENGTH,
  liveOptions,
  LONG_TEXT_MAX_LENGTH,
  numberSettings,
  SHORT_TEXT_MAX_LENGTH,
  textIn,
  updateCustomAnswer,
  YES_NO,
  YES_NO_MAYBE,
  type CustomAnswerValue,
  type CustomQuestion,
  type FileAnswer,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

/** Her own words may be in another script than the app: let the text set its direction. */
const mixedDirectionInputStyle: TextStyle = { writingDirection: 'auto' };

const YES_NO_MAYBE_KEYS = {
  yes: 'onboarding:yesOption',
  no: 'onboarding:noOption',
  maybe: 'onboarding:customMaybeOption',
} as const;

export type CustomAnswerDraft = Readonly<Record<string, CustomAnswerValue>>;

export interface CustomQuestionFieldProps {
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue | undefined;
  readonly onChange: (value: CustomAnswerValue) => void;
  /** Shown under the control when her answer does not fit the question. */
  readonly errorMessage?: string;
}

function QuestionLabel({ text }: { readonly text: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>{text}</Text>
  );
}

const asText = (value: CustomAnswerValue | undefined): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

/** A typed number in either decimal mark; anything else stays text, so the check can say so. */
function parseTypedNumber(text: string): CustomAnswerValue {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const normalized = trimmed.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : trimmed;
}

/** Day, month and year as the date answer: `YYYY-MM-DD`, or what she typed so far. */
function composeDate(day: string, month: string, year: string): string {
  if (day.trim() === '' && month.trim() === '' && year.trim() === '') return '';
  return `${year.trim()}-${month.trim().padStart(2, '0')}-${day.trim().padStart(2, '0')}`;
}

function splitDate(value: CustomAnswerValue | undefined) {
  const [year = '', month = '', day = ''] = typeof value === 'string' ? value.split('-') : [];
  return { day, month, year };
}

function NumberField({ question, value, onChange, errorMessage, label, help, testID }: FieldProps) {
  const [text, setText] = useState(asText(value));
  const isWhole = numberSettings(question.settings).integer;
  return (
    <AuthTextField
      testID={`${testID}-input`}
      label={label}
      hint={help}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(parseTypedNumber(next));
      }}
      keyboardType={isWhole ? 'number-pad' : 'decimal-pad'}
      inputMode={isWhole ? 'numeric' : 'decimal'}
      isInvalid={errorMessage !== undefined}
      errorMessage={errorMessage}
      maxLength={16}
    />
  );
}

function DateField({ value, onChange, errorMessage, label, help, testID }: FieldProps) {
  const { t } = useTranslation('onboarding');
  const [parts, setParts] = useState(() => splitDate(value));
  const update = (part: 'day' | 'month' | 'year', next: string) => {
    const changed = { ...parts, [part]: next };
    setParts(changed);
    onChange(composeDate(changed.day, changed.month, changed.year));
  };
  const isInvalid = errorMessage !== undefined;
  return (
    <View className="gap-xs" testID={testID}>
      <QuestionLabel text={label} />
      <QuestionHelp text={help} />
      <View className="flex-row flex-wrap gap-sm">
        <View className="min-w-[30%] flex-1">
          <AuthTextField
            testID={`${testID}-day`}
            label={t('dayLabel')}
            value={parts.day}
            onChangeText={(next) => update('day', next)}
            keyboardType="number-pad"
            maxLength={2}
            isInvalid={isInvalid}
          />
        </View>
        <View className="min-w-[30%] flex-1">
          <AuthTextField
            testID={`${testID}-month`}
            label={t('monthLabel')}
            value={parts.month}
            onChangeText={(next) => update('month', next)}
            keyboardType="number-pad"
            maxLength={2}
            isInvalid={isInvalid}
          />
        </View>
        <View className="min-w-[30%] flex-1">
          <AuthTextField
            testID={`${testID}-year`}
            label={t('yearLabel')}
            value={parts.year}
            onChangeText={(next) => update('year', next)}
            keyboardType="number-pad"
            maxLength={4}
            isInvalid={isInvalid}
          />
        </View>
      </View>
      <FieldErrorText message={errorMessage} />
    </View>
  );
}

function FileField({ question, value, onChange, errorMessage, label, help, testID }: FieldProps) {
  const { t } = useTranslation('onboarding');
  const fontClass = useLanguageFontClass();
  const [isUploading, setIsUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const file =
    typeof value === 'object' && value !== null && !Array.isArray(value) && 'key' in value
      ? (value as FileAnswer)
      : null;
  const canUpload = answerUploadsAvailable();
  const acceptsDocuments = fileSettings(question.settings).accept === 'document';

  async function pick(picker: () => Promise<FileAnswer | null>) {
    setFailed(false);
    setIsUploading(true);
    try {
      const uploaded = await picker();
      if (uploaded !== null) onChange(uploaded);
    } catch (error) {
      toAppError(error);
      setFailed(true);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View className="gap-sm" testID={testID}>
      <QuestionLabel text={label} />
      <QuestionHelp text={help} />
      {canUpload ? null : (
        <Text
          testID={`${testID}-unavailable`}
          className={`text-start text-form text-neutral-700 ${fontClass}`}
        >
          {t('customFileUnavailable')}
        </Text>
      )}
      {file === null ? null : (
        <View
          style={continuousCorners}
          className="w-full flex-row items-center gap-sm rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm"
        >
          <Text
            testID={`${testID}-name`}
            className={`flex-1 text-start text-form text-neutral-900 ${fontClass}`}
          >
            {file.name}
          </Text>
          <PressableScale
            style={continuousCorners}
            accessibilityRole="button"
            accessibilityLabel={t('customFileRemove', { name: file.name })}
            onPress={() => onChange('')}
            haptic="tapLight"
            className="min-h-recommended min-w-recommended items-center justify-center rounded-md"
          >
            <Text
              className={`text-xl font-medium text-primary ${fontClass}`}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              ×
            </Text>
          </PressableScale>
        </View>
      )}
      {canUpload && file === null ? (
        isUploading ? (
          <View className="flex-row items-center gap-sm" accessibilityLiveRegion="polite">
            <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
            <Text className={`text-start text-form text-neutral-700 ${fontClass}`}>
              {t('customFileUploading')}
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-sm">
            <RaisedActionButton
              testID={`${testID}-photo`}
              label={t('customChoosePhoto')}
              onPress={() => void pick(pickAndUploadAnswerPhoto)}
            />
            {acceptsDocuments ? (
              <RaisedActionButton
                testID={`${testID}-document`}
                label={t('customChooseDocument')}
                onPress={() => void pick(pickAndUploadAnswerDocument)}
              />
            ) : null}
          </View>
        )
      ) : null}
      <FieldErrorText message={failed ? t('customFileUploadFailed') : errorMessage} />
    </View>
  );
}

interface FieldProps extends CustomQuestionFieldProps {
  readonly label: string;
  readonly help: string | null;
  readonly testID: string;
}

export function CustomQuestionField(props: CustomQuestionFieldProps) {
  const { question, value, onChange, errorMessage } = props;
  const { t } = useTranslation(['onboarding']);
  const { language } = useLanguage();
  const fontClass = useLanguageFontClass();
  const label = textIn(question.label, language);
  const help = textIn(question.help, language) || null;
  const testID = `custom-question-${question.id}`;
  const field: FieldProps = { ...props, label, help, testID };

  switch (question.type) {
    case 'long_text':
      return (
        <View testID={testID}>
          <FormTextArea
            testID={`${testID}-input`}
            label={label}
            hint={help}
            value={asText(value)}
            onChangeText={onChange}
            style={mixedDirectionInputStyle}
            maxLength={LONG_TEXT_MAX_LENGTH}
          />
          <FieldErrorText message={errorMessage} />
        </View>
      );
    case 'short_text':
    case 'phone':
    case 'email':
      return (
        <View testID={testID}>
          <AuthTextField
            testID={`${testID}-input`}
            label={label}
            hint={help}
            value={asText(value)}
            onChangeText={onChange}
            style={question.type === 'short_text' ? mixedDirectionInputStyle : undefined}
            maxLength={question.type === 'short_text' ? SHORT_TEXT_MAX_LENGTH : 254}
            isInvalid={errorMessage !== undefined}
            errorMessage={errorMessage}
            {...(question.type === 'phone'
              ? {
                  keyboardType: 'phone-pad' as const,
                  inputMode: 'tel' as const,
                  autoComplete: 'tel' as const,
                  textContentType: 'telephoneNumber' as const,
                  placeholder: t('phonePlaceholder'),
                }
              : question.type === 'email'
                ? {
                    keyboardType: 'email-address' as const,
                    inputMode: 'email' as const,
                    autoCapitalize: 'none' as const,
                    autoCorrect: false,
                    autoComplete: 'email' as const,
                    textContentType: 'emailAddress' as const,
                  }
                : {})}
          />
        </View>
      );
    case 'number':
      return (
        <View testID={testID}>
          <NumberField {...field} />
        </View>
      );
    case 'date':
      return <DateField {...field} />;
    case 'file_upload':
      return <FileField {...field} />;
    case 'item_list':
      return (
        <View testID={testID}>
          <SupportingEntitiesField
            value={Array.isArray(value) ? (value as unknown as readonly string[]) : []}
            onChange={onChange}
            entityNames={[]}
            label={label}
            help={help}
            testIDPrefix={testID}
            inputLabel={t('customListItemLabel')}
            removeLabel={(name) => t('supportingEntitiesRemoveAction', { name })}
            maxItems={itemListSettings(question.settings).max_items}
            maxLength={LIST_ITEM_MAX_LENGTH}
          />
          <FieldErrorText message={errorMessage} />
        </View>
      );
    case 'country':
      return (
        <View testID={testID} className="gap-xs">
          <CountryPicker
            label={label}
            value={asText(value)}
            onChange={onChange}
            errorMessage={errorMessage}
          />
          <QuestionHelp text={help} />
        </View>
      );
    case 'municipality':
      return (
        <View testID={testID} className="gap-xs">
          <MunicipalityPicker
            label={label}
            value={asText(value)}
            onChange={onChange}
            errorMessage={errorMessage}
          />
          <QuestionHelp text={help} />
        </View>
      );
    case 'search_choice': {
      const chosen = typeof value === 'string' ? value : '';
      const options = [
        ...liveOptions(question),
        ...question.options.filter((option) => option.isArchived && option.id === chosen),
      ].map((option) => ({
        id: option.id,
        label: option.isArchived
          ? `${textIn(option.label, language)} (${t('onboarding:customArchivedOption')})`
          : textIn(option.label, language),
        searchText: Object.values(option.label).join(' '),
      }));
      return (
        <OptionSearchPicker
          testID={testID}
          label={label}
          help={<QuestionHelp text={help} />}
          value={chosen}
          options={options}
          onChange={onChange}
          errorMessage={errorMessage}
        />
      );
    }
    default:
      break;
  }

  const chosen: readonly string[] =
    value === undefined
      ? []
      : typeof value === 'string'
        ? value === ''
          ? []
          : [value]
        : Array.isArray(value) && value.every((item) => typeof item === 'string')
          ? (value as unknown as readonly string[])
          : [];
  const isYesNo = question.type === 'yes_no_maybe' || question.type === 'yes_no';
  const options: readonly { readonly id: string; readonly label: string }[] = isYesNo
    ? (question.type === 'yes_no' ? YES_NO : YES_NO_MAYBE).map((answer) => ({
        id: answer,
        label: t(YES_NO_MAYBE_KEYS[answer]),
      }))
    : [
        ...liveOptions(question),
        // Her stored choice stays visible after staff archive it.
        ...question.options.filter((option) => option.isArchived && chosen.includes(option.id)),
      ].map((option) => ({
        id: option.id,
        label: option.isArchived
          ? `${textIn(option.label, language)} (${t('onboarding:customArchivedOption')})`
          : textIn(option.label, language),
      }));
  const isMultiple = question.type === 'multiple_choice';

  const choose = (id: string) => {
    if (isMultiple) {
      onChange(chosen.includes(id) ? chosen.filter((each) => each !== id) : [...chosen, id]);
    } else {
      onChange(chosen.includes(id) ? '' : id);
    }
  };

  return (
    <View testID={testID} className="gap-sm">
      <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
        {label}
      </Text>
      <QuestionHelp text={help} />
      <ChoiceGrid maximumColumns={isYesNo ? 3 : 2}>
        {options.map((option) => (
          <OptionChip
            key={option.id}
            testID={isYesNo ? `${testID}-${option.id}` : `custom-option-${option.id}`}
            label={option.label}
            accessibilityHint={label}
            isSelected={chosen.includes(option.id)}
            onPress={() => choose(option.id)}
          />
        ))}
      </ChoiceGrid>
      <FieldErrorText message={errorMessage} />
    </View>
  );
}

/**
 * Fitxa fields as part of a longer form (re-registration, the entity's
 * referral), in their order, each worded for that form (RAPP-655). A field
 * whose condition does not apply is not shown.
 */
export function CustomQuestionList({
  questions,
  answers,
  onChange,
  errors = {},
  testID,
}: {
  readonly questions: readonly CustomQuestion[];
  readonly answers: CustomAnswerDraft;
  readonly onChange: (questionId: string, value: CustomAnswerValue) => void;
  readonly errors?: Readonly<Record<string, string>>;
  readonly testID?: string;
}) {
  return (
    <View testID={testID} className="gap-lg">
      {questions
        .filter((question) => isCustomQuestionVisible(question, answers))
        .map((question) => (
          <CustomQuestionField
            key={question.id}
            question={question}
            value={answers[question.id]}
            errorMessage={errors[question.id]}
            onChange={(value) => {
              const next = updateCustomAnswer(questions, answers, question.id, value);
              for (const [id, answer] of Object.entries(next))
                if (answer !== answers[id]) onChange(id, answer);
            }}
          />
        ))}
    </View>
  );
}

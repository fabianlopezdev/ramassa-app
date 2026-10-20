/**
 * A question staff added in the question builder (RAPP-307), with the control
 * its type needs: a text field, yes / no / maybe chips, one choice or several.
 * Every staff question is optional, so tapping a chosen chip again clears it.
 *
 * The texts are staff's, in her app language with the Catalan fallback built
 * in. A choice that was archived since she picked it stays visible and chosen,
 * marked as no longer offered, until she changes it.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { OptionChip } from '@/components/onboarding/option-chip';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View, type TextStyle } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  liveOptions,
  textIn,
  YES_NO_MAYBE,
  type CustomAnswerValue,
  type CustomQuestion,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';

/** Her own words may be in another script than the app: let the text set its direction. */
const mixedDirectionInputStyle: TextStyle = { writingDirection: 'auto' };

const SHORT_TEXT_MAX_LENGTH = 500;
const LONG_TEXT_MAX_LENGTH = 4000;

const YES_NO_MAYBE_KEYS = {
  yes: 'onboarding:yesOption',
  no: 'onboarding:noOption',
  maybe: 'onboarding:customMaybeOption',
} as const;

export type CustomAnswerDraft = Readonly<Record<string, CustomAnswerValue>>;

export function CustomQuestionField({
  question,
  value,
  onChange,
}: {
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue | undefined;
  readonly onChange: (value: CustomAnswerValue) => void;
}) {
  const { t } = useTranslation(['onboarding']);
  const { language } = useLanguage();
  const fontClass = useLanguageFontClass();
  const label = textIn(question.label, language);
  const help = textIn(question.help, language) || null;
  const testID = `custom-question-${question.id}`;

  if (question.type === 'short_text' || question.type === 'long_text') {
    const isLong = question.type === 'long_text';
    return (
      <View testID={testID}>
        <AuthTextField
          testID={`${testID}-input`}
          label={label}
          hint={help}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          style={mixedDirectionInputStyle}
          multiline={isLong}
          maxLength={isLong ? LONG_TEXT_MAX_LENGTH : SHORT_TEXT_MAX_LENGTH}
        />
      </View>
    );
  }

  const chosen: readonly string[] =
    value === undefined ? [] : typeof value === 'string' ? (value === '' ? [] : [value]) : value;
  const options: readonly { readonly id: string; readonly label: string }[] =
    question.type === 'yes_no_maybe'
      ? YES_NO_MAYBE.map((answer) => ({ id: answer, label: t(YES_NO_MAYBE_KEYS[answer]) }))
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
      <View className="flex-row flex-wrap gap-sm">
        {options.map((option) => (
          <OptionChip
            key={option.id}
            testID={
              question.type === 'yes_no_maybe'
                ? `${testID}-${option.id}`
                : `custom-option-${option.id}`
            }
            label={option.label}
            accessibilityHint={label}
            isSelected={chosen.includes(option.id)}
            onPress={() => choose(option.id)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Staff screens as sections of a longer form (re-registration, the entity's
 * referral): each screen's title, its intro, then its questions.
 */
export function CustomQuestionSections({
  screens,
  answers,
  onChange,
}: {
  readonly screens: readonly IntakeScreen[];
  readonly answers: CustomAnswerDraft;
  readonly onChange: (questionId: string, value: CustomAnswerValue) => void;
}) {
  const { language } = useLanguage();
  const fontClass = useLanguageFontClass();
  return (
    <>
      {screens.map((screen) => {
        const intro = textIn(screen.intro, language);
        return (
          <View key={screen.id} testID={`custom-screen-${screen.id}`} className="gap-lg">
            <View className="gap-xs">
              <Text
                accessibilityRole="header"
                className={`text-start text-form font-bold text-neutral-900 ${fontClass}`}
              >
                {textIn(screen.title, language)}
              </Text>
              {intro === '' ? null : (
                <Text className={`text-start text-form text-neutral-700 ${fontClass}`}>
                  {intro}
                </Text>
              )}
            </View>
            {screen.questions.map((question) => (
              <CustomQuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(value) => onChange(question.id, value)}
              />
            ))}
          </View>
        );
      })}
    </>
  );
}

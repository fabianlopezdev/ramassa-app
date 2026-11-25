/**
 * Her answers to the questions staff added to a form she sends when she wants
 * (RAPP-973), each under its question as she read it: the phone's twin of the
 * dashboard's list. A form whose own parts read as questions (the incident's
 * what, when and where) lists them first, in the same rows (`leading`).
 */
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import { answerText, textIn, type CustomAnswerValue } from '@ramassa/shared/intake-builder';
import { formAnswerQuestion, type FormAnswer } from '@ramassa/shared/on-demand-form';

const styles = StyleSheet.create({ answer: { writingDirection: 'auto' } });

export function FormAnswerList({
  testID,
  answers,
  leading = [],
}: {
  readonly testID: string;
  readonly answers: readonly FormAnswer[];
  /** The form's own parts, already worded: a label and its value, before her answers. */
  readonly leading?: readonly { readonly label: string; readonly value: string }[];
}) {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const fontClass = useLanguageFontClass();
  if (answers.length === 0 && leading.length === 0) return null;
  const words = {
    yes: t('yesOption'),
    no: t('noOption'),
    maybe: t('customMaybeOption'),
    archived: t('customArchivedOption'),
  };
  const rows = [
    ...leading.map((part) => ({ key: part.label, label: part.label, value: part.value })),
    ...answers.map((answer) => ({
      key: answer.fieldId,
      label: textIn(answer.label, language),
      value: answerText(
        formAnswerQuestion(answer),
        answer.value as CustomAnswerValue,
        language,
        words,
      ),
    })),
  ];
  return (
    <View testID={testID} className="gap-sm">
      {rows.map((row) => (
        <View key={row.key} className="gap-xs">
          <Text className={`text-start text-sm font-semibold text-neutral-600 ${fontClass}`}>
            {row.label}
          </Text>
          <Text
            selectable
            style={styles.answer}
            className={`text-start text-md text-neutral-900 ${fontClass}`}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

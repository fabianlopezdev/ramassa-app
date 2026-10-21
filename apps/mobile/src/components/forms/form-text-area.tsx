import { FormTextField, type FormTextFieldProps } from '@/components/forms/form-text-field';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

type FormTextAreaProps = Omit<FormTextFieldProps, 'multiline' | 'inputWidth' | 'maxLength'> & {
  readonly maxLength: number;
};

/** A visible writing area and native length limit, using the same field focus and errors. */
export function FormTextArea({ value = '', maxLength, style, ...props }: FormTextAreaProps) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { fontScale } = useWindowDimensions();
  const areaStyle = useMemo(
    () => [
      {
        minHeight: tokens.formField.textAreaMinHeight * Math.max(1, fontScale),
        textAlignVertical: 'top' as const,
      },
      style,
    ],
    [fontScale, style],
  );
  return (
    <View className="gap-sm">
      <FormTextField {...props} value={value} style={areaStyle} multiline maxLength={maxLength} />
      <Text className={`text-end text-form text-neutral-700 ${fontClass}`}>
        {t('characterCount', { count: value.length, limit: maxLength })}
      </Text>
    </View>
  );
}

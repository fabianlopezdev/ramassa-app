/**
 * A labelled text field for the auth screens (RAPP-13): a visible label (never
 * placeholder-only, so the field's purpose survives once typing starts), a
 * recommended 56dp tap target, logical `text-start` alignment for RTL, and an
 * inline, screen-reader-announced error slot. Presentational only — the form
 * owns the value via react-hook-form's Controller and passes it straight down.
 */

import { composeContinuousTextStyle } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, type Ref } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export interface AuthTextFieldProps extends TextInputProps {
  readonly label: string;
  readonly errorMessage?: string;
  readonly ref?: Ref<TextInput>;
}

export function AuthTextField({
  label,
  errorMessage,
  ref,
  style,
  ...inputProps
}: AuthTextFieldProps) {
  const languageFontClass = useLanguageFontClass();
  const hasError = Boolean(errorMessage);
  const inputStyle = useMemo(() => composeContinuousTextStyle(style), [style]);

  return (
    <View className="gap-xs">
      <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        style={inputStyle}
        placeholderTextColor={tokens.colors.neutral[400]}
        className={`min-h-recommended rounded-md border px-md text-start text-md text-neutral-900 ${
          hasError ? 'border-error' : 'border-neutral-300'
        } ${languageFontClass}`}
        {...inputProps}
      />
      {hasError ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

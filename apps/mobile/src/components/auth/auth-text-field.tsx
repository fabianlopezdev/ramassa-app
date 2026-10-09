/**
 * A labelled text field for the auth screens (RAPP-13): a visible label (never
 * placeholder-only, so the field's purpose survives once typing starts), a
 * recommended 56dp tap target, logical `text-start` alignment for RTL, and an
 * inline, screen-reader-announced error slot. Presentational only: the form
 * owns the value via react-hook-form's Controller and passes it straight down.
 */

import { composeContinuousTextStyle } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useEffect, useMemo, type Ref } from 'react';
import { AccessibilityInfo, Text, TextInput, View, type TextInputProps } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// Queued so VoiceOver finishes reading the pressed button before the error.
const queuedAnnouncement = { queue: true } as const;

export interface AuthTextFieldProps extends TextInputProps {
  readonly label: string;
  readonly errorMessage?: string;
  /** Marks the border without repeating a field-level error sentence. */
  readonly isInvalid?: boolean;
  readonly ref?: Ref<TextInput>;
}

export function AuthTextField({
  label,
  errorMessage,
  isInvalid,
  ref,
  style,
  placeholder,
  ...inputProps
}: AuthTextFieldProps) {
  const languageFontClass = useLanguageFontClass();
  const hasError = Boolean(errorMessage) || Boolean(isInvalid);
  const inputStyle = useMemo(() => composeContinuousTextStyle(style), [style]);

  useEffect(() => {
    // `accessibilityLiveRegion` below is Android-only; VoiceOver needs an
    // explicit announcement or the error stays silent until found by swiping.
    if (errorMessage && process.env.EXPO_OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(errorMessage, queuedAnnouncement);
    }
  }, [errorMessage]);

  return (
    <View className="gap-xs">
      <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        // Ties the error to the field, so returning focus to it repeats the fix.
        accessibilityHint={errorMessage}
        style={inputStyle}
        placeholder={process.env.EXPO_OS === 'web' ? undefined : placeholder}
        placeholderTextColor={tokens.colors.neutral[600]}
        className={`min-h-recommended rounded-md border px-md text-start text-md text-neutral-900 ${
          hasError ? 'border-error' : 'border-neutral-300'
        } ${languageFontClass}`}
        {...inputProps}
      />
      {errorMessage === undefined ? null : (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

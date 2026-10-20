/**
 * The shared labelled text field for onboarding, login and other forms (RAPP-564): a visible label (never
 * placeholder-only, so the field's purpose survives once typing starts), a
 * picker-height tap target, logical `text-start` alignment for RTL, and an
 * inline, screen-reader-announced error slot. Presentational only: the form
 * owns the value via react-hook-form's Controller and passes it straight down.
 */

import { useFormFieldAppearance } from '@/components/forms/field-appearance';
import { fieldFocusOwner } from '@/components/forms/field-focus-owner';
import { FieldFocusRing } from '@/components/forms/field-focus-ring';
import { composeContinuousTextStyle } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback, useEffect, useId, useMemo, type Ref } from 'react';
import {
  AccessibilityInfo,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
} from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// Queued so VoiceOver finishes reading the pressed button before the error.
const queuedAnnouncement = { queue: true } as const;

export interface FormTextFieldProps extends TextInputProps {
  readonly label: string;
  readonly errorMessage?: string;
  /** Only the input frame narrows; labels and feedback keep the available width. */
  readonly inputWidth?: 'full' | 'short' | 'medium';
  /** A help line under the field, such as the one staff write for a question (RAPP-307). */
  readonly hint?: string | null;
  /** Marks the border without repeating a field-level error sentence. */
  readonly isInvalid?: boolean;
  readonly ref?: Ref<TextInput>;
}

export function FormTextField({
  label,
  errorMessage,
  hint,
  isInvalid,
  inputWidth = 'full',
  ref,
  style,
  placeholder,
  className,
  onFocus,
  onBlur,
  onPressIn,
  onPressOut,
  onPress,
  editable,
  readOnly,
  ...inputProps
}: FormTextFieldProps) {
  const languageFontClass = useLanguageFontClass();
  const { fontScale } = useWindowDimensions();
  const frameStyle = useMemo(
    () =>
      inputWidth === 'full'
        ? undefined
        : {
            width: tokens.formField.width[inputWidth] * Math.max(1, fontScale),
            maxWidth: '100%' as const,
            alignSelf: 'flex-start' as const,
          },
    [inputWidth, fontScale],
  );
  const fieldId = useId();
  useEffect(() => () => fieldFocusOwner.remove(fieldId), [fieldId]);
  const canEdit = editable !== false && readOnly !== true;
  const hasError = Boolean(errorMessage) || Boolean(isInvalid);
  const appearance = useFormFieldAppearance(hasError);
  const inputStyle = useMemo(
    () => composeContinuousTextStyle([appearance.style, style]),
    [appearance.style, style],
  );

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (event) => {
      fieldFocusOwner.focus(fieldId);
      onFocus?.(event);
    },
    [onFocus, fieldId],
  );
  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (event) => {
      fieldFocusOwner.blur(fieldId);
      onBlur?.(event);
    },
    [onBlur, fieldId],
  );

  const handlePressIn = useCallback<NonNullable<TextInputProps['onPressIn']>>(
    (event) => {
      if (canEdit) fieldFocusOwner.press(fieldId);
      onPressIn?.(event);
    },
    [canEdit, fieldId, onPressIn],
  );
  const handlePressOut = useCallback<NonNullable<TextInputProps['onPressOut']>>(
    (event) => {
      fieldFocusOwner.pressOut(fieldId);
      onPressOut?.(event);
    },
    [fieldId, onPressOut],
  );
  const handlePress = useCallback<NonNullable<TextInputProps['onPress']>>(
    (event) => {
      // TextInput requests native focus after this accepted press callback.
      if (canEdit) fieldFocusOwner.press(fieldId);
      onPress?.(event);
    },
    [canEdit, fieldId, onPress],
  );

  useEffect(() => {
    // `accessibilityLiveRegion` below is Android-only; VoiceOver needs an
    // explicit announcement or the error stays silent until found by swiping.
    if (errorMessage && process.env.EXPO_OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(errorMessage, queuedAnnouncement);
    }
  }, [errorMessage]);

  return (
    <View className="gap-xs">
      <Text className={`text-start text-form font-medium text-neutral-800 ${languageFontClass}`}>
        {label}
      </Text>
      <View className="relative" style={frameStyle}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          // Ties the error to the field, so returning focus to it repeats the fix.
          accessibilityHint={errorMessage}
          style={inputStyle}
          placeholder={process.env.EXPO_OS === 'web' ? undefined : placeholder}
          placeholderTextColor={tokens.colors.neutral[600]}
          className={`${appearance.className} text-start text-form text-neutral-900 ${languageFontClass} ${className ?? ''}`}
          {...inputProps}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
          editable={editable}
          readOnly={readOnly}
        />
        <FieldFocusRing tone={hasError ? 'error' : 'primary'} fieldId={fieldId} />
      </View>
      {hint == null || hint.trim() === '' ? null : (
        <Text className={`text-start text-form text-neutral-700 ${languageFontClass}`}>{hint}</Text>
      )}
      {errorMessage === undefined ? null : (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

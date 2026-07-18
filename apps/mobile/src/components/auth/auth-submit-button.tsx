/**
 * The primary action button for the auth screens (RAPP-13): a 56dp target, a
 * busy state that disables and shows a spinner (so a slow network can't produce
 * a double submit), and an accessible label + state for screen readers.
 */

import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export interface AuthSubmitButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly isLoading?: boolean;
  readonly disabled?: boolean;
}

export function AuthSubmitButton({ label, onPress, isLoading, disabled }: AuthSubmitButtonProps) {
  const languageFontClass = useLanguageFontClass();
  const isInteractionBlocked = Boolean(disabled) || Boolean(isLoading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInteractionBlocked, busy: Boolean(isLoading) }}
      disabled={isInteractionBlocked}
      onPress={onPress}
      className={`min-h-recommended flex-row items-center justify-center gap-sm rounded-md bg-primary px-lg ${
        isInteractionBlocked ? 'opacity-60' : 'active:opacity-80'
      }`}
    >
      {isLoading ? <ActivityIndicator color={tokens.colors.white} /> : null}
      <Text className={`text-lg font-bold text-white ${languageFontClass}`}>{label}</Text>
    </Pressable>
  );
}

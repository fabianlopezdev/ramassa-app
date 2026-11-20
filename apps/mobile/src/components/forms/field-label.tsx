/**
 * The label over one field or one set of choices (RAPP-889). The text field,
 * the pickers and the choice chips all wear it, on the player side and the
 * staff side, so a form reads at one size and one weight everywhere.
 */
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

interface FieldLabelProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly nativeID?: string;
  /** For a form shown in another language than the app's, that language's font. */
  readonly fontClass?: string;
}

export function FieldLabel({ children, className, nativeID, fontClass }: FieldLabelProps) {
  const appFontClass = useLanguageFontClass();
  return (
    <Text
      nativeID={nativeID}
      className={`text-start text-form font-medium text-neutral-800 ${fontClass ?? appFontClass} ${className ?? ''}`}
    >
      {children}
    </Text>
  );
}

/**
 * The help line staff wrote under a question (RAPP-307), in her language.
 * Nothing renders when there is none, so it takes no slot in the parent's gap.
 */

import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text } from 'react-native';

export function QuestionHelp({ text }: { readonly text: string | null }) {
  const languageFontClass = useLanguageFontClass();
  if (text === null || text.trim() === '') return null;
  return <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>{text}</Text>;
}

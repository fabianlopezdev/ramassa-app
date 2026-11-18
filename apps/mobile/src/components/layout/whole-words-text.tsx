/**
 * A short name that never breaks inside a word (RAPP-870). It starts at the
 * first size it is given and steps down to the next one while a line ends in
 * the middle of a word, such as "Alfabetitzac / ió" in a narrow Ajuda tile.
 * The sizes are text classes from the tokens, largest first; the last one is
 * kept even if a word still does not fit.
 */
import { useCallback, useState } from 'react';
import { Text, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';

const WORD_END = /[\s­-]$/u;
const WORD_START = /^[\p{L}\p{N}]/u;

/** Whether one of the laid-out lines ends inside a word that runs on to the next line. */
function breaksInsideAWord(lines: TextLayoutEventData['lines']): boolean {
  return lines.some((line, index) => {
    const next = lines[index + 1];
    return next !== undefined && !WORD_END.test(line.text) && WORD_START.test(next.text);
  });
}

export function WholeWordsText({
  children,
  sizeClassNames,
  className,
}: {
  readonly children: string;
  /** Text size classes to try, largest first, such as `['text-md', 'text-sm']`. */
  readonly sizeClassNames: readonly string[];
  /** Everything else: weight, colour, alignment, the language font. */
  readonly className: string;
}) {
  const [step, setStep] = useState(0);
  const handleTextLayout = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (step < sizeClassNames.length - 1 && breaksInsideAWord(nativeEvent.lines)) {
        setStep(step + 1);
      }
    },
    [sizeClassNames.length, step],
  );
  return (
    <Text
      key={children}
      onTextLayout={handleTextLayout}
      className={`${sizeClassNames[step] ?? ''} ${className}`}
    >
      {children}
    </Text>
  );
}

import { useCallback, useMemo, useState } from 'react';
import type { NativeSyntheticEvent, TextLayoutEventData } from 'react-native';

interface TextBoxTrim {
  readonly top: number;
  readonly bottom: number;
}

const NO_TRIM: TextBoxTrim = { top: 0, bottom: 0 };

/**
 * Trims a text's box to its letters, from the top of its capitals to its
 * baseline (RAPP-852). A text box keeps room above the capitals for accents
 * and below the baseline for letters like g and y; in a label that has
 * neither, that room reads as extra space, so a label centred by its box
 * looks off centre. Trimmed, the layout centres what the eye sees. Accents
 * and descenders still draw, spilling into the space around the text.
 *
 * The numbers come from the font itself, through `onTextLayout`: on both
 * platforms a line's `ascender` runs from the top of its box to the baseline,
 * and its `descender` from the baseline to the bottom of its box.
 */
export function useCapToBaselineTrim() {
  const [trim, setTrim] = useState<TextBoxTrim>(NO_TRIM);
  const onTextLayout = useCallback(({ nativeEvent }: NativeSyntheticEvent<TextLayoutEventData>) => {
    const firstLine = nativeEvent.lines[0];
    const lastLine = nativeEvent.lines.at(-1);
    if (firstLine === undefined || lastLine === undefined) return;
    const top = Math.max(0, firstLine.ascender - firstLine.capHeight);
    const bottom = Math.max(0, lastLine.descender);
    setTrim((current) =>
      current.top === top && current.bottom === bottom ? current : { top, bottom },
    );
  }, []);
  const style = useMemo(
    () => ({ marginTop: -trim.top, marginBottom: -trim.bottom }),
    [trim.bottom, trim.top],
  );
  return { onTextLayout, style };
}

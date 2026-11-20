/**
 * Whether a laid-out text breaks inside a word (RAPP-879): one of its lines
 * ends in the middle of a word that runs on to the next line, such as
 * "Documentatio / n" or "Alfabetitzac / ió" in a narrow Ajuda tile. A line
 * that ends at a space, a soft hyphen or a hyphen ends a whole word, so a name
 * that wraps between words ("Language / Courses") does not count.
 *
 * Takes the `lines` of a `Text`'s `onTextLayout` event.
 */
const WORD_END = /[\s­-]$/u;
const WORD_START = /^[\p{L}\p{N}]/u;

export function breaksInsideAWord(lines: readonly { readonly text: string }[]): boolean {
  return lines.some((line, index) => {
    const next = lines[index + 1];
    return next !== undefined && !WORD_END.test(line.text) && WORD_START.test(next.text);
  });
}

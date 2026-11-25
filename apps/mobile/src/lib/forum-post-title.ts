/**
 * A forum post has no title of its own. On a card with a photo (RAPP-921) its
 * first sentence is the title on the photo and the rest is the preview under
 * it. The first sentence ends at the first full stop, exclamation or question
 * mark followed by a space or the end, or at the first line break. A post of
 * one sentence is a title alone.
 */
export interface ForumPostTitle {
  readonly title: string | null;
  readonly preview: string | null;
}

// A mark that ends a sentence, with the Arabic and Farsi question mark, when a
// space or the end follows it; or a line break.
const SENTENCE_END = /[.!?؟]+(?=\s|$)|\n/u;

export function splitForumPostTitle(content: string | null): ForumPostTitle {
  const text = content?.trim() ?? '';
  if (text.length === 0) return { title: null, preview: null };
  const end = SENTENCE_END.exec(text);
  if (end === null) return { title: text, preview: null };
  const isLineBreak = end[0] === '\n';
  const titleEnd = isLineBreak ? end.index : end.index + end[0].length;
  const title = text.slice(0, titleEnd).trim();
  const preview = text.slice(end.index + end[0].length).trim();
  return { title, preview: preview.length === 0 ? null : preview };
}

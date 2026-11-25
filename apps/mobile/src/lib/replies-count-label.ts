/**
 * The replies line of a card (RAPP-922): "1 resposta", "2 respostes", and
 * nothing at all when there are none, so the card and its spoken label say
 * nothing about replies.
 */
export function repliesCountLabel(count: number, format: (count: number) => string): string | null {
  return count > 0 ? format(count) : null;
}

import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import { useCallback, useRef } from 'react';

/**
 * What one view of a tab hands to the tab's single list (RAPP-977).
 *
 * A tab with a switch, such as Comunitat with Fòrum, Galeria and Històries,
 * draws one list whose header holds her photo, the title and the switch.
 * Each view gives that list its rows, how to draw them, its empty state and
 * its refresh. Choosing another view changes what the list shows; the list
 * and its header stay, so nothing in the header is built again. A list per
 * view would build the header again each time, and on Android a photo that
 * is built again shows blank for a moment.
 */
export type SegmentListProps<Item> = Pick<
  FlashListProps<Item>,
  | 'testID'
  | 'data'
  | 'renderItem'
  | 'keyExtractor'
  | 'getItemType'
  | 'extraData'
  | 'numColumns'
  | 'ListEmptyComponent'
  | 'refreshing'
  | 'onRefresh'
>;

type SegmentListHandle = Pick<FlashListRef<unknown>, 'clearLayoutCacheOnUpdate'>;

/**
 * The list remembers the size of every row it has drawn. The rows of one view
 * say nothing about the rows of the next: a forum card that takes the place of
 * a gallery tile would keep the tile's height, and the cards would sit too far
 * apart. So the tab asks the list to forget its sizes as the view changes.
 *
 * `holdList` goes on the list as its `ref`; `forgetRowSizes` is called in the
 * press that changes the view, before the list draws the new rows.
 */
export function useSegmentListReset(): {
  readonly holdList: (list: SegmentListHandle | null) => void;
  readonly forgetRowSizes: () => void;
} {
  const list = useRef<SegmentListHandle | null>(null);
  const holdList = useCallback((held: SegmentListHandle | null) => {
    list.current = held;
  }, []);
  const forgetRowSizes = useCallback(() => list.current?.clearLayoutCacheOnUpdate(), []);
  return { holdList, forgetRowSizes };
}

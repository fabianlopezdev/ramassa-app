import type { FlashListProps } from '@shopify/flash-list';

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

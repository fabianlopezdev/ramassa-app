/**
 * The style for the tablet shells' `TabSlot` (RAPP-415). TabSlot's own
 * container does not shrink, so on web it grows with its content, and a
 * virtualized list (the message threads) then keeps growing it without end:
 * the page got about 1,000 px taller every few hundred milliseconds and the
 * send button never held still. A zero basis keeps the slot to the space
 * beside the sidebar.
 */
export const boundedTabSlotStyle = { flexBasis: 0, flexShrink: 1, minHeight: 0 } as const;

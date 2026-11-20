/**
 * The spacing of every screen, taken from Inici (RAPP-889): the page's side and
 * top padding, the gap between one block and the next, and the gap between a
 * title and what it heads. Screens, sheets, forms and `ScreenSection` read
 * these, so a change here moves the whole app together.
 */

/** Between one block of a screen and the next: header, sections, cards, actions. */
export const screenBlockGapClassName = 'gap-lg';

/** Between a title and the content it heads: a section, or a tab and its switch. */
export const titleToContentGapClassName = 'gap-md';

/** The padding of a screen's or a sheet's scrolling content, with its block gap. */
export const screenContentClassName = 'gap-lg p-lg';

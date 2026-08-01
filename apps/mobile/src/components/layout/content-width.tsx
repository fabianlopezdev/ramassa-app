/**
 * The ceiling a player screen's content stops growing at (RAPP-80).
 *
 * This app is written for a phone and ALSO shipped to the browser as an Expo Web
 * export (ADR-008), so every screen inherits the phone layout verbatim. On a
 * desktop viewport that is wrong in one specific way: anything full-width by
 * design, which on a handset means "as wide as the screen", becomes as wide as
 * the window. The login screen showed it plainly, with a single email field and
 * a "Send me a link" button spanning a whole monitor.
 *
 * The phone layout is correct and is not being changed. What is being added is a
 * ceiling, and it only exists above the `sm` breakpoint (640px). No handset this
 * app supports reaches that width in portrait, and the app is portrait-locked, so
 * the native layout provably cannot be affected. On a tablet or a browser the
 * content stops at the ceiling and centres.
 *
 * Wrap the CONTENT of a screen, not the screen: the background, the safe area and
 * the scroll view stay full-bleed, and only the column inside them is bounded.
 * That is what keeps a page from looking like a narrow card floating on a wide
 * white sheet.
 *
 * Two widths rather than a free-form prop, because there are only two shapes of
 * player screen: a column of inputs, and a column of reading or listing. Both
 * come from `tokens.contentWidth`, so a change there moves both apps.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

interface ContentWidthProps {
  readonly children: ReactNode;
  /** Extra layout classes for the column itself (gaps, padding, alignment). */
  readonly className?: string;
}

/** A single column of inputs: sign-in, the onboarding steps, any short form. */
export function FormWidth({ children, className = '' }: ContentWidthProps) {
  return <View className={`w-full sm:max-w-form sm:self-center ${className}`}>{children}</View>;
}

/** A column of reading or listing content: feeds, articles, directories. */
export function PageWidth({ children, className = '' }: ContentWidthProps) {
  return <View className={`w-full sm:max-w-page sm:self-center ${className}`}>{children}</View>;
}

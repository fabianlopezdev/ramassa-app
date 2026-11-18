import { I18nManager } from 'react-native';
import type { IconName } from './icon-set';

/** The arrow that points the way forward: right in most languages, left in Arabic and Farsi. */
export const FORWARD_CHEVRON: IconName = I18nManager.isRTL ? 'chevron-left' : 'chevron-right';

/** The arrow that points the way back: the mirror of the forward one. */
export const BACKWARD_CHEVRON: IconName = I18nManager.isRTL ? 'chevron-right' : 'chevron-left';

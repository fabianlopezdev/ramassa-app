/**
 * Layout-direction plumbing for both platforms (ADR-006). The mobile side takes
 * an `I18nManager`-shaped argument and the web side a `document`-shaped one, so
 * neither React Native nor the DOM is imported here and both are unit-testable.
 */

import { getLanguageDirection, isRtlLanguage } from './languages';

/** The subset of React Native's `I18nManager` the direction sync needs. */
export interface NativeLayoutManager {
  isRTL: boolean;
  allowRTL(value: boolean): void;
  forceRTL(value: boolean): void;
}

/**
 * Aligns the native layout direction with the language. Returns `true` when the
 * direction changed: React Native only applies a direction flip after an app
 * restart, so the caller must then reload the app for the new layout to show.
 */
export function syncNativeLayoutDirection(manager: NativeLayoutManager, language: string): boolean {
  const shouldBeRtl = isRtlLanguage(language);
  manager.allowRTL(true);
  if (manager.isRTL === shouldBeRtl) {
    return false;
  }
  manager.forceRTL(shouldBeRtl);
  return true;
}

/** The subset of `document` the web direction sync needs. */
export interface DocumentLike {
  documentElement: { setAttribute(name: string, value: string): void };
}

/** Sets `dir` and `lang` on `<html>`; the web needs no restart. */
export function applyDocumentDirection(target: DocumentLike, language: string): void {
  target.documentElement.setAttribute('dir', getLanguageDirection(language));
  target.documentElement.setAttribute('lang', language);
}

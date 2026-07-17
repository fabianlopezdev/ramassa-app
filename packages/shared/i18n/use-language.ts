import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  getLanguageDirection,
  isSupportedLanguage,
  type LayoutDirection,
  type SupportedLanguage,
} from './languages';

export interface UseLanguageResult {
  language: SupportedLanguage;
  direction: LayoutDirection;
  isRtl: boolean;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
}

/**
 * The runtime language switch (ADR-006). The settings UI that calls
 * `setLanguage` is a later feature; the hook is the stable contract for it.
 * Direction is derived from the language, never stored.
 */
export function useLanguage(): UseLanguageResult {
  const { i18n } = useTranslation();

  const resolvedLanguage = i18n.resolvedLanguage ?? i18n.language;
  const language = isSupportedLanguage(resolvedLanguage) ? resolvedLanguage : DEFAULT_LANGUAGE;
  const direction = getLanguageDirection(language);

  const setLanguage = useCallback(
    async (nextLanguage: SupportedLanguage) => {
      await i18n.changeLanguage(nextLanguage);
    },
    [i18n],
  );

  return { language, direction, isRtl: direction === 'rtl', setLanguage };
}

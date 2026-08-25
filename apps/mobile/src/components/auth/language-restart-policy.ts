import { getLanguageDirection, type SupportedLanguage } from '@ramassa/shared/i18n';

export function shouldRestartForLanguage(
  nativeIsRtl: boolean,
  language: SupportedLanguage,
): boolean {
  return nativeIsRtl !== (getLanguageDirection(language) === 'rtl');
}

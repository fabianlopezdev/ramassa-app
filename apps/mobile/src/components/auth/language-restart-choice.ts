import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { shouldRestartForLanguage } from './language-restart-policy';

interface LanguageRestartChoice {
  readonly isRtl: boolean;
  readonly language: SupportedLanguage;
  readonly setLanguage: (language: SupportedLanguage) => Promise<void>;
  readonly setNeedsRestart: (needsRestart: boolean) => void;
}

export async function chooseLanguageWithRestart({
  isRtl,
  language,
  setLanguage,
  setNeedsRestart,
}: LanguageRestartChoice): Promise<boolean> {
  const directionChanges = shouldRestartForLanguage(isRtl, language);
  setNeedsRestart(directionChanges);
  await setLanguage(language);
  return directionChanges;
}

import { reloadAppAsync } from 'expo';
import { useCallback, useState } from 'react';
import { I18nManager } from 'react-native';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { shouldRestartForLanguage } from './language-restart-policy';

type SetLanguage = (language: SupportedLanguage) => Promise<void>;

export function useLanguageRestart(setLanguage: SetLanguage) {
  const [needsRestart, setNeedsRestart] = useState(false);

  const choose = useCallback(
    async (language: SupportedLanguage) => {
      const directionChanges = shouldRestartForLanguage(I18nManager.isRTL, language);
      await setLanguage(language);
      setNeedsRestart(directionChanges);
      return directionChanges;
    },
    [setLanguage],
  );

  const dismissRestart = useCallback(() => setNeedsRestart(false), []);
  const restart = useCallback(async () => reloadAppAsync(), []);

  return { choose, dismissRestart, needsRestart, restart };
}

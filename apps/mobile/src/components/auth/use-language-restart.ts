import { reloadAppAsync } from 'expo';
import { useCallback, useState } from 'react';
import { I18nManager } from 'react-native';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { chooseLanguageWithRestart } from './language-restart-choice';

type SetLanguage = (language: SupportedLanguage) => Promise<void>;

export function useLanguageRestart(setLanguage: SetLanguage) {
  const [needsRestart, setNeedsRestart] = useState(false);

  const choose = useCallback(
    async (language: SupportedLanguage) => {
      return chooseLanguageWithRestart({
        isRtl: I18nManager.isRTL,
        language,
        setLanguage,
        setNeedsRestart,
      });
    },
    [setLanguage],
  );

  const dismissRestart = useCallback(() => setNeedsRestart(false), []);
  const restart = useCallback(async () => reloadAppAsync(), []);

  return { choose, dismissRestart, needsRestart, restart };
}

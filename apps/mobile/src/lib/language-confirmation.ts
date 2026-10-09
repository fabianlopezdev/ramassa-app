export const LANGUAGE_CONFIRMED_RELOAD_KEY = 'auth.language-confirmed-reload';

interface ConfirmationStorage {
  getBoolean(key: string): boolean | undefined;
  remove(key: string): void;
}

export function consumeLanguageConfirmation(storage: ConfirmationStorage): boolean {
  if (storage.getBoolean(LANGUAGE_CONFIRMED_RELOAD_KEY) !== true) return false;
  storage.remove(LANGUAGE_CONFIRMED_RELOAD_KEY);
  return true;
}

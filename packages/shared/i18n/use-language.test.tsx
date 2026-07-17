import { act, render } from '@testing-library/react';
import { describe, expect, test } from 'bun:test';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from './create-i18n';
import { createInMemoryLanguageStorage } from './language-storage';
import { useLanguage } from './use-language';

// This package compiles without DOM lib types (it is platform-neutral), so the
// rendered element is read through a minimal structural type.
function textContentOf(element: unknown): string | null {
  return (element as { textContent: string | null }).textContent;
}

function LanguageProbe() {
  const { language, direction, isRtl } = useLanguage();
  return <span data-testid="probe">{`${language}|${direction}|${String(isRtl)}`}</span>;
}

describe('useLanguage', () => {
  test('exposes the current language with its derived direction', () => {
    const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });
    const { getByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <LanguageProbe />
      </I18nextProvider>,
    );
    expect(textContentOf(getByTestId('probe'))).toBe('ca|ltr|false');
  });

  test('setLanguage switches at runtime, flips direction, and persists', async () => {
    const storage = createInMemoryLanguageStorage();
    const i18n = createI18n({ languageStorage: storage });

    let setLanguageFromHook: ((language: 'fa') => Promise<void>) | undefined;
    function Capture() {
      const { setLanguage } = useLanguage();
      setLanguageFromHook = setLanguage;
      return <LanguageProbe />;
    }

    const { getByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <Capture />
      </I18nextProvider>,
    );

    await act(async () => {
      await setLanguageFromHook?.('fa');
    });

    expect(textContentOf(getByTestId('probe'))).toBe('fa|rtl|true');
    expect(storage.getLanguage()).toBe('fa');
  });
});

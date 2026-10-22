import { expect, test } from 'bun:test';
import { bundledAppTermsContent, type CurrentAppTerms } from '@ramassa/shared/intake';
import ar from '../../../../packages/shared/i18n/locales/ar/onboarding.json';
import ca from '../../../../packages/shared/i18n/locales/ca/onboarding.json';
import en from '../../../../packages/shared/i18n/locales/en/onboarding.json';
import es from '../../../../packages/shared/i18n/locales/es/onboarding.json';
import fa from '../../../../packages/shared/i18n/locales/fa/onboarding.json';
import { appTermsWording } from './app-terms-wording';

const bundledText = (key: string) => (es as Record<string, string>)[key] ?? key;
const bundled = bundledAppTermsContent({ ca, es, en, ar, fa });

test('without a published version she reads the bundled text, version 1 (RAPP-613)', () => {
  const wording = appTermsWording(null, 'es', bundledText);
  expect(wording.body).toBe(es.termsBody);
  expect(wording.points).toHaveLength(4);
  expect(wording.points[1]?.title).toBe(es.termsPointProtectedTitle);
  expect(wording.acceptLabel).toBe(es.termsAcceptLabel);
  expect(wording.localeShown).toBe('es');
  expect(wording.versionId).toBeNull();
  expect(wording.termsVersion).toBe('1');
});

test('a published version replaces every text, in her language or Catalan', () => {
  const terms: CurrentAppTerms = {
    id: '5eed0000-0000-4000-8099-000000000002',
    versionNumber: 2,
    isDraft: false,
    content: {
      ...bundled,
      body: { ca: 'Text legal nou.' },
      points: [{ title: { ca: 'Un sol punt', es: 'Un solo punto' }, body: { ca: 'Explicació.' } }],
    },
  };
  const wording = appTermsWording(terms, 'es', bundledText);
  expect(wording.body).toBe('Text legal nou.');
  // The body was shown in Catalan: her acceptance records it.
  expect(wording.localeShown).toBe('ca');
  expect(wording.points).toEqual([{ title: 'Un solo punto', body: 'Explicació.' }]);
  expect(wording.title).toBe(es.termsTitle);
  expect(wording.termsVersion).toBe('2');
  expect(wording.versionId).toBe(terms.id);
});

test('a test player shown the draft accepts it as the draft (RAPP-619)', () => {
  const terms: CurrentAppTerms = {
    id: '5eed0000-0000-4000-8099-000000000003',
    versionNumber: null,
    isDraft: true,
    content: { ...bundled, body: { ca: 'Esborrany.' } },
  };
  const wording = appTermsWording(terms, 'ca', bundledText);
  expect(wording.body).toBe('Esborrany.');
  expect(wording.termsVersion).toBe('draft');
  expect(wording.versionId).toBe(terms.id);
});

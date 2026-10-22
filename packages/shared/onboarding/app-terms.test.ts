import { describe, expect, test } from 'bun:test';
import ar from '../i18n/locales/ar/onboarding.json';
import ca from '../i18n/locales/ca/onboarding.json';
import en from '../i18n/locales/en/onboarding.json';
import es from '../i18n/locales/es/onboarding.json';
import fa from '../i18n/locales/fa/onboarding.json';
import {
  appTermsDraftSchema,
  appTermsFromCatalog,
  bundledAppTermsContent,
  publishAppTermsDraft,
  resolveAppTerms,
  saveAppTermsDraft,
  type AppTermsContent,
} from './app-terms';

const bundled = bundledAppTermsContent({ ca, es, en, ar, fa });

describe('version 1 is the bundled text (RAPP-613)', () => {
  test('every field carries the five languages, word for word', () => {
    expect(bundled.title).toEqual({
      ca: ca.termsTitle,
      es: es.termsTitle,
      en: en.termsTitle,
      ar: ar.termsTitle,
      fa: fa.termsTitle,
    });
    expect(bundled.body.fa).toBe(fa.termsBody);
    expect(bundled.points).toHaveLength(4);
    expect(bundled.points[3]?.body.ar).toBe(ar.termsPointControlBody);
    expect(bundled.accept_label.es).toBe(es.termsAcceptLabel);
    expect(bundled.media_label.en).toBe(en.mediaConsentLabel);
    expect(bundled.media_hint.ca).toBe(ca.mediaConsentHint);
  });

  test('it is a valid version', () => {
    expect(appTermsDraftSchema.safeParse(bundled).success).toBe(true);
  });
});

describe('a draft staff write', () => {
  const draft: AppTermsContent = {
    ...bundled,
    body: { ca: 'Nou text legal.', es: '' },
  };

  test('needs Catalan in every field; other languages are optional', () => {
    expect(appTermsDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      appTermsDraftSchema.safeParse({ ...draft, body: { es: 'Solo castellano' } }).success,
    ).toBe(false);
    expect(appTermsDraftSchema.safeParse({ ...draft, points: [] }).success).toBe(false);
  });

  test('her language, or Catalan when it is missing, and the language really shown', () => {
    const resolved = resolveAppTerms(draft, 'es');
    expect(resolved.body).toBe('Nou text legal.');
    expect(resolved.localeShown).toBe('ca');
    expect(resolveAppTerms(bundled, 'fa').localeShown).toBe('fa');
    expect(resolveAppTerms(bundled, 'fa').points[0]?.title).toBe(fa.termsPointPurposeTitle);
  });
});

describe('the catalog carries the current version', () => {
  test('a valid version is read; a malformed one falls back to none', () => {
    const current = appTermsFromCatalog({
      id: '5eed0000-0000-4000-8099-000000000001',
      version_number: 2,
      content: bundled,
    });
    expect(current?.versionNumber).toBe(2);
    expect(appTermsFromCatalog({ id: 'x', version_number: 2, content: {} })).toBeNull();
    expect(appTermsFromCatalog(null)).toBeNull();
  });
});

describe('staff save and publish through the database', () => {
  function recordingClient() {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args?: unknown) => {
        calls.push([name, args]);
        return { data: name === 'publish_app_terms_draft' ? 3 : null, error: null };
      },
    } as unknown as Parameters<typeof saveAppTermsDraft>[0];
    return { calls, client };
  }

  test('a draft is cleaned of empty languages before it is saved', async () => {
    const { calls, client } = recordingClient();
    await saveAppTermsDraft(client, { ...bundled, body: { ca: ' Text ', es: '  ' } });
    const [, args] = calls[0] as [string, { p_content: AppTermsContent }];
    expect(calls[0]).toEqual(['save_app_terms_draft', expect.anything()]);
    expect(args.p_content.body).toEqual({ ca: 'Text' });
  });

  test('a draft without Catalan never reaches the database', async () => {
    const { calls, client } = recordingClient();
    await expect(
      saveAppTermsDraft(client, { ...bundled, title: { en: 'Only English' } }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test('publishing returns the new version number', async () => {
    const { client } = recordingClient();
    expect(await publishAppTermsDraft(client)).toBe(3);
  });
});

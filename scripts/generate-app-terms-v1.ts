/**
 * Prints version 1 of the app terms (RAPP-613) as the SQL literal its
 * migration holds, generated from the bundled locale files so the text is
 * identical to what the app showed. A parity test keeps the migration block
 * equal to this output.
 *
 *   bun run scripts/generate-app-terms-v1.ts
 */
import { bundledAppTermsContent } from '@ramassa/shared/intake';
import ar from '../packages/shared/i18n/locales/ar/onboarding.json';
import ca from '../packages/shared/i18n/locales/ca/onboarding.json';
import en from '../packages/shared/i18n/locales/en/onboarding.json';
import es from '../packages/shared/i18n/locales/es/onboarding.json';
import fa from '../packages/shared/i18n/locales/fa/onboarding.json';

export function appTermsVersionOneSql(): string {
  const json = JSON.stringify(bundledAppTermsContent({ ca, es, en, ar, fa }));
  return `$app_terms_v1$${json}$app_terms_v1$::jsonb`;
}

if (import.meta.main) {
  console.log(appTermsVersionOneSql());
}

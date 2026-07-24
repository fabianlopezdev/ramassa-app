/**
 * The fixture roster (RAPP-18): the people who exist in a freshly reset local
 * database, mirrored here so tests, the dev menu, and Maestro flows all talk
 * about the same twenty-five accounts.
 *
 * `supabase/seed.sql` holds the same roster in SQL (it cannot import
 * TypeScript). `tests/seed-fixtures.test.ts` fails the build if the two ever
 * disagree, so this file can be trusted as the description of what is in the
 * local database.
 *
 * Two deliberate choices:
 *
 * 1. **Names are in their own script.** Arabic, Farsi, and Cyrillic names are
 *    written as such, never transliterated. RTL layout mirroring and the
 *    bundled Arabic/Farsi fonts (ADR-006) can only be tested honestly against
 *    real script; "Amina Al-Hassan" would render fine and prove nothing.
 * 2. **Ukrainian participants carry `es` or `en` as their app language.** The
 *    program serves Ukrainian arrivals, but the app ships five languages and
 *    Ukrainian is not one of them (ADR-006). The roster reflects the real
 *    mismatch rather than inventing a locale.
 *
 * Every address is under the reserved `.test` TLD (RFC 6761) so a fixture can
 * never reach a real mailbox. No real participant data is ever committed.
 */

import type { LanguageCode } from '../schemas';

/** The tenant every fixture belongs to. Ordinal 0 of the seed namespace. */
export const SEED_ORGANIZATION_ID = '5eed0000-0000-4000-8000-000000000000';
export const SEED_ORGANIZATION_SLUG = 'ramassa';

/**
 * The password every seeded account shares. Local and CI only: these accounts
 * exist solely in a database that `supabase db reset` rebuilds from this repo,
 * and the seed file is never applied to production.
 */
export const SEED_ACCOUNT_PASSWORD = 'ramassa-dev-password';

/**
 * Seed user IDs are derived from an ordinal rather than listed, so the SQL and
 * the TypeScript can compute the same UUID without a shared table of literals.
 * The `5eed` prefix marks a row as fixture data at a glance, and keeps seeded
 * rows from ever colliding with the self-contained pgTAP fixtures.
 */
export const SEED_USER_ID_PREFIX = '5eed0000-0000-4000-8000-';

export function seedUserId(ordinal: number): string {
  return `${SEED_USER_ID_PREFIX}${String(ordinal).padStart(12, '0')}`;
}

export interface PersonFixture {
  /** Position in the seed namespace; feeds `seedUserId`. */
  readonly ordinal: number;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredLanguage: LanguageCode;
  readonly nationality: string;
  readonly city: string;
}

/**
 * Staff, admin, and the two social-entity contacts (ordinals 1-5). Entity
 * accounts are a named person AT a referring entity, which is why they carry a
 * `referenceEntity` the participants' rows point back to.
 */
export interface StaffFixture extends PersonFixture {
  readonly role: 'admin' | 'staff' | 'entity';
  readonly referenceEntity?: string;
}

export const STAFF_FIXTURES: readonly StaffFixture[] = [
  {
    ordinal: 1,
    role: 'admin',
    email: 'laia.ferrer@example.test',
    firstName: 'Laia',
    lastName: 'Ferrer',
    preferredLanguage: 'ca',
    nationality: 'Espanya',
    city: 'Vic',
  },
  {
    ordinal: 2,
    role: 'staff',
    email: 'marta.puig@example.test',
    firstName: 'Marta',
    lastName: 'Puig',
    preferredLanguage: 'ca',
    nationality: 'Espanya',
    city: 'Vic',
  },
  {
    ordinal: 3,
    role: 'staff',
    email: 'nuria.serra@example.test',
    firstName: 'Núria',
    lastName: 'Serra',
    preferredLanguage: 'ca',
    nationality: 'Espanya',
    city: 'Manlleu',
  },
  {
    ordinal: 4,
    role: 'entity',
    email: 'silvia.bosch@example.test',
    firstName: 'Sílvia',
    lastName: 'Bosch',
    preferredLanguage: 'ca',
    nationality: 'Espanya',
    city: 'Vic',
    referenceEntity: 'Creu Roja Osona',
  },
  {
    ordinal: 5,
    role: 'entity',
    email: 'jordi.camps@example.test',
    firstName: 'Jordi',
    lastName: 'Camps',
    preferredLanguage: 'es',
    nationality: 'Espanya',
    city: 'Vic',
    referenceEntity: 'CEAR Catalunya',
  },
];

/**
 * The twenty participants (ordinals 11-30). The gap after the staff block keeps
 * a role readable straight off a UUID while debugging.
 */
export const PARTICIPANT_FIXTURES: readonly PersonFixture[] = [
  {
    ordinal: 11,
    email: 'amina.alhassan@example.test',
    firstName: 'أمينة',
    lastName: 'الحسن',
    preferredLanguage: 'ar',
    nationality: 'Síria',
    city: 'Vic',
  },
  {
    ordinal: 12,
    email: 'fatima.zahra@example.test',
    firstName: 'فاطمة',
    lastName: 'الزهراء',
    preferredLanguage: 'ar',
    nationality: 'Marroc',
    city: 'Manlleu',
  },
  {
    ordinal: 13,
    email: 'mariam.benali@example.test',
    firstName: 'مريم',
    lastName: 'بن علي',
    preferredLanguage: 'ar',
    nationality: 'Tunísia',
    city: 'Vic',
  },
  {
    ordinal: 14,
    email: 'zeinab.haddad@example.test',
    firstName: 'زينب',
    lastName: 'حداد',
    preferredLanguage: 'ar',
    nationality: 'Síria',
    city: 'Torelló',
  },
  {
    ordinal: 15,
    email: 'souad.almansouri@example.test',
    firstName: 'سعاد',
    lastName: 'المنصوري',
    preferredLanguage: 'ar',
    nationality: 'Marroc',
    city: 'Manlleu',
  },
  {
    ordinal: 16,
    email: 'zahra.rezaei@example.test',
    firstName: 'زهرا',
    lastName: 'رضایی',
    preferredLanguage: 'fa',
    nationality: 'Afganistan',
    city: 'Vic',
  },
  {
    ordinal: 17,
    email: 'fereshteh.ahmadi@example.test',
    firstName: 'فرشته',
    lastName: 'احمدی',
    preferredLanguage: 'fa',
    nationality: 'Afganistan',
    city: 'Roda de Ter',
  },
  {
    ordinal: 18,
    email: 'samira.karimi@example.test',
    firstName: 'سمیرا',
    lastName: 'کریمی',
    preferredLanguage: 'fa',
    nationality: 'Iran',
    city: 'Vic',
  },
  {
    ordinal: 19,
    email: 'ruqiya.hosseini@example.test',
    firstName: 'رقیه',
    lastName: 'حسینی',
    preferredLanguage: 'fa',
    nationality: 'Afganistan',
    city: 'Manlleu',
  },
  {
    ordinal: 20,
    email: 'oksana.kovalchuk@example.test',
    firstName: 'Оксана',
    lastName: 'Ковальчук',
    preferredLanguage: 'es',
    nationality: 'Ucraïna',
    city: 'Vic',
  },
  {
    ordinal: 21,
    email: 'iryna.melnyk@example.test',
    firstName: 'Ірина',
    lastName: 'Мельник',
    preferredLanguage: 'en',
    nationality: 'Ucraïna',
    city: 'Torelló',
  },
  {
    ordinal: 22,
    email: 'nataliia.shevchenko@example.test',
    firstName: 'Наталія',
    lastName: 'Шевченко',
    preferredLanguage: 'es',
    nationality: 'Ucraïna',
    city: 'Vic',
  },
  {
    ordinal: 23,
    email: 'yuliia.bondarenko@example.test',
    firstName: 'Юлія',
    lastName: 'Бондаренко',
    preferredLanguage: 'en',
    nationality: 'Ucraïna',
    city: 'Manlleu',
  },
  {
    ordinal: 24,
    email: 'maria.rojas@example.test',
    firstName: 'María Fernanda',
    lastName: 'Rojas',
    preferredLanguage: 'es',
    nationality: 'Colòmbia',
    city: 'Vic',
  },
  {
    ordinal: 25,
    email: 'yolanda.quispe@example.test',
    firstName: 'Yolanda',
    lastName: 'Quispe',
    preferredLanguage: 'es',
    nationality: 'Perú',
    city: 'Manlleu',
  },
  {
    ordinal: 26,
    email: 'rosa.mamani@example.test',
    firstName: 'Rosa',
    lastName: 'Mamani',
    preferredLanguage: 'es',
    nationality: 'Bolívia',
    city: 'Vic',
  },
  {
    ordinal: 27,
    email: 'daniela.ortega@example.test',
    firstName: 'Daniela',
    lastName: 'Ortega',
    preferredLanguage: 'ca',
    nationality: 'Veneçuela',
    city: 'Torelló',
  },
  {
    ordinal: 28,
    email: 'aissatou.diallo@example.test',
    firstName: 'Aissatou',
    lastName: 'Diallo',
    preferredLanguage: 'es',
    nationality: 'Senegal',
    city: 'Vic',
  },
  {
    ordinal: 29,
    email: 'fatoumata.camara@example.test',
    firstName: 'Fatoumata',
    lastName: 'Camara',
    preferredLanguage: 'ca',
    nationality: 'Gàmbia',
    city: 'Manlleu',
  },
  {
    ordinal: 30,
    email: 'blanca.ribes@example.test',
    firstName: 'Blanca',
    lastName: 'Ribes',
    preferredLanguage: 'ca',
    nationality: 'Espanya',
    city: 'Vic',
  },
];

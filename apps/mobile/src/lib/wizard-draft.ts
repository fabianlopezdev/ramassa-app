/**
 * Her wizard draft by field (RAPP-663). Pure: no React, so bun tests run it.
 *
 * Her phone keeps the draft as her answers by field id (version 2), every
 * field alike: the app's and the team's. The wizard screens still edit one
 * form each (`OnboardingDraft`, the shape version 1 stored), so the draft
 * store turns the stored answers into those forms when a screen loads it, and
 * the forms back into answers when a screen saves it.
 *
 * A save writes only the form values that changed since the load. An answer
 * no screen touched stays exactly as stored, whatever its form would read.
 * A version 1 draft is converted the same way, every value of it at once.
 */
import { AppError } from '@ramassa/shared/errors';
import {
  appAnswersFromForm,
  appFieldIds,
  appFormField,
  appFormValues,
  isAppFormKey,
  type CustomAnswers,
  type CustomAnswerValue,
  type SystemFieldIndex,
} from '@ramassa/shared/intake-builder';
import {
  isStoredOnboardingDraft,
  type AccountOnboardingDraftStore,
  type OnboardingDraft,
  type OnboardingDraftStep,
  type OnboardingDraftStore,
  type StoredOnboardingDraft,
} from '@ramassa/shared/onboarding-drafts';
import { composeIsoBirthDate, normalizeDecimalDigits } from './onboarding-form';

const SECTIONS = ['identity', 'documentation', 'logistics', 'season'] as const;
type Section = (typeof SECTIONS)[number];
type SectionValues = Record<string, unknown>;

/** The form names each screen keeps, in the section it keeps them in. */
const SECTION_KEYS: Readonly<Record<Section, readonly string[]>> = {
  identity: ['placeOfBirth', 'nationality'],
  documentation: ['documentType', 'documentNumber', 'documentName'],
  logistics: [
    'phone',
    'address',
    'city',
    'postalCode',
    'referenceEntity',
    'referenceContactName',
    'hasDependents',
    'numDependents',
    'clothingSize',
    'shoeSize',
  ],
  season: [
    'applicantStatus',
    'applicantStatusDetails',
    'supportingEntities',
    'childcareNeed',
    'specificNeeds',
  ],
};

/** Her names travel as she typed them (stored as her answers, RAPP-693); her app language is her account's. */
const ACCOUNT_KEYS = ['firstName', 'lastName', 'preferredLanguage'] as const;
const DATE_KEYS = ['day', 'month', 'year'] as const;
/** "None" to the entity question is an answer with no value. */
const ENTITY_NONE = 'logistics.referenceEntity';

// The date of birth as three boxes -------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The three boxes as one answer: a whole date as `YYYY-MM-DD`, and what she
 * has typed so far as it is, so the boxes read back the same.
 */
export function dateAnswerOfParts(day: unknown, month: unknown, year: unknown): string {
  const parts = [day, month, year].map((part) => (typeof part === 'string' ? part.trim() : ''));
  const [d = '', m = '', y = ''] = parts;
  if (parts.every((part) => part === '')) return '';
  const [nd, nm, ny] = parts.map(normalizeDecimalDigits);
  if (/^\d{1,2}$/.test(nd ?? '') && /^\d{1,2}$/.test(nm ?? '') && /^\d{4}$/.test(ny ?? '')) {
    return composeIsoBirthDate(d, m, y);
  }
  return `${y}-${m}-${d}`;
}

/** A date answer as the three boxes: a whole date without leading zeros, as staff seeded it. */
export function datePartsOfAnswer(value: unknown): {
  readonly day: string;
  readonly month: string;
  readonly year: string;
} {
  if (typeof value !== 'string' || value === '') return { day: '', month: '', year: '' };
  const [year = '', month = '', day = ''] = value.split('-');
  return ISO_DATE.test(value)
    ? { day: String(Number(day)), month: String(Number(month)), year }
    : { day, month, year };
}

// Stored answers to the screens' forms ----------------------------------------------------------

function pick(values: Readonly<Record<string, unknown>>, keys: readonly string[]): SectionValues {
  return Object.fromEntries(
    keys.flatMap((key) => (values[key] === undefined ? [] : [[key, values[key]]])),
  );
}

/** What a screen shows that no answer holds, for one section. */
function screenValues(stored: StoredOnboardingDraft, section: Section): SectionValues {
  const prefix = `${section}.`;
  return Object.fromEntries(
    Object.entries(stored.screen ?? {}).flatMap(([key, value]) =>
      key.startsWith(prefix) ? [[key.slice(prefix.length), value]] : [],
    ),
  );
}

/** Her stored draft as the screens' forms. */
export function viewOfStoredDraft(
  fields: SystemFieldIndex,
  stored: StoredOnboardingDraft,
): OnboardingDraft {
  const answers = stored.answers ?? {};
  const values = appFormValues(fields, answers) as Record<string, unknown>;
  const count = appFormField(fields, 'numDependents');
  const typedCount = count === undefined ? undefined : answers[count.id];
  if (typeof typedCount === 'number' || typeof typedCount === 'string') {
    values.numDependents = String(typedCount);
  }
  const appIds = appFieldIds(fields);
  const birth = appFormField(fields, 'dateOfBirth');
  const custom = Object.fromEntries(Object.entries(answers).filter(([id]) => !appIds.has(id)));
  return {
    currentStep: stored.currentStep,
    identity: {
      ...stored.account,
      ...(birth === undefined || answers[birth.id] === undefined
        ? {}
        : datePartsOfAnswer(answers[birth.id])),
      ...pick(values, SECTION_KEYS.identity),
      ...screenValues(stored, 'identity'),
    },
    documentation: {
      ...pick(values, SECTION_KEYS.documentation),
      ...screenValues(stored, 'documentation'),
    },
    logistics: { ...pick(values, SECTION_KEYS.logistics), ...screenValues(stored, 'logistics') },
    season: { ...pick(values, SECTION_KEYS.season), ...screenValues(stored, 'season') },
    ...(Object.keys(custom).length === 0 ? {} : { custom }),
    ...(stored.terms === undefined ? {} : { terms: stored.terms }),
    ...(stored.signatures === undefined ? {} : { signatures: stored.signatures }),
    ...(stored.consents === undefined ? {} : { consents: stored.consents }),
    ...(stored.scenarioStamp === undefined ? {} : { scenarioStamp: stored.scenarioStamp }),
  };
}

// The screens' forms to stored answers ----------------------------------------------------------

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sectionOf(view: OnboardingDraft, section: Section): SectionValues {
  return (view[section] ?? {}) as SectionValues;
}

function accountOf(identity: SectionValues): StoredOnboardingDraft['account'] {
  const account = Object.fromEntries(
    ACCOUNT_KEYS.flatMap((key) =>
      typeof identity[key] === 'string' ? [[key, identity[key] as string]] : [],
    ),
  );
  return Object.keys(account).length === 0 ? undefined : account;
}

/**
 * The screens' forms as her stored draft. Only what changed since `previous`
 * (what the screen loaded) is written; with no previous draft, everything is.
 */
export function storedDraftOfView(
  fields: SystemFieldIndex,
  view: OnboardingDraft,
  previous: StoredOnboardingDraft | null,
): StoredOnboardingDraft {
  const before = previous === null ? null : viewOfStoredDraft(fields, previous);
  const appIds = appFieldIds(fields);
  const answers: Record<string, CustomAnswerValue> = {};
  for (const [id, value] of Object.entries(previous?.answers ?? {})) {
    if (appIds.has(id)) answers[id] = value;
  }
  // The team's fields are edited as answers already: the view's are hers.
  for (const [id, value] of Object.entries(view.custom ?? {})) {
    if (!appIds.has(id)) answers[id] = value;
  }
  const screen: Record<string, unknown> = { ...previous?.screen };

  const setAnswers = (written: Readonly<Record<string, CustomAnswerValue | null>>) => {
    for (const [id, value] of Object.entries(written)) answers[id] = value ?? '';
  };
  const removeAnswer = (key: string) => {
    if (!isAppFormKey(key)) return;
    const field = appFormField(fields, key);
    if (field !== undefined) delete answers[field.id];
    if (key === 'specificNeeds') {
      const details = fields.get('specific_needs_details');
      if (details !== undefined) delete answers[details.id];
    }
  };

  for (const section of SECTIONS) {
    const now = sectionOf(view, section);
    const was = before === null ? {} : sectionOf(before, section);
    const keys = [...new Set([...Object.keys(now), ...Object.keys(was)])];
    for (const key of keys) {
      if ((ACCOUNT_KEYS as readonly string[]).includes(key) && section === 'identity') continue;
      if (same(now[key], was[key])) continue;
      const screenKey = `${section}.${key}`;
      const value = now[key];
      if (section === 'identity' && (DATE_KEYS as readonly string[]).includes(key)) {
        const birth = appFormField(fields, 'dateOfBirth');
        if (birth === undefined) {
          screen[screenKey] = value;
          continue;
        }
        const date = dateAnswerOfParts(now.day, now.month, now.year);
        if (
          date === '' &&
          now.day === undefined &&
          now.month === undefined &&
          now.year === undefined
        )
          delete answers[birth.id];
        else answers[birth.id] = date;
        continue;
      }
      if (screenKey === ENTITY_NONE) {
        if (value === null) {
          screen[ENTITY_NONE] = null;
          removeAnswer(key);
          continue;
        }
        delete screen[ENTITY_NONE];
      }
      if (!isAppFormKey(key) || !SECTION_KEYS[section].includes(key)) {
        if (value === undefined) delete screen[screenKey];
        else screen[screenKey] = value;
        continue;
      }
      if (appFormField(fields, key) === undefined) {
        // Its field is missing or no longer of a type this screen writes: kept as typed.
        if (value === undefined) delete screen[screenKey];
        else screen[screenKey] = value;
        continue;
      }
      if (value === undefined) removeAnswer(key);
      else setAnswers(appAnswersFromForm(fields, { [key]: value }, { asTyped: true }));
    }
  }

  const account = accountOf(sectionOf(view, 'identity'));
  return {
    version: 2,
    currentStep: view.currentStep,
    ...(account === undefined ? {} : { account }),
    ...(Object.keys(answers).length === 0 ? {} : { answers }),
    ...(Object.keys(screen).length === 0 ? {} : { screen }),
    ...(view.terms === undefined ? {} : { terms: view.terms }),
    ...(view.signatures === undefined ? {} : { signatures: view.signatures }),
    ...(view.consents === undefined ? {} : { consents: view.consents }),
    ...(view.scenarioStamp === undefined ? {} : { scenarioStamp: view.scenarioStamp }),
  };
}

/** A version 1 draft on her phone, converted: nothing she typed is lost. */
function upgradedDraft(fields: SystemFieldIndex, legacy: OnboardingDraft): StoredOnboardingDraft {
  return storedDraftOfView(fields, legacy, null);
}

/**
 * A new draft with what staff or an entity already answered (RAPP-300): her
 * names, and her stored answers to the app's fields. The team's fields are
 * read from her stored answers on each screen, under her draft.
 */
export function seededDraft(
  fields: SystemFieldIndex,
  seed: {
    readonly currentStep: OnboardingDraftStep;
    readonly scenarioStamp: string | null;
    readonly names: { readonly firstName?: string; readonly lastName?: string };
    readonly stored: CustomAnswers;
  },
): StoredOnboardingDraft {
  const appIds = appFieldIds(fields);
  const answers = Object.fromEntries(
    Object.entries(seed.stored).filter(([id, value]) => appIds.has(id) && value !== null),
  );
  const account = accountOf(seed.names as SectionValues);
  return {
    version: 2,
    currentStep: seed.currentStep,
    ...(account === undefined ? {} : { account }),
    ...(Object.keys(answers).length === 0 ? {} : { answers }),
    ...(seed.scenarioStamp === null ? {} : { scenarioStamp: seed.scenarioStamp }),
  };
}

// The store the screens use ---------------------------------------------------------------------

export interface WizardDraftStore {
  setUser(userId: string | null): void;
  /** Her organization's app fields: until they are set, there is no draft to read. */
  setFields(fields: SystemFieldIndex | null): void;
  /** Her draft as the screens' forms; a version 1 draft is converted and kept. */
  loadDraft(): OnboardingDraft | null;
  saveDraft(draft: OnboardingDraft): void;
  /** Her draft as kept, by field. */
  loadStoredDraft(): StoredOnboardingDraft | null;
  saveStoredDraft(draft: StoredOnboardingDraft): void;
  clearDraft(): void;
  clearUserDraft(userId: string): void;
}

/** The screens' view over her draft by field, on the account-scoped store. */
export function createWizardDraftStore(
  store: Pick<
    AccountOnboardingDraftStore,
    'setUser' | 'loadDraft' | 'saveDraft' | 'clearDraft' | 'clearUserDraft'
  >,
): WizardDraftStore {
  let fields: SystemFieldIndex | null = null;
  const loadStoredDraft = (): StoredOnboardingDraft | null => {
    const draft = store.loadDraft();
    if (draft === null || fields === null) return null;
    if (isStoredOnboardingDraft(draft)) return draft;
    // A draft from before RAPP-663: converted once, never lost.
    const upgraded = upgradedDraft(fields, draft);
    store.saveDraft(upgraded);
    return upgraded;
  };
  return {
    setUser: (userId) => store.setUser(userId),
    setFields(next) {
      fields = next;
    },
    loadDraft() {
      const stored = loadStoredDraft();
      return stored === null || fields === null ? null : viewOfStoredDraft(fields, stored);
    },
    saveDraft(draft) {
      if (fields === null)
        throw new AppError('UNEXPECTED-1', { message: 'Onboarding draft requires the fields' });
      store.saveDraft(storedDraftOfView(fields, draft, loadStoredDraft()));
    },
    loadStoredDraft,
    saveStoredDraft: (draft) => store.saveDraft(draft),
    clearDraft: () => store.clearDraft(),
    clearUserDraft: (userId) => store.clearUserDraft(userId),
  };
}

/** The screens' view on a plain store, with her fields already set (tests use it). */
export function wizardDraftStoreOn(
  base: OnboardingDraftStore,
  fields: SystemFieldIndex,
): WizardDraftStore {
  const store = createWizardDraftStore({ ...base, setUser: () => {}, clearUserDraft: () => {} });
  store.setFields(fields);
  return store;
}

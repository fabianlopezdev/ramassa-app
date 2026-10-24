/**
 * Her onboarding and her season form read from the placements (RAPP-655):
 * the fields of each screen in their order, the wording per language with its
 * fallback, required per surface, and staff's choice per player.
 */
import { describe, expect, test } from 'bun:test';
import type { CustomQuestion, IntakeCatalog, IntakeScreen } from './builder';
import { textIn } from './builder';
import {
  appScreenFields,
  appScreenGroupId,
  herOnboarding,
  onboardingScreenQuestions,
  seasonFormQuestions,
} from './her-onboarding';
import type { FieldPlacement, ProfileField, ProfileLayout } from './profile-layout';

const SECTION = '5eed0000-0000-4000-8096-000000000001';
const TRANSPORT_SCREEN = '5eed0000-0000-4000-8096-000000000002';
const OLD_SCREEN = '5eed0000-0000-4000-8096-000000000003';

function field(overrides: Partial<ProfileField> & Pick<ProfileField, 'id'>): ProfileField {
  return {
    sectionId: SECTION,
    kind: 'custom',
    builtinKey: null,
    type: 'short_text',
    label: { ca: 'Camp' },
    help: null,
    privacy: 'normal',
    defaultRequired: false,
    settings: {},
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-10-23T10:00:00Z',
    createdBy: null,
    createdByName: null,
    hasAnswers: false,
    options: [],
    ...overrides,
  };
}

let placementCount = 0;
function placed(
  fieldId: string,
  surface: FieldPlacement['surface'],
  screenKey: string | null,
  sortOrder: number,
  overrides: Partial<FieldPlacement> = {},
): FieldPlacement {
  placementCount += 1;
  return {
    id: `5eed0000-0000-4000-8097-${String(placementCount).padStart(12, '0')}`,
    fieldId,
    surface,
    screenKey,
    sortOrder,
    required: false,
    labelOverride: null,
    helpOverride: null,
    ...overrides,
  };
}

const BUS = field({
  id: '5eed0000-0000-4000-8098-000000000001',
  label: { ca: 'Vens amb bus?', ar: 'هل تأتين بالحافلة؟' },
});
const STOP = field({ id: '5eed0000-0000-4000-8098-000000000002', label: { ca: 'Parada' } });
const GLOVES = field({
  id: '5eed0000-0000-4000-8098-000000000003',
  label: { ca: 'Talla de guants', ar: 'مقاس القفازات' },
});
const BARRIER = field({
  id: '5eed0000-0000-4000-8098-000000000004',
  label: { ca: 'Què et dificulta venir?' },
});
const GONE = field({ id: '5eed0000-0000-4000-8098-000000000005', isArchived: true });
const CLOTHING = field({
  id: '5eed0000-0000-4000-8098-000000000006',
  kind: 'builtin',
  builtinKey: 'clothing_size',
});

const ownScreen: IntakeScreen = {
  id: TRANSPORT_SCREEN,
  title: { ca: 'Com arribes' },
  intro: null,
  afterScreen: 'logistics',
  isArchived: false,
  questions: [],
};

function catalogWith(placements: readonly FieldPlacement[], extra: Partial<IntakeCatalog> = {}) {
  const layout: ProfileLayout = {
    sections: [],
    fields: [BUS, STOP, GLOVES, BARRIER, GONE, CLOTHING],
    placements,
  };
  return {
    screens: [ownScreen],
    overrides: [],
    presets: [],
    layout,
    ...extra,
  } satisfies IntakeCatalog;
}

const LAYOUT_PLACEMENTS = [
  placed(STOP.id, 'onboarding', TRANSPORT_SCREEN, 1),
  placed(BUS.id, 'onboarding', TRANSPORT_SCREEN, 0, {
    required: true,
    labelOverride: { ca: 'Com vens als entrenaments?' },
  }),
  placed(GONE.id, 'onboarding', TRANSPORT_SCREEN, 2),
  placed(GLOVES.id, 'onboarding', 'equipment', 0, {
    labelOverride: { ca: 'Quina talla de guants portes?' },
  }),
  placed(CLOTHING.id, 'onboarding', 'equipment', 0),
  placed(BARRIER.id, 'season', null, 1),
  placed(BUS.id, 'season', null, 0, { labelOverride: { ca: 'Aquesta temporada, vens amb bus?' } }),
];

const ids = (questions: readonly CustomQuestion[]) => questions.map((question) => question.id);

describe('herOnboarding', () => {
  test('a Ramassà screen asks its live fields in placement order, required as placed', () => {
    const { screens } = herOnboarding(catalogWith(LAYOUT_PLACEMENTS));
    const transport = screens.find((screen) => screen.id === TRANSPORT_SCREEN);
    expect(ids(transport?.questions ?? [])).toEqual([BUS.id, STOP.id]);
    expect(transport?.questions[0]?.isRequired).toBe(true);
    expect(transport?.questions[1]?.isRequired).toBe(false);
  });

  test('a Catalan wording leaves Arabic on the field name and Spanish on its Catalan name', () => {
    const { screens } = herOnboarding(catalogWith(LAYOUT_PLACEMENTS));
    const bus = screens.find((screen) => screen.id === TRANSPORT_SCREEN)?.questions[0];
    expect(textIn(bus?.label, 'ca')).toBe('Com vens als entrenaments?');
    expect(textIn(bus?.label, 'ar')).toBe('هل تأتين بالحافلة؟');
    expect(textIn(bus?.label, 'es')).toBe('Vens amb bus?');
  });

  test('a field placed on an app screen is a group on that screen', () => {
    const { screens, plan } = herOnboarding(catalogWith(LAYOUT_PLACEMENTS));
    const equipment = appScreenFields(screens, 'equipment');
    expect(equipment?.id).toBe(appScreenGroupId('equipment'));
    // The app's own field stays on its own control: only Ramassà fields are placed.
    expect(ids(equipment?.questions ?? [])).toEqual([GLOVES.id]);
    expect(textIn(equipment?.questions[0]?.label, 'ca')).toBe('Quina talla de guants portes?');
    expect(textIn(equipment?.questions[0]?.label, 'ar')).toBe('مقاس القفازات');
    expect(plan.find((screen) => screen.builtinScreen === 'equipment')?.isAnswered).toBe(false);
    expect(appScreenFields(screens, 'identity')).toBeUndefined();
  });

  test('her screens follow the flow staff arranged', () => {
    const flowFirst = herOnboarding(
      catalogWith(LAYOUT_PLACEMENTS, { flowOrder: [`custom:${TRANSPORT_SCREEN}`, 'equipment'] }),
    );
    expect(flowFirst.screens.map((screen) => screen.id)).toEqual([
      TRANSPORT_SCREEN,
      appScreenGroupId('equipment'),
    ]);
    const appOrder = herOnboarding(catalogWith(LAYOUT_PLACEMENTS));
    // The app's own order puts equipment after logistics, then the staff screens after it.
    expect(appOrder.screens.map((screen) => screen.id)).toEqual([
      appScreenGroupId('equipment'),
      TRANSPORT_SCREEN,
    ]);
    expect(appOrder.plan.map((screen) => screen.id)).toEqual([
      appScreenGroupId('equipment'),
      TRANSPORT_SCREEN,
    ]);
  });

  test("on Auto an answered screen is skipped, on Ask it shows, Don't ask removes the field", () => {
    const catalog = catalogWith(LAYOUT_PLACEMENTS);
    const answers = { [BUS.id]: 'yes', [STOP.id]: 'Sants' };
    const auto = herOnboarding(catalog, answers);
    expect(auto.plan.find((screen) => screen.id === TRANSPORT_SCREEN)?.isAnswered).toBe(true);
    const ask = herOnboarding(catalog, answers, new Map([[STOP.id, true]]));
    expect(ask.plan.find((screen) => screen.id === TRANSPORT_SCREEN)?.isAnswered).toBe(false);
    const skip = herOnboarding(catalog, {}, new Map([[GLOVES.id, false]]));
    expect(appScreenFields(skip.screens, 'equipment')).toBeUndefined();
  });

  test('an archived Ramassà screen and its fields are not asked', () => {
    const { screens } = herOnboarding(
      catalogWith(LAYOUT_PLACEMENTS, { screens: [{ ...ownScreen, isArchived: true }] }),
    );
    expect(screens.map((screen) => screen.id)).toEqual([appScreenGroupId('equipment')]);
  });

  test('the staff phone preview reads the same fields and words', () => {
    const catalog = catalogWith(LAYOUT_PLACEMENTS);
    const { screens } = herOnboarding(catalog);
    expect(onboardingScreenQuestions(catalog, 'equipment')).toEqual(
      appScreenFields(screens, 'equipment')?.questions ?? [],
    );
  });

  test('a catalog that could not load asks no Ramassà field', () => {
    const empty: IntakeCatalog = { screens: [], overrides: [], presets: [] };
    expect(herOnboarding(empty)).toEqual({ screens: [], plan: [] });
    expect(onboardingScreenQuestions(empty, 'equipment')).toEqual([]);
  });
});

describe('seasonFormQuestions', () => {
  test('the season form asks its own placements, in order, with its own wording', () => {
    const questions = seasonFormQuestions(catalogWith(LAYOUT_PLACEMENTS));
    expect(ids(questions)).toEqual([BUS.id, BARRIER.id]);
    expect(textIn(questions[0]?.label, 'ca')).toBe('Aquesta temporada, vens amb bus?');
  });

  test('a catalog that could not load asks nothing again', () => {
    expect(seasonFormQuestions({ screens: [], overrides: [], presets: [] })).toEqual([]);
  });
});

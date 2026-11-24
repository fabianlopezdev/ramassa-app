/**
 * The entity referral form as a surface of the Fitxa (RAPP-652): the items
 * the portal draws, what the picker allows, the required check, and her
 * onboarding treating an entity answer as answered.
 */
import { describe, expect, test } from 'bun:test';
import { parseIntakeCatalog } from './builder';
import {
  entityFormItems,
  entityFormPages,
  entityFormPick,
  fieldsAnsweredByEntity,
  isAlwaysOnEntityForm,
  requiredEntityFormFieldsLeftEmpty,
} from './entity-form';
import { NO_CHOICES, playerPlan } from './player-plan';
import type { FieldPlacement, ProfileField, ProfileLayout } from './profile-layout';

const SECTION = '5eed0000-0000-4000-8092-000000000001';

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

function placed(
  fieldId: string,
  sortOrder: number,
  overrides: Partial<FieldPlacement> = {},
): FieldPlacement {
  return {
    id: `5eed0000-0000-4000-8093-00000000000${sortOrder}`,
    fieldId,
    surface: 'entity_form',
    screenKey: null,
    sortOrder,
    required: false,
    labelOverride: null,
    helpOverride: null,
    ...overrides,
  };
}

const FIRST_NAME = field({
  id: '5eed0000-0000-4000-8094-000000000001',
  kind: 'builtin',
  builtinKey: 'first_name',
  label: { ca: 'Nom' },
});
const CLOTHING = field({
  id: '5eed0000-0000-4000-8094-000000000002',
  kind: 'builtin',
  builtinKey: 'clothing_size',
});
const STOP = field({
  id: '5eed0000-0000-4000-8094-000000000003',
  label: { ca: 'Parada de metro', es: 'Parada de metro' },
  privacy: 'personal',
});
const SITUATION = field({
  id: '5eed0000-0000-4000-8094-000000000004',
  type: 'single_choice',
  privacy: 'sensitive',
  options: [{ id: '5eed0000-0000-4000-8095-000000000001', label: { ca: 'Sí' }, isArchived: false }],
});
const DETAIL = field({
  id: '5eed0000-0000-4000-8094-000000000005',
  showWhen: { fieldId: SITUATION.id, optionId: '5eed0000-0000-4000-8095-000000000001' },
});
const PHOTO = field({ id: '5eed0000-0000-4000-8094-000000000006', type: 'file_upload' });

const LAYOUT: ProfileLayout = {
  sections: [{ id: SECTION, key: 'identity', title: { ca: 'Identitat' }, isBuiltin: true }],
  fields: [FIRST_NAME, CLOTHING, STOP, SITUATION, DETAIL, PHOTO],
  placements: [
    placed(FIRST_NAME.id, 0, { required: true }),
    placed(STOP.id, 1, { required: true, labelOverride: { ca: 'On agafa el metro?' } }),
    placed(SITUATION.id, 2),
    placed(DETAIL.id, 3, { required: true }),
  ],
};

describe('entityFormItems', () => {
  test('the placed fields in order, Ramassà ones worded for the entity', () => {
    const items = entityFormItems(LAYOUT);
    expect(items.map((item) => item.field.id)).toEqual([
      FIRST_NAME.id,
      STOP.id,
      SITUATION.id,
      DETAIL.id,
    ]);
    const stop = items[1];
    expect(stop?.kind === 'custom' ? stop.question.label.ca : '').toBe('On agafa el metro?');
    // A language without a wording reads the field's own name.
    expect(stop?.kind === 'custom' ? stop.question.label.es : '').toBe('Parada de metro');
    expect(stop?.kind === 'custom' ? stop.question.isRequired : false).toBe(true);
  });
});

describe('entityFormPick', () => {
  test('placed, hers, or free: an app field goes on the form like any field (RAPP-665)', () => {
    expect(entityFormPick(LAYOUT, STOP)).toBe('here');
    expect(entityFormPick(LAYOUT, PHOTO)).toBe('hers');
    expect(entityFormPick(LAYOUT, CLOTHING)).toBe('free');
    expect(entityFormPick({ ...LAYOUT, placements: [] }, FIRST_NAME)).toBe('free');
  });

  test('her names never leave the form', () => {
    expect(isAlwaysOnEntityForm(FIRST_NAME)).toBe(true);
    expect(isAlwaysOnEntityForm(STOP)).toBe(false);
  });
});

describe('requiredEntityFormFieldsLeftEmpty on the placed form (RAPP-664)', () => {
  const items = entityFormItems(LAYOUT);

  test('every required field by its id, her names included', () => {
    expect(requiredEntityFormFieldsLeftEmpty(items, { [FIRST_NAME.id]: '  ' })).toEqual([
      FIRST_NAME.id,
      STOP.id,
    ]);
    expect(
      requiredEntityFormFieldsLeftEmpty(items, { [FIRST_NAME.id]: 'Amina', [STOP.id]: 'Sants' }),
    ).toEqual([]);
  });

  test('a condition that applies asks its required field', () => {
    const answers = {
      [FIRST_NAME.id]: 'Amina',
      [STOP.id]: 'Sants',
      [SITUATION.id]: '5eed0000-0000-4000-8095-000000000001',
    };
    expect(requiredEntityFormFieldsLeftEmpty(items, answers)).toEqual([DETAIL.id]);
  });
});

describe('her onboarding after the entity answered', () => {
  const QUESTION = '5eed0000-0000-4000-8045-000000000001';
  const SCREEN = '5eed0000-0000-4000-8044-000000000001';
  const SECTION = '5eed0000-0000-4000-8047-000000000007';
  const placement = (id: string, surface: string, screenKey: string | null) => ({
    id,
    field_id: QUESTION,
    surface,
    screen_key: screenKey,
    sort_order: 0,
    required: false,
    label_override: null,
    help_override: null,
  });
  const catalog = parseIntakeCatalog({
    screens: [
      {
        id: SCREEN,
        title: { ca: 'Com arribes' },
        intro: null,
        after_screen: 'logistics',
        sort_order: 0,
        is_archived: false,
      },
    ],
    sections: [
      { id: SECTION, key: 'support', title: { ca: 'Suport' }, sort_order: 6, is_builtin: true },
    ],
    fields: [
      {
        id: QUESTION,
        section_id: SECTION,
        kind: 'custom',
        system_key: null,
        question_type: 'yes_no_maybe',
        label: { ca: 'Transport públic?' },
        help: null,
        privacy: 'normal',
        default_required: false,
        settings: {},
        show_when_field_id: null,
        show_when_option_id: null,
        sort_order: 0,
        is_archived: false,
        created_at: '2026-10-23T10:00:00Z',
        options: [],
      },
    ],
    placements: [
      placement('5eed0000-0000-4000-8048-000000000001', 'onboarding', SCREEN),
      placement('5eed0000-0000-4000-8048-000000000002', 'entity_form', null),
    ],
    overrides: [],
    presets: [],
  });
  const answered = fieldsAnsweredByEntity([QUESTION, 'date_of_birth']);
  const questionIn = (plan: ReturnType<typeof playerPlan>) =>
    plan.screens.flatMap((screen) => screen.questions).find((each) => each.key === QUESTION);

  test('only field ids count as Ramassà answers', () => {
    expect(Object.keys(answered)).toEqual([QUESTION]);
  });

  test('Auto skips a field the entity answered', () => {
    const question = questionIn(playerPlan(catalog, new Set(), NO_CHOICES, answered));
    expect(question?.isAnswered).toBe(true);
    expect(question?.asking).toBe('not-asked');
  });

  test('Ask shows it to her again', () => {
    const choices = { ...NO_CHOICES, customStates: { [QUESTION]: 'ask' as const } };
    expect(questionIn(playerPlan(catalog, new Set(), choices, answered))?.asking).toBe('asked');
  });
});

test('a required field left empty is named by its field id, her names included (RAPP-663)', () => {
  const items = [
    { kind: 'builtin', key: 'first_name', field: { id: 'first' }, placement: { required: true } },
    { kind: 'builtin', key: 'document', field: { id: 'type' }, placement: { required: true } },
    { kind: 'builtin', key: 'city', field: { id: 'city' }, placement: { required: false } },
    {
      kind: 'custom',
      field: { id: 'details' },
      placement: { required: true },
      question: { showWhen: { questionId: 'gate', optionId: 'yes' } },
    },
  ] as unknown as Parameters<typeof requiredEntityFormFieldsLeftEmpty>[0];
  expect(requiredEntityFormFieldsLeftEmpty(items, { first: 'Amina', type: '' })).toEqual(['type']);
  // A condition that holds asks the field.
  expect(
    requiredEntityFormFieldsLeftEmpty(items, { first: 'Amina', type: 'x', gate: 'yes' }),
  ).toEqual(['details']);
});

describe('the referral form screen by screen (RAPP-938)', () => {
  const FIRST = '5eed0000-0000-4000-8096-000000000001';
  const SECOND = '5eed0000-0000-4000-8096-000000000002';
  const BLOCK = '5eed0000-0000-4000-8097-000000000001';
  const screen = (id: string, order: number, title: string) => ({
    id,
    title: { ca: title },
    intro: null,
    sort_order: order,
    texts: {},
  });
  const raw = {
    screens: [],
    overrides: [],
    presets: [],
    blocks: [
      {
        id: BLOCK,
        surface: 'entity_form',
        screen_key: null,
        kind: 'signature',
        body: { ca: 'Confirmo les dades' },
        title: null,
        points: null,
        sort_order: 4,
      },
    ],
    entity_form: {
      id: '5eed0000-0000-4000-8098-000000000001',
      name: { ca: 'Formulari de derivació' },
      // Sent out of order: the screens are read in their order.
      screens: [screen(SECOND, 1, 'La seva situació'), screen(FIRST, 0, 'La derivació')],
      items: [
        { id: '5eed0000-0000-4000-8093-000000000000', screen_key: FIRST },
        { id: '5eed0000-0000-4000-8093-000000000001', screen_key: FIRST },
        { id: '5eed0000-0000-4000-8093-000000000002', screen_key: SECOND },
        { id: BLOCK, screen_key: SECOND },
      ],
    },
  };
  const catalog = { ...parseIntakeCatalog(raw), layout: LAYOUT };

  test('the catalog reads the referral form, its screens in order', () => {
    expect(catalog.entityForm?.screens.map((each) => each.id)).toEqual([FIRST, SECOND]);
    expect(catalog.entityForm?.screenOf[BLOCK]).toBe(SECOND);
  });

  test('each screen asks its own fields and blocks; one the catalog does not place goes last', () => {
    const pages = entityFormPages(catalog);
    expect(pages.map((page) => page.screen?.id)).toEqual([FIRST, SECOND]);
    expect(pages[0]?.items.map((item) => item.field.id)).toEqual([FIRST_NAME.id, STOP.id]);
    // DETAIL's placement is not in the list: it goes on the last screen.
    expect(pages[1]?.items.map((item) => item.field.id)).toEqual([SITUATION.id, DETAIL.id]);
    expect(pages[1]?.blocks.map((block) => block.id)).toEqual([BLOCK]);
  });

  test('a server before it sends no screens: the whole form is one page', () => {
    const older = { ...parseIntakeCatalog({ ...raw, entity_form: undefined }), layout: LAYOUT };
    expect(older.entityForm).toBeUndefined();
    const pages = entityFormPages(older);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toHaveLength(4);
    expect(pages[0]?.blocks.map((block) => block.id)).toEqual([BLOCK]);
  });

  test('a referral form this build cannot read leaves the form on one page', () => {
    const odd = parseIntakeCatalog({ ...raw, entity_form: { id: 'not-an-id' } });
    expect(odd.entityForm).toBeUndefined();
  });
});

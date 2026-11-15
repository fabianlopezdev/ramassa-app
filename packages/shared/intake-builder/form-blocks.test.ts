import { describe, expect, test } from 'bun:test';
import {
  formBlockName,
  formBlocksOn,
  formBlockText,
  formSignaturesPayload,
  hasFormBlocks,
  hasSignatureBlocks,
  isFormBlockSigned,
  liveOnboardingBlocks,
  parseFormBlocks,
  resolveFormBlock,
  signatureBlocks,
  unsignedFormBlocks,
  type FormBlock,
  type SignatureFormBlock,
} from './form-blocks';

const SCREEN = '5eed0000-0000-4000-8044-000000000001';
const rows = [
  {
    id: '5eed0000-0000-4000-8090-000000000002',
    surface: 'onboarding',
    screen_key: SCREEN,
    kind: 'signature',
    body: { ca: 'Autoritzo el transport', es: 'Autorizo el transporte' },
    sort_order: 3,
  },
  {
    id: '5eed0000-0000-4000-8090-000000000001',
    surface: 'onboarding',
    screen_key: SCREEN,
    kind: 'signature',
    body: { ca: 'Accepto les normes' },
    sort_order: 1,
  },
  {
    id: '5eed0000-0000-4000-8090-000000000003',
    surface: 'entity_form',
    screen_key: null,
    kind: 'signature',
    body: { ca: 'La jugadora hi està d’acord' },
    sort_order: 0,
  },
  // A block of a kind this build does not know is left out.
  { id: '5eed0000-0000-4000-8090-000000000004', surface: 'onboarding', kind: 'video' },
];
const strokes = [
  [
    [10, 20],
    [30, 40],
  ],
] as [number, number][][];

describe('signature blocks (RAPP-690)', () => {
  const blocks: readonly FormBlock[] = parseFormBlocks(rows);

  test('the catalog blocks of a screen come in their order; the entity form has its own', () => {
    expect(blocks).toHaveLength(3);
    expect(formBlocksOn(blocks, 'onboarding', SCREEN).map((block) => block.sortOrder)).toEqual([
      1, 3,
    ]);
    expect(formBlocksOn(blocks, 'entity_form', null)).toHaveLength(1);
    expect(parseFormBlocks(undefined)).toEqual([]);
  });

  test('the text shows in her language, or in Catalan when it has none', () => {
    const [first, second] = signatureBlocks(formBlocksOn(blocks, 'onboarding', SCREEN));
    expect(formBlockText(second!, 'es')).toEqual({
      text: 'Autorizo el transporte',
      language: 'es',
    });
    expect(formBlockText(first!, 'ar')).toEqual({ text: 'Accepto les normes', language: 'ca' });
  });

  test('a block is unsigned until she draws; each signature goes with its language', () => {
    const onScreen = formBlocksOn(blocks, 'onboarding', SCREEN);
    const drafts = { [onScreen[1]!.id]: strokes, [onScreen[0]!.id]: null };
    expect(unsignedFormBlocks(onScreen, drafts)).toEqual([onScreen[0]!.id]);
    expect(formSignaturesPayload(onScreen, drafts, 'es')).toEqual({
      [onScreen[1]!.id]: { strokes, language: 'es' },
    });
  });
});

describe('signed on the tablet (RAPP-691)', () => {
  const [block] = signatureBlocks(
    parseFormBlocks([
      {
        id: '5eed0000-0000-4000-8090-000000000009',
        surface: 'onboarding',
        screen_key: 'logistics',
        kind: 'signature',
        body: { ca: 'Autoritzo el transport', ar: 'أوافق' },
        sort_order: 0,
      },
    ]),
  );

  test('a block counts as signed while its text in her language is the one she signed', () => {
    const signed = [{ blockId: block!.id, body: 'أوافق', language: 'ar' as const }];
    expect(isFormBlockSigned(block!, signed)).toBe(true);
    expect(
      isFormBlockSigned({ ...block!, body: { ca: 'Autoritzo el transport', ar: 'نعم' } }, signed),
    ).toBe(false);
  });

  test('the tablet asks the blocks of app screens and of live Ramassà screens', () => {
    const archived = '5eed0000-0000-4000-8044-000000000009';
    const onArchived: SignatureFormBlock = { ...block!, id: 'x', screenKey: archived };
    expect(
      liveOnboardingBlocks({
        blocks: [block!, onArchived],
        screens: [{ id: archived, isArchived: true }],
      }).map((each) => each.id),
    ).toEqual([block!.id]);
  });
});

describe('text and points blocks (RAPP-770)', () => {
  const TEXT_ID = '5eed0000-0000-4000-8090-000000000011';
  const POINTS_ID = '5eed0000-0000-4000-8090-000000000012';
  const SIGNATURE_ID = '5eed0000-0000-4000-8090-000000000013';
  const blocks = parseFormBlocks([
    {
      id: TEXT_ID,
      surface: 'onboarding',
      screen_key: SCREEN,
      kind: 'text',
      title: { ca: 'Abans de començar' },
      body: { ca: 'Llegeix això', es: 'Lee esto' },
      sort_order: 0,
    },
    {
      id: POINTS_ID,
      surface: 'custom_form',
      screen_key: SCREEN,
      custom_form_id: '5eed0000-0000-4000-8090-000000000020',
      kind: 'points',
      points: [{ title: { ca: 'Primer' }, body: { ca: 'Un', ar: 'واحد' } }],
      sort_order: 1,
    },
    {
      id: SIGNATURE_ID,
      surface: 'onboarding',
      screen_key: SCREEN,
      kind: 'signature',
      body: { ca: 'Accepto' },
      sort_order: 2,
    },
    // Points with no Catalan are refused, as the database refuses them.
    {
      id: '5eed0000-0000-4000-8090-000000000014',
      surface: 'onboarding',
      screen_key: SCREEN,
      kind: 'points',
      points: [{ title: { es: 'Uno' }, body: { es: 'Uno' } }],
      sort_order: 3,
    },
  ]);

  test('each kind is read by its own parser; a row none reads is left out', () => {
    expect(blocks.map((block) => block.kind)).toEqual(['text', 'points', 'signature']);
  });

  test('only a signature block asks for a signature', () => {
    const onScreen = formBlocksOn(blocks, 'onboarding', SCREEN);
    expect(signatureBlocks(onScreen).map((block) => block.id)).toEqual([SIGNATURE_ID]);
    expect(unsignedFormBlocks(onScreen, {})).toEqual([SIGNATURE_ID]);
    expect(formSignaturesPayload(onScreen, { [TEXT_ID]: strokes }, 'ca')).toEqual({});
  });

  test('a text block keeps a Ramassà screen shown; it never needs a signature', () => {
    const textOnly = blocks.filter((block) => block.id === TEXT_ID);
    expect(hasFormBlocks(textOnly, SCREEN)).toBe(true);
    expect(hasSignatureBlocks(textOnly, SCREEN)).toBe(false);
  });

  test('she reads each block in her language, else in Catalan', () => {
    const [text, points] = blocks;
    expect(resolveFormBlock(text!, 'es')).toEqual({
      kind: 'text',
      title: 'Abans de començar',
      body: 'Lee esto',
    });
    expect(resolveFormBlock(points!, 'ar')).toEqual({
      kind: 'points',
      points: [{ title: 'Primer', body: 'واحد' }],
    });
    expect(formBlockName(text!, 'ca')).toBe('Abans de començar');
    expect(formBlockName(points!, 'ca')).toBe('Primer');
  });
});

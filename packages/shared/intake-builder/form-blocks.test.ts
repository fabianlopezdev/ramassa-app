import { describe, expect, test } from 'bun:test';
import {
  formBlocksOn,
  formBlockText,
  formSignaturesPayload,
  parseFormBlocks,
  unsignedFormBlocks,
  type FormBlock,
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
    const [first, second] = formBlocksOn(blocks, 'onboarding', SCREEN);
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

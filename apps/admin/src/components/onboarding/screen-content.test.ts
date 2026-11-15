import { expect, test } from 'bun:test';
import {
  EMPTY_INTAKE_CATALOG,
  withSeasonName,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import {
  builtinPhoneQuestion,
  filledContent,
  formScreenButtons,
  placedPhoneQuestions,
  staffScreenContent,
} from './screen-content';

const SCREEN = '5eed0000-0000-4000-8044-000000000001';
const t = (key: string) => key;

test('the help typed for a question of the name screen shows on her phone at once (RAPP-777)', () => {
  const typed = { label: { ca: 'Nom' }, help: { ca: 'Com surt al teu document' } };
  expect(builtinPhoneQuestion(EMPTY_INTAKE_CATALOG, 'first_name', 'ca', t, typed).help).toBe(
    'Com surt al teu document',
  );
  expect(builtinPhoneQuestion(EMPTY_INTAKE_CATALOG, 'first_name', 'ca', t).help).toBe('');
});

test('a screen shows its consents as ticks and a signature with its own texts (RAPP-777)', () => {
  const catalog: IntakeCatalog = {
    ...EMPTY_INTAKE_CATALOG,
    consents: [
      {
        id: 'c1',
        key: 'photos',
        systemKey: null,
        name: { ca: 'Fotos' },
        body: { ca: 'Accepto les fotos.' },
        isArchived: false,
      },
    ],
    consentPlacements: [
      {
        id: 'p1',
        consentId: 'c1',
        surface: 'custom_form',
        screenKey: SCREEN,
        customFormId: 'f1',
        sortOrder: 0,
        required: true,
      },
    ],
    blocks: [
      {
        id: 'b1',
        kind: 'signature',
        surface: 'custom_form',
        screenKey: SCREEN,
        customFormId: 'f1',
        sortOrder: 1,
        body: { ca: 'Amb la meva signatura accepto.' },
        texts: { signature_title: { ca: 'La signatura' }, cannot_draw_label: { ca: 'No puc' } },
      },
    ],
  };
  const [consent, signature] = placedPhoneQuestions(catalog, SCREEN, 'ca', null, 'custom_form');
  expect(consent).toMatchObject({ isConsent: true, label: 'Accepto les fotos.', isRequired: true });
  expect(signature).toMatchObject({
    isSignature: true,
    label: 'Amb la meva signatura accepto.',
    signatureTexts: { title: 'La signatura', prompt: undefined, cannotDraw: 'No puc' },
  });
});

test("the authorization's preview writes the season where her phone does (RAPP-785)", () => {
  const drawn = staffScreenContent(
    { ca: 'Inscripció per a la temporada {{season}}' },
    { ca: 'Temporada {{season}}: revisa les teves dades.' },
    [],
    'ca',
    t,
    { help: { ca: 'Per a {{ season }}' }, decline_label: { ca: 'Corregeix {{season}}' } },
    formScreenButtons({ systemScreen: 'reregistration' }),
  );
  const filled = filledContent(drawn, (text) => withSeasonName(text, '2026/27'));
  expect(filled.title).toBe('Inscripció per a la temporada 2026/27');
  expect(filled.intro).toBe('Temporada 2026/27: revisa les teves dades.');
  expect(filled.help).toBe('Per a 2026/27');
  expect(filled.declineLabel).toBe('Corregeix 2026/27');
  expect(filledContent(drawn, undefined)).toBe(drawn);
});

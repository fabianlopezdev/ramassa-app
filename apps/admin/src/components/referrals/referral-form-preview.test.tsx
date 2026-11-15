/**
 * The referral form as the entity sees it (RAPP-652): the placed fields in
 * their order, each with its wording and an asterisk when required, read-only,
 * and right to left in Arabic.
 */
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import type { FieldPlacement, ProfileField, ProfileLayout } from '@ramassa/shared/intake-builder';
import { ReferralFormPreview } from './referral-form-preview';

const SECTION = '5eed0000-0000-4000-8096-000000000001';

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

const placed = (fieldId: string, sortOrder: number, required = false): FieldPlacement => ({
  id: `5eed0000-0000-4000-8097-00000000000${sortOrder}`,
  fieldId,
  surface: 'entity_form',
  screenKey: null,
  sortOrder,
  required,
  labelOverride: null,
  helpOverride: null,
});

const FIRST_NAME = field({
  id: '5eed0000-0000-4000-8098-000000000001',
  kind: 'builtin',
  builtinKey: 'first_name',
  label: { ca: 'Nom', ar: 'الاسم' },
});
const STOP = field({
  id: '5eed0000-0000-4000-8098-000000000002',
  label: { ca: 'Parada de metro' },
});

const LAYOUT: ProfileLayout = {
  sections: [{ id: SECTION, key: 'identity', title: { ca: 'Identitat' }, isBuiltin: true }],
  fields: [FIRST_NAME, STOP],
  placements: [
    { ...placed(STOP.id, 1, true), labelOverride: { ca: 'On agafa el metro?' } },
    placed(FIRST_NAME.id, 0, true),
  ],
};

test('the placed fields in order, worded for the entity, required ones marked', () => {
  const view = render(<ReferralFormPreview layout={LAYOUT} language="ca" entityNames={[]} />);
  const text = view.getByTestId('referral-form-preview').textContent ?? '';
  expect(text.indexOf('Nom *')).toBeGreaterThanOrEqual(0);
  expect(text.indexOf('On agafa el metro? *')).toBeGreaterThan(text.indexOf('Nom *'));
  expect(view.container.querySelector('fieldset')?.hasAttribute('disabled')).toBe(true);
});

test('in Arabic it reads right to left, with the field names in Arabic', () => {
  const view = render(<ReferralFormPreview layout={LAYOUT} language="ar" entityNames={[]} />);
  const preview = view.getByTestId('referral-form-preview');
  expect(preview.getAttribute('dir')).toBe('rtl');
  expect(preview.textContent).toContain('الاسم *');
});

test('a signature block sits among the fields in its place, with its text and a pad (RAPP-690)', () => {
  const block = {
    id: '5eed0000-0000-4000-8099-000000000001',
    surface: 'entity_form',
    screenKey: null,
    kind: 'signature',
    body: { ca: 'La jugadora hi està d’acord' },
    // A tie with her name: the field comes first.
    sortOrder: 0,
  } as const;
  const view = render(
    <ReferralFormPreview layout={LAYOUT} language="ca" entityNames={[]} blocks={[block]} />,
  );
  const text = view.getByTestId('referral-form-preview').textContent ?? '';
  expect(text.indexOf('La jugadora hi està d’acord')).toBeGreaterThan(text.indexOf('Nom *'));
  expect(text.indexOf('On agafa el metro? *')).toBeGreaterThan(
    text.indexOf('La jugadora hi està d’acord'),
  );
  expect(view.getByTestId(`referral-block-${block.id}-pad`)).toBeTruthy();
});

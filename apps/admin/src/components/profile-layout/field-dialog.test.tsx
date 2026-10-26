/**
 * Changing a field with answers (RAPP-665, D8): saving a new type or privacy
 * first shows what happens to the answers, with the database's counts, and
 * saves only on Confirm. A rename, or a new type on a field with no answers,
 * saves at once. A new privacy level always asks and names the roles whose
 * people stop or start seeing it (RAPP-692).
 * Her names keep their type and privacy and have no Archive.
 */
import { createAdminI18n } from '@/lib/i18n';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { I18nextProvider } from 'react-i18next';
import type {
  FieldChangePreview,
  ProfileField,
  ProfileSection,
} from '@ramassa/shared/intake-builder';
import { changeSentences } from './field-change-dialog';
import { FieldDialog } from './field-dialog';

const SECTION: ProfileSection = {
  id: '5eed0000-0000-4000-8090-000000000001',
  key: 'background',
  title: { ca: 'Origen' },
  isBuiltin: true,
};

function field(overrides: Partial<ProfileField> = {}): ProfileField {
  return {
    id: '5eed0000-0000-4000-8091-000000000001',
    sectionId: SECTION.id,
    kind: 'builtin',
    systemKey: 'nationality',
    builtinKey: 'nationality',
    type: 'country',
    label: { ca: 'Nacionalitat' },
    help: null,
    privacy: 'personal',
    defaultRequired: true,
    settings: {},
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-10-23T10:00:00Z',
    createdBy: null,
    createdByName: null,
    hasAnswers: true,
    options: [],
    ...overrides,
  };
}

const PREVIEW: FieldChangePreview = {
  answers: 12,
  converted: 10,
  notConverted: 2,
  isTypeChange: true,
  isPrivacyChange: true,
  privacyFrom: 'personal',
  privacyTo: 'sensitive',
  toEncrypt: 10,
  toDecrypt: 0,
  readersGaining: 0,
  readersLosing: 3,
  rolesGaining: [],
  rolesLosing: [
    { roleId: '69200000-0000-4000-8000-000000000001', builtinKey: null, name: 'Equip', people: 2 },
    { roleId: '69200000-0000-4000-8000-000000000002', builtinKey: 'coach', name: null, people: 1 },
  ],
  conditionsCleared: 0,
  featuresLost: ['impact.nationalities'],
  featuresRegained: [],
};

function open(props: {
  readonly field: ProfileField;
  readonly preview?: FieldChangePreview;
  readonly onSave?: ReturnType<typeof mock>;
}) {
  const onSave = props.onSave ?? mock(async () => undefined);
  const previewChange = mock(async () => props.preview ?? PREVIEW);
  const view = render(
    <I18nextProvider i18n={createAdminI18n('ca')}>
      <FieldDialog
        section={SECTION}
        field={props.field}
        isOpen
        onOpenChange={() => undefined}
        onSave={onSave}
        onArchive={async () => undefined}
        previewChange={previewChange}
        appScreen="background"
      />
    </I18nextProvider>,
  );
  return { view, onSave, previewChange };
}

function pickType(view: ReturnType<typeof render>, type: string) {
  fireEvent.click(view.getByTestId('question-type-change'));
  fireEvent.click(view.getByTestId(`question-type-option-${type}`));
}

test('a new type on an answered field asks first, with the counts, and Cancel saves nothing', async () => {
  const { view, onSave, previewChange } = open({ field: field() });
  pickType(view, 'short_text');
  fireEvent.click(view.getByTestId('field-form-save'));
  await waitFor(() => expect(view.getByTestId('field-change-dialog')).toBeTruthy());
  expect(previewChange).toHaveBeenCalledTimes(1);
  const text = view.getByTestId('field-change-dialog').textContent ?? '';
  expect(text).toContain('Té 12 respostes.');
  expect(text).toContain('2 respostes no encaixen amb el nou tipus.');
  expect(text).toContain('10 respostes es guardaran xifrades.');
  expect(text).toContain('Les persones amb el rol Equip (2) ja no el veuran.');
  expect(text).toContain('Les persones amb el rol Entrenador (1) ja no el veuran.');
  expect(text).toContain('«Origen»');
  expect(text).toContain("Informe d'impacte: nacionalitats");
  fireEvent.click(view.getByTestId('field-change-cancel'));
  await waitFor(() => expect(view.queryByTestId('field-change-dialog')).toBeNull());
  expect(onSave).not.toHaveBeenCalled();
});

test('Confirm saves the change', async () => {
  const { view, onSave } = open({ field: field() });
  pickType(view, 'short_text');
  fireEvent.click(view.getByTestId('field-form-save'));
  await waitFor(() => expect(view.getByTestId('field-change-confirm')).toBeTruthy());
  fireEvent.click(view.getByTestId('field-change-confirm'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const [draft] = onSave.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(draft).toMatchObject({ type: 'short_text' });
});

test('a field with no answers saves at once', async () => {
  const { view, onSave, previewChange } = open({ field: field({ hasAnswers: false }) });
  pickType(view, 'short_text');
  fireEvent.click(view.getByTestId('field-form-save'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(previewChange).not.toHaveBeenCalled();
});

test('a new privacy level asks even with no answers, and names who gains it (RAPP-692)', async () => {
  const { view, onSave, previewChange } = open({
    field: field({ hasAnswers: false }),
    preview: {
      ...PREVIEW,
      answers: 0,
      converted: 0,
      notConverted: 0,
      isTypeChange: false,
      privacyTo: 'normal',
      toEncrypt: 0,
      readersLosing: 0,
      readersGaining: 3,
      rolesLosing: [],
      rolesGaining: [
        {
          roleId: '69200000-0000-4000-8000-000000000003',
          builtinKey: null,
          name: 'Coordinació',
          people: 2,
        },
        { roleId: null, builtinKey: null, name: null, people: 1 },
      ],
      featuresLost: [],
    },
  });
  fireEvent.click(view.getByTestId('question-privacy-change'));
  fireEvent.click(view.getByTestId('question-privacy-option-normal'));
  fireEvent.click(view.getByTestId('field-form-save'));
  await waitFor(() => expect(view.getByTestId('field-change-dialog')).toBeTruthy());
  expect(previewChange).toHaveBeenCalledTimes(1);
  const text = view.getByTestId('field-change-dialog').textContent ?? '';
  expect(text).toContain('Les persones amb el rol Coordinació (2) el podran veure.');
  expect(text).toContain('Les persones sense rol (1) el podran veure.');
  fireEvent.click(view.getByTestId('field-change-confirm'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
});

test('a rename saves at once, even with answers', async () => {
  const { view, onSave, previewChange } = open({ field: field() });
  fireEvent.click(view.getByTestId('field-form-save'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(previewChange).not.toHaveBeenCalled();
});

test('her names keep their type and privacy and have no Archive', () => {
  const { view } = open({
    field: field({ systemKey: 'first_name', builtinKey: 'first_name', type: 'short_text' }),
  });
  expect(view.getByTestId('field-names-lock')).toBeTruthy();
  expect(view.queryByTestId('question-type-change')).toBeNull();
  expect(view.queryByTestId('field-archive')).toBeNull();
});

test('every other field, an app one included, has Archive', () => {
  const { view } = open({ field: field() });
  expect(view.getByTestId('field-archive')).toBeTruthy();
});

test('the sentences follow what changes', () => {
  const keys = (preview: FieldChangePreview, screen: string | null = null) =>
    changeSentences(preview, screen).map(({ key }) => key);
  expect(keys(PREVIEW, 'background')).toEqual([
    'fieldChange.answers',
    'fieldChange.converted',
    'fieldChange.notConverted',
    'fieldChange.appScreen',
    'fieldChange.privacy',
    'fieldChange.encrypt',
    'fieldChange.roleLosing',
    'fieldChange.roleLosing',
  ]);
  expect(
    keys({
      ...PREVIEW,
      isTypeChange: false,
      privacyTo: 'normal',
      toEncrypt: 0,
      toDecrypt: 12,
      readersLosing: 0,
      readersGaining: 1,
      rolesLosing: [],
      rolesGaining: [{ roleId: null, builtinKey: null, name: null, people: 1 }],
    }),
  ).toEqual([
    'fieldChange.answers',
    'fieldChange.privacy',
    'fieldChange.decrypt',
    'fieldChange.noRoleGaining',
  ]);
  expect(keys({ ...PREVIEW, isPrivacyChange: false, conditionsCleared: 1 })).toContain(
    'fieldChange.conditions',
  );
});

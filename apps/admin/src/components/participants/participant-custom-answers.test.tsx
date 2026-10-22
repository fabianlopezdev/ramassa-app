/**
 * Her answers to the questions staff added (RAPP-307), on the participant
 * page: each season apart, an archived option marked, and a Sensitive question
 * left out of the form for someone who cannot read it.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { parseIntakeCatalog } from '@ramassa/shared/intake-builder';
import { ParticipantCustomAnswers } from './participant-custom-answers';

const HEARD = '5eed0000-0000-4000-8045-000000000002';
const SEASONAL = '5eed0000-0000-4000-8045-000000000003';
const catalog = parseIntakeCatalog({
  screens: [
    {
      id: '5eed0000-0000-4000-8044-000000000001',
      title: { ca: 'Com arribes' },
      intro: null,
      after_screen: 'logistics',
      sort_order: 0,
      is_archived: false,
      questions: [
        {
          id: HEARD,
          question_type: 'single_choice',
          label: { ca: 'Com et vas assabentar?' },
          help: null,
          privacy: 'normal',
          placements: ['wizard'],
          sort_order: 0,
          is_archived: false,
          options: [
            {
              id: '5eed0000-0000-4000-8046-000000000001',
              label: { ca: 'Entitat' },
              sort_order: 0,
              is_archived: false,
            },
            {
              id: '5eed0000-0000-4000-8046-000000000003',
              label: { ca: 'Cartell' },
              sort_order: 1,
              is_archived: true,
            },
          ],
        },
        {
          id: SEASONAL,
          question_type: 'long_text',
          label: { ca: 'Dificultats aquesta temporada?' },
          help: null,
          privacy: 'sensitive',
          placements: ['season'],
          sort_order: 1,
          is_archived: false,
          options: [],
        },
      ],
    },
  ],
  overrides: [],
  presets: [],
});

const answers = [
  {
    questionId: HEARD,
    seasonId: null,
    seasonName: null,
    value: '5eed0000-0000-4000-8046-000000000003',
    source: 'player' as const,
    answeredAt: '2026-09-15T10:00:00Z',
  },
  {
    questionId: SEASONAL,
    seasonId: 's-2',
    seasonName: '2026/27',
    value: 'Treballo els dijous.',
    source: 'player' as const,
    answeredAt: '2026-09-15T10:00:00Z',
  },
  {
    questionId: SEASONAL,
    seasonId: 's-1',
    seasonName: '2025/26',
    value: 'Res.',
    source: 'staff' as const,
    answeredAt: '2025-09-15T10:00:00Z',
  },
];

test('each season is shown apart, and an archived option says so', () => {
  const view = render(
    <ParticipantCustomAnswers
      catalog={catalog}
      answers={answers}
      canEdit={false}
      canEditSensitive={false}
      onSave={mock(async () => undefined)}
    />,
  );
  expect(view.getByTestId(`custom-answer-${HEARD}`).textContent).toContain('Cartell (');
  const seasonal = view.getByTestId(`custom-answer-${SEASONAL}`).textContent ?? '';
  expect(seasonal).toContain('2026/27: Treballo els dijous.');
  expect(seasonal).toContain('2025/26: Res.');
});

test('without the Sensitive level the form leaves that question out, and saves the rest', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <ParticipantCustomAnswers
      catalog={catalog}
      answers={answers}
      canEdit
      canEditSensitive={false}
      onSave={onSave}
    />,
  );
  fireEvent.click(view.getByRole('button', { name: /questions\.editAnswers|Edit the answers/ }));
  expect(view.container.querySelector(`[name="custom-answer-${SEASONAL}"]`)).toBeNull();
  const select = view.container.querySelector<HTMLSelectElement>(
    `[name="custom-answer-${HEARD}"]`,
  )!;
  // Her archived choice stays selectable, so saving never drops it.
  expect(select.value).toBe('5eed0000-0000-4000-8046-000000000003');
  select.value = '5eed0000-0000-4000-8046-000000000001';
  fireEvent.submit(select.form!);
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({ [HEARD]: '5eed0000-0000-4000-8046-000000000001' }),
  );
});

test('an unchanged answer kept on an archived option is not sent again', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <ParticipantCustomAnswers
      catalog={catalog}
      answers={answers}
      canEdit
      canEditSensitive
      onSave={onSave}
    />,
  );
  fireEvent.click(view.getByRole('button', { name: /questions\.editAnswers|Edit the answers/ }));
  const box = view.container.querySelector<HTMLTextAreaElement>(
    `[name="custom-answer-${SEASONAL}"]`,
  )!;
  box.value = 'Ara els dimarts.';
  fireEvent.submit(box.form!);
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ [SEASONAL]: 'Ara els dimarts.' }));
});

// Every type reads well on her page (RAPP-610).

const typed = (id: string, type: string, settings: unknown = {}) => ({
  id,
  question_type: type,
  label: { ca: `Pregunta ${type}` },
  help: null,
  privacy: 'personal',
  placements: ['wizard'],
  sort_order: 0,
  is_archived: false,
  settings,
  options: [],
});
const ids = {
  date: '5eed0000-0000-4000-8045-0000000000d1',
  list: '5eed0000-0000-4000-8045-0000000000d2',
  consent: '5eed0000-0000-4000-8045-0000000000d3',
  signature: '5eed0000-0000-4000-8045-0000000000d4',
  file: '5eed0000-0000-4000-8045-0000000000d5',
  number: '5eed0000-0000-4000-8045-0000000000d6',
};
const typesCatalog = parseIntakeCatalog({
  screens: [
    {
      id: '5eed0000-0000-4000-8044-0000000000d0',
      title: { ca: 'Més dades' },
      intro: null,
      after_screen: 'logistics',
      sort_order: 0,
      is_archived: false,
      questions: [
        typed(ids.date, 'date'),
        typed(ids.list, 'item_list', { max_items: 5 }),
        typed(ids.consent, 'consent', { text: { ca: 'Accepto' } }),
        typed(ids.signature, 'signature'),
        typed(ids.file, 'file_upload', { accept: 'document' }),
        typed(ids.number, 'number', { integer: true, max: 15 }),
      ],
    },
  ],
  overrides: [],
  presets: [],
});
const row = (questionId: string, value: unknown) => ({
  questionId,
  seasonId: null,
  seasonName: null,
  value: value as never,
  source: 'player' as const,
  answeredAt: '2026-10-21T08:30:00Z',
});
const FILE_KEY =
  '5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000011/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf';
const typedAnswers = [
  row(ids.date, '2001-02-28'),
  row(ids.list, ['Català', 'Àrab']),
  row(ids.consent, true),
  row(ids.signature, [
    [
      [100, 200],
      [300, 400],
    ],
  ]),
  row(ids.file, { key: FILE_KEY, name: 'informe.pdf', content_type: 'application/pdf', size: 9 }),
  row(ids.number, 3),
];

test('dates, lists and consents read in words; a signature says signed and shows on request', () => {
  const view = render(
    <ParticipantCustomAnswers
      catalog={typesCatalog}
      answers={typedAnswers}
      canEdit={false}
      canEditSensitive={false}
      onSave={mock(async () => undefined)}
    />,
  );
  expect(view.getByTestId(`custom-answer-${ids.date}`).textContent).not.toContain('2001-02-28');
  expect(view.getByTestId(`custom-answer-${ids.date}`).textContent).toContain('2001');
  expect(view.getByTestId(`custom-answer-${ids.list}`).textContent).toBe('Català, Àrab');
  expect(view.getByTestId(`custom-answer-${ids.consent}`).textContent).toMatch(/\(.*2026|\(.*26/);
  const signature = view.getByTestId(`custom-answer-${ids.signature}`);
  expect(signature.textContent).toMatch(/questions\.answers\.signed|Signed/);
  expect(signature.querySelector('svg')).not.toBeNull();
  expect(signature.textContent).not.toContain('100');
});

test('a file opens through the private link, and says so when this server has none', async () => {
  const onOpenFile = mock(async () => undefined);
  const view = render(
    <ParticipantCustomAnswers
      catalog={typesCatalog}
      answers={typedAnswers}
      canEdit={false}
      canEditSensitive={false}
      onSave={mock(async () => undefined)}
      onOpenFile={onOpenFile}
    />,
  );
  const file = view.getByTestId(`custom-answer-${ids.file}`);
  expect(file.textContent).toContain('informe.pdf');
  fireEvent.click(file.querySelector('button')!);
  await waitFor(() => expect(onOpenFile).toHaveBeenCalledWith(FILE_KEY));
  view.unmount();

  const offline = render(
    <ParticipantCustomAnswers
      catalog={typesCatalog}
      answers={typedAnswers}
      canEdit={false}
      canEditSensitive={false}
      onSave={mock(async () => undefined)}
    />,
  );
  const offlineFile = offline.getByTestId(`custom-answer-${ids.file}`);
  expect(offlineFile.querySelector('button')).toBeNull();
  expect(offlineFile.textContent).toMatch(/questions\.answers\.fileUnavailable|cannot open files/);
});

test('staff never get a field for her file or signature, and a number that does not fit is named', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <ParticipantCustomAnswers
      catalog={typesCatalog}
      answers={typedAnswers}
      canEdit
      canEditSensitive
      onSave={onSave}
    />,
  );
  fireEvent.click(view.getByRole('button', { name: /questions\.editAnswers|Edit the answers/ }));
  expect(view.container.querySelector(`[name="custom-answer-${ids.signature}"]`)).toBeNull();
  expect(view.container.querySelector(`[name="custom-answer-${ids.file}"]`)).toBeNull();
  const number = view.container.querySelector<HTMLInputElement>(
    `[name="custom-answer-${ids.number}"]`,
  )!;
  number.value = '20';
  fireEvent.submit(number.form!);
  await waitFor(() =>
    expect(view.getByText(/questions\.answers\.doesNotFit|do not fit/)).toBeTruthy(),
  );
  expect(onSave).not.toHaveBeenCalled();
});

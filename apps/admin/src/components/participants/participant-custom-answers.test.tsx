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

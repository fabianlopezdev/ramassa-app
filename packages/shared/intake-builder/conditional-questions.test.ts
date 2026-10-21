import { expect, test } from 'bun:test';
import {
  answerPayload,
  isCustomQuestionVisible,
  isScreenAnswered,
  updateCustomAnswer,
  type CustomQuestion,
  type IntakeScreen,
} from './builder';

const gate: CustomQuestion = {
  id: 'gate',
  screenId: 'participation',
  type: 'single_choice',
  label: { ca: 'Hi ha dificultats?' },
  help: null,
  privacy: 'sensitive',
  placements: ['season'],
  isArchived: false,
  options: [
    { id: 'yes', label: { ca: 'Sí' }, isArchived: false },
    { id: 'no', label: { ca: 'No' }, isArchived: false },
  ],
};
const details: CustomQuestion = {
  ...gate,
  id: 'details',
  type: 'long_text',
  options: [],
  showWhen: { questionId: 'gate', optionId: 'yes' },
};
const screen: IntakeScreen = {
  id: 'participation',
  title: { ca: 'Participació' },
  intro: null,
  afterScreen: 'logistics',
  isArchived: false,
  questions: [gate, details],
};

test('unanswered and No hide the details; Yes reveals them', () => {
  expect(isCustomQuestionVisible(details, {})).toBe(false);
  expect(isCustomQuestionVisible(details, { gate: 'no' })).toBe(false);
  expect(isCustomQuestionVisible(details, { gate: 'yes' })).toBe(true);
  expect(isScreenAnswered(screen, {})).toBe(false);
  expect(isScreenAnswered(screen, { gate: 'no' })).toBe(true);
  expect(isScreenAnswered(screen, { gate: 'yes' })).toBe(false);
  expect(isScreenAnswered(screen, { gate: 'yes', details: 'Horari de feina.' })).toBe(true);
});
test('changing to No clears stale text and sends an explicit answer plus a removal', () => {
  const answers = updateCustomAnswer(
    screen.questions,
    { gate: 'yes', details: 'Horari de feina.', other: 'keep' },
    'gate',
    'no',
  );
  expect(answers).toEqual({ gate: 'no', details: '', other: 'keep' });
  expect(answerPayload(answers)).toEqual({ gate: 'no', details: null, other: 'keep' });
  expect(updateCustomAnswer(screen.questions, answers, 'gate', 'yes').details).toBe('');
});

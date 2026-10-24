/**
 * Who gave an answer, as her page writes it (RAPP-653): her, the entity by
 * name, or the team member by name; a row from before names only the kind.
 */
import { expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import { answerSourceText } from './answer-source';

const t = ((key: string, values?: Record<string, unknown>) =>
  values === undefined ? key : `${key}:${String(values.name)}`) as unknown as TFunction;
const at = '2026-10-12T10:00:00Z';

test('her own answer, the entity by name, the team member by name', () => {
  expect(
    answerSourceText({ source: 'player', answeredAt: at, answeredByName: null }, t, 'en'),
  ).toMatch(/^participants:fitxa\.sourcePlayer · /);
  expect(
    answerSourceText({ source: 'entity', answeredAt: at, answeredByName: 'Creu Roja' }, t, 'en'),
  ).toMatch(/^participants:fitxa\.sourceEntity:Creu Roja · /);
  expect(
    answerSourceText({ source: 'staff', answeredAt: at, answeredByName: 'Marta Puig' }, t, 'en'),
  ).toMatch(/^Marta Puig · /);
});

test('a row from before names the kind of source only', () => {
  expect(
    answerSourceText({ source: 'staff', answeredAt: at, answeredByName: null }, t, 'en'),
  ).toMatch(/^participants:fitxa\.sourceStaffUnknown · /);
  expect(
    answerSourceText({ source: 'entity', answeredAt: at, answeredByName: null }, t, 'en'),
  ).toMatch(/^participants:fitxa\.sourceEntityUnknown · /);
});

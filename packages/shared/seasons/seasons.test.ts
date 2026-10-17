/**
 * Seasons and re-registration (RAPP-306): the season view's filter, the
 * reminder group name, and the payload of her season answers.
 */
import { describe, expect, test } from 'bun:test';
import {
  buildMySeasonAnswersPayload,
  filterRegistrations,
  newSeasonSchema,
  reminderGroupName,
  type SeasonRegistration,
} from './seasons';

const rows: SeasonRegistration[] = [
  { profileId: 'a', name: 'Amina', registered: true, method: 'app', signedAt: '2027-09-10' },
  { profileId: 'b', name: 'Fatima', registered: false, method: null, signedAt: null },
];

describe('filterRegistrations', () => {
  test('all, registered and pending', () => {
    expect(filterRegistrations(rows, 'all')).toHaveLength(2);
    expect(filterRegistrations(rows, 'registered').map((row) => row.name)).toEqual(['Amina']);
    expect(filterRegistrations(rows, 'pending').map((row) => row.name)).toEqual(['Fatima']);
  });
});

describe('newSeasonSchema', () => {
  test('a season needs a name and a start date', () => {
    expect(
      newSeasonSchema.safeParse({ name: '2027/28', startsOn: '2027-09-01', makeCurrent: true })
        .success,
    ).toBe(true);
    expect(
      newSeasonSchema.safeParse({ name: ' ', startsOn: '2027-09-01', makeCurrent: true }).success,
    ).toBe(false);
  });
});

describe('her season answers', () => {
  test('only the four questions travel, an empty list as nothing', () => {
    expect(buildMySeasonAnswersPayload({ childcareNeed: 'yes', supportingEntities: [] })).toEqual({
      applicant_status: null,
      supporting_entities: null,
      childcare_need: 'yes',
      specific_needs: null,
    });
  });
});

test('the reminder group is named after the season', () => {
  expect(reminderGroupName('2027/28')).toBe('Reinscripció 2027/28');
});

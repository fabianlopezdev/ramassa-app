/**
 * Seasons and re-registration (RAPP-306): the season view's filter, the
 * reminder group name, and the payload of her season answers.
 */
import { describe, expect, test } from 'bun:test';
import {
  systemFieldFixtureId,
  systemFieldsCatalogFixture,
  systemOptionFixtureId,
} from '../testing';
import {
  buildMySeasonAnswersPayload,
  filterRegistrations,
  newSeasonSchema,
  reminderGroupName,
  updateMySeasonAnswers,
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

  test('they are saved by field (RAPP-661)', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args?: unknown) => {
        calls.push([name, args]);
        return name === 'intake_catalog'
          ? { data: systemFieldsCatalogFixture(), error: null }
          : { data: null, error: null };
      },
    } as unknown as Parameters<typeof updateMySeasonAnswers>[0];
    await updateMySeasonAnswers(client, { childcareNeed: 'yes', applicantStatus: 'refugee' });
    expect(calls[1]).toEqual([
      'update_my_season_answers',
      {
        p_payload: {
          answers: {
            [systemFieldFixtureId('applicant_status')]: systemOptionFixtureId(
              'applicant_status',
              'refugee',
            ),
            [systemFieldFixtureId('supporting_entities')]: null,
            [systemFieldFixtureId('childcare_need')]: 'yes',
            [systemFieldFixtureId('specific_needs')]: null,
            [systemFieldFixtureId('specific_needs_details')]: null,
          },
        },
      },
    ]);
  });
});

test('the reminder group is named after the season', () => {
  expect(reminderGroupName('2027/28')).toBe('Reinscripció 2027/28');
});

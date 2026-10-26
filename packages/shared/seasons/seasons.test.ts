/**
 * Seasons and re-registration (RAPP-306): the season view's filter, the
 * reminder group name, and the payload of her season answers.
 */
import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '../intake-builder/field-answers';
import {
  systemFieldFixtureId,
  systemFieldsCatalogFixture,
  systemOptionFixtureId,
} from '../testing';
import {
  filterRegistrations,
  mySeasonAnswers,
  newSeasonSchema,
  publishableSeasons,
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
  const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());

  test('the four questions are her answers by field, an empty list as nothing', () => {
    expect(
      mySeasonAnswers(fields, {
        childcareNeed: 'yes',
        applicantStatus: 'refugee',
        supportingEntities: [],
      }),
    ).toEqual({
      [systemFieldFixtureId('applicant_status')]: systemOptionFixtureId(
        'applicant_status',
        'refugee',
      ),
      [systemFieldFixtureId('supporting_entities')]: null,
      [systemFieldFixtureId('childcare_need')]: 'yes',
      [systemFieldFixtureId('specific_needs')]: null,
      [systemFieldFixtureId('specific_needs_details')]: null,
    });
  });

  test('they are saved by field in one call (RAPP-663)', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args?: unknown) => {
        calls.push([name, args]);
        return { data: null, error: null };
      },
    } as unknown as Parameters<typeof updateMySeasonAnswers>[0];
    await updateMySeasonAnswers(client, {
      [systemFieldFixtureId('childcare_need')]: 'yes',
      team: ' text ',
      gone: null,
    });
    expect(calls).toEqual([
      [
        'update_my_season_answers',
        {
          p_payload: {
            answers: { [systemFieldFixtureId('childcare_need')]: 'yes', team: 'text', gone: null },
          },
        },
      ],
    ]);
  });
});

test('the reminder group is named after the season', () => {
  expect(reminderGroupName('2027/28')).toBe('Reinscripció 2027/28');
});

describe('publishableSeasons (RAPP-694)', () => {
  const season = (name: string, startsOn: string, isCurrent = false) => ({
    id: name,
    name,
    startsOn,
    isCurrent,
  });

  test('the current season first, then the later ones; a past season is left out', () => {
    const seasons = [
      season('2028/29', '2028-09-01'),
      season('2027/28', '2027-09-01'),
      season('2026/27', '2026-09-01', true),
      season('2025/26', '2025-09-01'),
    ];
    expect(publishableSeasons(seasons, '2026-10-26').map((row) => row.name)).toEqual([
      '2026/27',
      '2027/28',
      '2028/29',
    ]);
  });

  test('with no current season, the seasons starting today or later', () => {
    const seasons = [season('2027/28', '2027-09-01'), season('2025/26', '2025-09-01')];
    expect(publishableSeasons(seasons, '2026-10-26').map((row) => row.name)).toEqual(['2027/28']);
  });
});

import { describe, expect, test } from 'bun:test';
import { fetchImpactReport, impactReportFiltersSchema, parseImpactReport } from './analytics';

const REPORT = {
  version: 1,
  period: { start_date: '2026-03-29', end_date: '2026-03-31', time_zone: 'Europe/Madrid' },
  filters: {},
  available_filters: {
    categories: [
      {
        id: '62000000-0000-4000-8600-000000000001',
        name: {
          ca: 'Entrenament',
          es: 'Entrenamiento',
          en: 'Training',
          ar: 'تدريب',
          fa: 'تمرین',
        },
      },
    ],
    entities: [{ id: '62000000-0000-4000-8400-000000000001', name: 'Entity Alpha' }],
  },
  summary: {
    suppressed: false,
    participant_count: 5,
    active_participant_count: 5,
    new_participant_count: 4,
    participating_participant_count: 5,
    attendance_present_count: 5,
    attendance_eligible_count: 7,
    attendance_marked_count: 8,
    attendance_rate: 71.43,
  },
  participant_trend: [
    {
      month_start: '2026-03-01',
      new_participant_count: 4,
      participating_participant_count: 5,
      attendance_present_count: 5,
      attendance_eligible_count: 7,
      attendance_marked_count: 8,
      attendance_rate: 71.43,
    },
  ],
  categories: [
    {
      category_id: '62000000-0000-4000-8600-000000000001',
      category_name: {
        ca: 'Entrenament',
        es: 'Entrenamiento',
        en: 'Training',
        ar: 'تدريب',
        fa: 'تمرین',
      },
      category_color: 'primary',
      participant_count: 5,
      attendance_present_count: 3,
      attendance_eligible_count: 4,
      attendance_marked_count: 5,
      attendance_rate: 75,
    },
  ],
  demographics: {
    nationalities: [
      { label: 'Syria', suppressed: false, count: 3 },
      { label: 'Bolivia', suppressed: true },
    ],
    age_bands: [{ label: '18-24', suppressed: false, count: 3 }],
  },
  entities: [
    {
      entity_id: '62000000-0000-4000-8400-000000000001',
      entity_name: 'Entity Alpha',
      suppressed: false,
      participant_count: 3,
      attendance_present_count: 3,
      attendance_eligible_count: 4,
      attendance_marked_count: 5,
      attendance_rate: 75,
    },
  ],
  forum_activity: { suppressed: false, post_count: 2, reply_count: 2, contributor_count: 3 },
  referrals: { suppressed: false, referral_count: 5, converted_count: 5, conversion_rate: 100 },
} as const;

describe('impact report contract', () => {
  test('parses the canonical database response into the shared app shape', () => {
    const report = parseImpactReport(REPORT);

    expect(report.summary).toEqual({
      suppressed: false,
      participantCount: 5,
      activeParticipantCount: 5,
      newParticipantCount: 4,
      participatingParticipantCount: 5,
      attendancePresentCount: 5,
      attendanceEligibleCount: 7,
      attendanceMarkedCount: 8,
      attendanceRate: 71.43,
    });
    expect(report.categories[0]?.categoryName.ar).toBe('تدريب');
    expect(report.demographics.nationalities[1]).toEqual({
      label: 'Bolivia',
      suppressed: true,
    });
  });

  test('rejects malformed dates, reversed periods, and invalid filter identifiers', () => {
    expect(
      impactReportFiltersSchema.safeParse({ startDate: '2026-04-01', endDate: '2026-03-31' })
        .success,
    ).toBe(false);
    expect(
      impactReportFiltersSchema.safeParse({
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        categoryId: 'hostile-value',
      }).success,
    ).toBe(false);
  });

  test('sends the exact typed filters and validates the RPC response', async () => {
    let args: unknown;
    const rpc = async (_name: string, next: unknown) => {
      args = next;
      return { data: REPORT, error: null };
    };

    const report = await fetchImpactReport({ rpc } as never, {
      startDate: '2026-03-29',
      endDate: '2026-03-31',
      categoryId: '62000000-0000-4000-8600-000000000001',
    });

    expect(args).toEqual({
      p_start_date: '2026-03-29',
      p_end_date: '2026-03-31',
      p_category_id: '62000000-0000-4000-8600-000000000001',
      p_collaborating_entity_id: null,
    });
    expect(report.referrals).toEqual({
      suppressed: false,
      referralCount: 5,
      convertedCount: 5,
      conversionRate: 100,
    });
  });

  test('rejects malformed database payloads instead of rendering confident wrong numbers', () => {
    expect(() =>
      parseImpactReport({ ...REPORT, summary: { ...REPORT.summary, attendance_rate: '71%' } }),
    ).toThrow();
  });
});

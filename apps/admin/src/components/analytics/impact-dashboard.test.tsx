import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { ImpactReport } from '@ramassa/shared/analytics';
import { ImpactDashboard } from './impact-dashboard';

const report: ImpactReport = {
  version: 1,
  period: { startDate: '2026-03-29', endDate: '2026-03-31', timeZone: 'Europe/Madrid' },
  filters: {},
  availableFilters: {
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
    participantCount: 5,
    activeParticipantCount: 5,
    newParticipantCount: 4,
    participatingParticipantCount: 5,
    attendancePresentCount: 5,
    attendanceEligibleCount: 7,
    attendanceMarkedCount: 8,
    attendanceRate: 71.43,
  },
  participantTrend: [
    {
      monthStart: '2026-03-01',
      newParticipantCount: 4,
      participatingParticipantCount: 5,
      attendancePresentCount: 5,
      attendanceEligibleCount: 7,
      attendanceMarkedCount: 8,
      attendanceRate: 71.43,
    },
  ],
  categories: [
    {
      categoryId: '62000000-0000-4000-8600-000000000001',
      categoryName: {
        ca: 'Entrenament',
        es: 'Entrenamiento',
        en: 'Training',
        ar: 'تدريب',
        fa: 'تمرین',
      },
      categoryColor: 'primary',
      participantCount: 5,
      attendancePresentCount: 3,
      attendanceEligibleCount: 4,
      attendanceMarkedCount: 5,
      attendanceRate: 75,
    },
  ],
  demographics: {
    nationalities: [
      { label: 'Syria', suppressed: false, count: 3 },
      { label: 'Bolivia', suppressed: true },
    ],
    ageBands: [{ label: '18-24', suppressed: false, count: 3 }],
  },
  entities: [
    {
      entityId: '62000000-0000-4000-8400-000000000001',
      entityName: 'Entity Alpha',
      suppressed: false,
      participantCount: 3,
      attendancePresentCount: 3,
      attendanceEligibleCount: 4,
      attendanceMarkedCount: 5,
      attendanceRate: 75,
    },
  ],
  forumActivity: { suppressed: false, postCount: 2, replyCount: 2, contributorCount: 3 },
  referrals: { suppressed: false, referralCount: 5, convertedCount: 5, conversionRate: 100 },
};

test('renders canonical KPIs, an accessible trend, suppression, and funding credit', () => {
  const view = render(<ImpactDashboard report={report} onFiltersChange={() => undefined} />);

  expect(view.getByTestId('impact-participants').textContent).toContain('5');
  expect(view.getByTestId('impact-attendance-rate').textContent).toContain('71.43%');
  expect(view.getByRole('img').getAttribute('aria-labelledby')).toContain('impact-trend-title');
  expect(view.getByTestId('impact-trend-table').textContent).toContain('71.43%');
  expect(view.getByTestId('impact-demographic-nationalities').textContent).toContain('Bolivia');
  expect(view.getByTestId('impact-demographic-nationalities').textContent).not.toMatch(
    /Bolivia\s*2/,
  );
  expect(view.getByTestId('generalitat-funding').textContent).toMatch(
    /Generalitat|impactFundingAcknowledgment/i,
  );
});

test('submits date, category, and entity filters through one callback', () => {
  const onFiltersChange = mock(() => undefined);
  const view = render(<ImpactDashboard report={report} onFiltersChange={onFiltersChange} />);

  fireEvent.input(view.getByLabelText(/Start date|filterStartDate/), {
    target: { value: '2026-03-01' },
  });
  fireEvent.change(view.getByLabelText(/Category|filterCategory/), {
    target: { value: '62000000-0000-4000-8600-000000000001' },
  });
  fireEvent.change(view.getByLabelText(/Entity|filterEntity/), {
    target: { value: '62000000-0000-4000-8400-000000000001' },
  });
  fireEvent.submit(view.getByTestId('impact-report-filters'));

  expect(onFiltersChange).toHaveBeenCalledWith({
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    categoryId: '62000000-0000-4000-8600-000000000001',
    collaboratingEntityId: '62000000-0000-4000-8400-000000000001',
  });
});

test('small cohorts show only the privacy explanation', () => {
  const view = render(
    <ImpactDashboard
      report={{
        ...report,
        summary: { suppressed: true },
        participantTrend: [],
        categories: [],
        forumActivity: { suppressed: true },
        referrals: { suppressed: true },
      }}
      onFiltersChange={() => undefined}
    />,
  );

  expect(view.getByTestId('impact-suppressed')).not.toBeNull();
  expect(view.queryByTestId('impact-participants')).toBeNull();
  expect(view.queryByRole('img')).toBeNull();
});

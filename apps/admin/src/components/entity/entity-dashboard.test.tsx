import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type {
  EntityDashboard as EntityDashboardData,
  ManagedEntity,
} from '@ramassa/shared/entity-management';
import { EntityDashboard } from './entity-dashboard';
import { EntityManagementPanel } from './entity-management-panel';

function withI18n(node: React.ReactNode) {
  return render(node);
}

const dashboard: EntityDashboardData = {
  impact: {
    suppressed: false,
    referredCount: 3,
    activeCount: 2,
    inactiveCount: 1,
    attendancePresentCount: 4,
    attendanceEligibleCount: 6,
    attendanceMarkedCount: 7,
    attendanceRate: 66.67,
  },
  trend: [
    {
      monthStart: '2026-08-01',
      participantCount: 3,
      attendancePresentCount: 4,
      attendanceEligibleCount: 6,
      attendanceMarkedCount: 7,
      attendanceRate: 66.67,
    },
  ],
  tracking: [
    {
      referralId: '5eed0000-0000-4000-8010-000000000002',
      referredProfileId: '5eed0000-0000-4000-8000-000000000011',
      referredFirstName: 'Amina',
      referredLastName: 'Alhassan',
      status: 'active',
      attendancePresentCount: 2,
      attendanceAbsentCount: 1,
      attendanceExcusedCount: 1,
      attendanceMarkedCount: 4,
      attendanceRate: 66.67,
      latestOccurrenceAt: '2026-08-10T18:00:00Z',
    },
  ],
  upcomingEvents: [
    {
      id: '5eed0000-0000-4000-8003-000000000001',
      categoryId: '5eed0000-0000-4000-8002-000000000001',
      title: { en: 'Training session' },
      description: { en: 'Weekly practice' },
      location: 'Vic',
      locationUrl: null,
      startsAt: '2026-08-20T18:00:00Z',
      endsAt: '2026-08-20T19:30:00Z',
      timeZone: 'Europe/Madrid',
      isRecurring: true,
    },
  ],
};

test('entity dashboard exposes exact KPI and attendance values without event actions', () => {
  const view = withI18n(<EntityDashboard dashboard={dashboard} />);

  expect(view.getByTestId('entity-impact-referred').textContent).toContain('3');
  expect(view.getByTestId('entity-impact-rate').textContent).toContain('66.67%');
  expect(view.getByTestId('entity-tracking-row').textContent).toContain('Amina Alhassan');
  expect(view.getByTestId('entity-tracking-row').textContent).toContain('4');
  expect(view.getByTestId('entity-event-card').textContent).toContain('Training session');
  expect(view.queryByRole('button', { name: /sign up/i })).toBeNull();
});

test('suppressed dashboard never renders counts, rates, or trend points', () => {
  const view = withI18n(
    <EntityDashboard
      dashboard={{
        ...dashboard,
        impact: {
          suppressed: true,
          referredCount: null,
          activeCount: null,
          inactiveCount: null,
          attendancePresentCount: null,
          attendanceEligibleCount: null,
          attendanceMarkedCount: null,
          attendanceRate: null,
        },
        trend: [],
      }}
    />,
  );

  expect(view.getByTestId('entity-impact-suppressed')).not.toBeNull();
  expect(view.queryByTestId('entity-impact-referred')).toBeNull();
  expect(view.queryByTestId('entity-trend-table')).toBeNull();
});

test('entity management panel exposes add, invite, collaborator removal, and deactivation actions', async () => {
  const entity: ManagedEntity = {
    id: '5eed0000-0000-4000-8030-000000000001',
    name: 'Creu Roja Osona',
    isActive: true,
    activeCollaboratorCount: 1,
    referralCount: 4,
    pendingInvitationCount: 0,
    createdAt: '2026-08-14T00:00:00Z',
    updatedAt: '2026-08-14T00:00:00Z',
  };
  const onCreateEntity = mock(async () => undefined);
  const onInvite = mock(async () => undefined);
  const onSetEntityActive = mock(async () => undefined);
  const onSetCollaboratorActive = mock(async () => undefined);
  const view = withI18n(
    <EntityManagementPanel
      entities={[entity]}
      collaborators={[
        {
          profileId: '5eed0000-0000-4000-8000-000000000004',
          firstName: 'Sílvia',
          lastName: 'Bosch',
          email: 'silvia.bosch@example.test',
          isActive: true,
          invitedAt: null,
          acceptedAt: null,
        },
      ]}
      selectedEntityId={entity.id}
      onSelectEntity={() => undefined}
      onCreateEntity={onCreateEntity}
      onInvite={onInvite}
      onSetEntityActive={onSetEntityActive}
      onSetCollaboratorActive={onSetCollaboratorActive}
    />,
  );

  fireEvent.input(view.getByLabelText(/Entity name|entityName/), {
    target: { value: 'Fundació Nova' },
  });
  fireEvent.submit(view.getByTestId('entity-create-form'));
  fireEvent.input(view.getByLabelText(/First name|firstName/), { target: { value: 'Núria' } });
  fireEvent.input(view.getByLabelText(/Last name|lastName/), { target: { value: 'Soler' } });
  fireEvent.input(view.getByLabelText(/Email|email/), {
    target: { value: 'nuria.soler@example.test' },
  });
  fireEvent.submit(view.getByTestId('entity-invite-form'));
  fireEvent.click(view.getByRole('button', { name: /Remove access|removeAccess/ }));
  fireEvent.click(view.getByRole('button', { name: /Deactivate entity|deactivateEntity/ }));

  await waitFor(() => {
    expect(onCreateEntity).toHaveBeenCalledWith({ name: 'Fundació Nova' });
    expect(onInvite).toHaveBeenCalledWith({
      email: 'nuria.soler@example.test',
      firstName: 'Núria',
      lastName: 'Soler',
    });
    expect(onSetCollaboratorActive).toHaveBeenCalledWith(
      '5eed0000-0000-4000-8000-000000000004',
      false,
    );
    expect(onSetEntityActive).toHaveBeenCalledWith(entity.id, false);
  });
});

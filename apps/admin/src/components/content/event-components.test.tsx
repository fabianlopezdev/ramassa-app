import { createAdminI18n } from '@/lib/i18n';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { EventEditor } from './event-editor';
import { OneOffEventScheduleFields, WeeklyEventScheduleFields } from './event-schedule-fields';
import { ScheduledPublishFields } from './scheduled-publish-fields';

const scheduleLabels = {
  startsAt: 'Comença',
  endsAt: 'Acaba',
  interval: 'Cada quantes setmanes',
  count: 'Nombre de sessions',
};

function withI18n(node: React.ReactNode) {
  return <I18nextProvider i18n={createAdminI18n('ca')}>{node}</I18nextProvider>;
}

test('one-off and weekly event schedules are explicit form variants', () => {
  const oneOff = render(
    <OneOffEventScheduleFields
      startsAt="2026-10-18T11:00"
      endsAt="2026-10-18T13:00"
      labels={scheduleLabels}
      onStartsAtChange={() => undefined}
      onEndsAtChange={() => undefined}
    />,
  );
  expect(oneOff.getByTestId('event-starts-at')).toBeTruthy();
  expect(oneOff.queryByTestId('event-recurrence-count')).toBeNull();
  oneOff.unmount();

  const weekly = render(
    <WeeklyEventScheduleFields
      startsAt="2026-03-22T18:00"
      endsAt="2026-03-22T19:30"
      interval={1}
      count={6}
      labels={scheduleLabels}
      onStartsAtChange={() => undefined}
      onEndsAtChange={() => undefined}
      onIntervalChange={() => undefined}
      onCountChange={() => undefined}
    />,
  );
  expect(weekly.getByTestId('event-recurrence-interval')).toBeTruthy();
  expect(weekly.getByTestId('event-recurrence-count')).toBeTruthy();
});

test('weekly schedule fields constrain interval and count at the input boundary', () => {
  const screen = render(
    <WeeklyEventScheduleFields
      startsAt="2026-03-22T18:00"
      endsAt="2026-03-22T19:30"
      interval={1}
      count={6}
      labels={scheduleLabels}
      onStartsAtChange={() => undefined}
      onEndsAtChange={() => undefined}
      onIntervalChange={() => undefined}
      onCountChange={() => undefined}
    />,
  );

  expect(screen.getByTestId('event-recurrence-interval').getAttribute('max')).toBe('4');
  expect(screen.getByTestId('event-recurrence-count').getAttribute('max')).toBe('52');
});

test('scheduled publishing scopes its selectors to the consuming editor', () => {
  const screen = render(
    withI18n(
      <ScheduledPublishFields
        fieldId="event"
        mode="scheduled"
        publishedAt="2026-03-01T10:00"
        expiresAt=""
        onModeChange={() => undefined}
        onPublishedAtChange={() => undefined}
        onExpiresAtChange={() => undefined}
      />,
    ),
  );

  expect(screen.getByTestId('event-mode')).toBeTruthy();
  expect(screen.getByTestId('event-published-at')).toBeTruthy();
  expect(screen.getByTestId('event-expires-at')).toBeTruthy();
});

test('the category icon and semantic color are reflected in the event editor', () => {
  const screen = render(
    withI18n(
      <EventEditor
        categories={[
          {
            id: '5eed0000-0000-4000-8002-000000000001',
            name: {
              ca: 'Entrenaments',
              es: 'Entrenamientos',
              en: 'Training',
              ar: 'التدريبات',
              fa: 'تمرین ها',
            },
            icon: 'dumbbell',
            color: 'chart-2',
            sort_order: 10,
            created_at: '2026-08-04T12:00:00.000Z',
            updated_at: '2026-08-04T12:00:00.000Z',
          },
        ]}
        onSaved={() => undefined}
      />,
    ),
  );

  const selected = screen.getByTestId('event-selected-category');
  expect(selected.textContent).toContain('Entrenaments');
  expect(selected.querySelector('[aria-label="Entrenaments"]')).toBeTruthy();
  expect(selected.querySelector('[data-color="chart-2"]')).toBeTruthy();
  expect(screen.getByTestId('event-recurrence-one_off')).toBeTruthy();
});

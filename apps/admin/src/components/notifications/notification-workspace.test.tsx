import { createAdminI18n } from '@/lib/i18n';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { I18nextProvider } from 'react-i18next';
import {
  filterNotificationGroupParticipants,
  NotificationWorkspace,
} from './notification-workspace';

const searchableParticipants = [
  {
    id: '5eed0000-0000-4000-8000-000000000011',
    fullName: 'Amina One',
    language: 'ar' as const,
  },
  {
    id: '5eed0000-0000-4000-8000-000000000012',
    fullName: 'Yolanda Àlvarez',
    language: 'ca' as const,
  },
  {
    id: '5eed0000-0000-4000-8000-000000000013',
    fullName: 'Наталія Коваль',
    language: 'en' as const,
  },
];

test('custom group participant search handles partial, accented, non-Latin, and hostile text', () => {
  expect(
    filterNotificationGroupParticipants(searchableParticipants, 'amin').map((item) => item.id),
  ).toEqual(['5eed0000-0000-4000-8000-000000000011']);
  expect(
    filterNotificationGroupParticipants(searchableParticipants, 'alva').map((item) => item.id),
  ).toEqual(['5eed0000-0000-4000-8000-000000000012']);
  expect(
    filterNotificationGroupParticipants(searchableParticipants, 'ната').map((item) => item.id),
  ).toEqual(['5eed0000-0000-4000-8000-000000000013']);
  expect(
    filterNotificationGroupParticipants(searchableParticipants, '<script>alert(59)</script>'),
  ).toEqual([]);
});

test('notification workspace exposes template, audience confirmation, groups, and history', () => {
  const view = render(
    <I18nextProvider i18n={createAdminI18n('en')}>
      <NotificationWorkspace
        templates={[
          {
            id: '5eed0000-0000-4000-8033-000000000001',
            name: 'Weekly training',
            category: 'engagement',
            title: { ca: 'T', es: 'T', en: 'T', ar: 'T', fa: 'T' },
            body: { ca: 'B', es: 'B', en: 'B', ar: 'B', fa: 'B' },
            createdAt: '2026-08-21T12:00:00Z',
            updatedAt: '2026-08-21T12:00:00Z',
          },
        ]}
        groups={[
          {
            id: '5eed0000-0000-4000-8034-000000000001',
            name: 'Weekly multilingual group',
            participantIds: ['5eed0000-0000-4000-8000-000000000011'],
            createdAt: '2026-08-21T12:00:00Z',
            updatedAt: '2026-08-21T12:00:00Z',
          },
        ]}
        history={[
          {
            id: '5eed0000-0000-4000-8035-000000000001',
            templateId: '5eed0000-0000-4000-8033-000000000001',
            audienceKind: 'custom_group',
            audienceConfig: {},
            recipientCount: 5,
            deviceCount: 5,
            sentCount: 5,
            deliveredCount: 5,
            failedCount: 0,
            state: 'complete',
            sentBy: null,
            createdAt: '2026-08-21T12:00:00Z',
          },
        ]}
        options={{
          serviceCategories: [],
          events: [],
          entities: [],
          participants: searchableParticipants,
        }}
        onRefresh={async () => undefined}
      />
    </I18nextProvider>,
  );

  expect(view.getByTestId('notification-template-picker')).not.toBeNull();
  expect(view.getByTestId('notification-audience-kind')).not.toBeNull();
  expect(view.getByTestId('notification-confirmation').dataset.recipientCount).toBe('0');
  expect(view.getByTestId('notification-confirmation').dataset.deviceCount).toBe('0');
  expect(
    view.getByTestId('notification-group-5eed0000-0000-4000-8034-000000000001'),
  ).not.toBeNull();
  expect(view.getByTestId('notification-group-search')).not.toBeNull();
  const historyItem = view.getByTestId('notification-history-5eed0000-0000-4000-8035-000000000001');
  expect(historyItem.dataset.recipientCount).toBe('5');
  expect(historyItem.dataset.deviceCount).toBe('5');
});

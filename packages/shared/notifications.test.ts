import { expect, test } from 'bun:test';
import {
  NOTIFICATION_AUDIENCE_KINDS,
  notificationAudienceSchema,
  notificationContentSchema,
  notificationSendInputSchema,
  resolveNotificationCopy,
} from './notifications';

const weeklyReminder = {
  ca: 'Recordatori de l’entrenament setmanal',
  es: 'Recordatorio del entrenamiento semanal',
  en: 'Weekly training reminder',
  ar: 'تذكير بالتدريب الأسبوعي',
  fa: 'یادآوری تمرین هفتگی',
} as const;

test('targeted notification contracts expose every supported audience', () => {
  expect(NOTIFICATION_AUDIENCE_KINDS).toEqual([
    'all',
    'interest',
    'signup',
    'entity',
    'custom_group',
  ]);
});

test('notification copy requires reviewed text in all five supported languages', () => {
  expect(notificationContentSchema.parse(weeklyReminder)).toEqual(weeklyReminder);
  expect(() => notificationContentSchema.parse({ ...weeklyReminder, fa: '' })).toThrow();
});

test('audience configuration is discriminated and rejects mismatched identifiers', () => {
  expect(notificationAudienceSchema.parse({ kind: 'all' })).toEqual({ kind: 'all' });
  expect(
    notificationAudienceSchema.parse({
      kind: 'custom_group',
      customGroupId: '5eed0000-0000-4000-8034-000000000001',
    }),
  ).toEqual({
    kind: 'custom_group',
    customGroupId: '5eed0000-0000-4000-8034-000000000001',
  });
  expect(() =>
    notificationAudienceSchema.parse({ kind: 'signup', customGroupId: crypto.randomUUID() }),
  ).toThrow();
});

test('a send requires an audience preview count and complete localized copy', () => {
  const parsed = notificationSendInputSchema.parse({
    templateId: '5eed0000-0000-4000-8033-000000000001',
    title: weeklyReminder,
    body: weeklyReminder,
    audience: {
      kind: 'entity',
      entityName: 'Creu Roja Osona',
    },
    expectedRecipientCount: 7,
  });
  expect(parsed.expectedRecipientCount).toBe(7);
  expect(() =>
    notificationSendInputSchema.parse({ ...parsed, expectedRecipientCount: -1 }),
  ).toThrow();
});

test('delivery copy resolves the recipient language with Catalan fallback', () => {
  expect(resolveNotificationCopy(weeklyReminder, 'ar')).toBe(weeklyReminder.ar);
  expect(resolveNotificationCopy(weeklyReminder, 'de')).toBe(weeklyReminder.ca);
});

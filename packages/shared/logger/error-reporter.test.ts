import { expect, test } from 'bun:test';
import { AppError } from '../errors';
import { buildRedactedErrorReportExtra } from './error-reporter';
import { REDACTED } from './redact';

test('Sentry report extras redact nested AppError context as well as caller context', () => {
  const error = new AppError('DB-1', {
    context: {
      participantId: '5eed0000-0000-4000-8000-000000000030',
      email: 'private@example.test',
      staffNotes: 'Sensitive support detail',
    },
  });

  expect(
    buildRedactedErrorReportExtra(error, {
      route: '/participants/5eed0000-0000-4000-8000-000000000030',
      phone: '+34 612 345 678',
    }),
  ).toEqual({
    route: '/participants/5eed0000-0000-4000-8000-000000000030',
    phone: REDACTED,
    errorContext: {
      participantId: '5eed0000-0000-4000-8000-000000000030',
      email: REDACTED,
      staffNotes: REDACTED,
    },
  });
});

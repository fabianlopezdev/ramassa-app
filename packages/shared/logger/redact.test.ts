import { describe, expect, test } from 'bun:test';
import { buildParticipant, buildParticipants } from '../testing';
import { REDACTED, redactPii } from './redact';

describe('redactPii — key-based redaction', () => {
  test('scrubs every PII column of a real participant row, nested in a log payload', () => {
    // The factory row is the same shape the app actually logs (RAPP-18), so this
    // asserts against the real column names rather than a hand-picked subset.
    const participant = buildParticipant();
    const fixture = {
      userId: participant.id,
      profile: participant,
      attendees: buildParticipants(2).map((attendee) => ({
        name: `${attendee.first_name} ${attendee.last_name}`,
        present: true,
      })),
    };

    const redacted = redactPii(fixture) as typeof fixture;

    expect(redacted.profile.first_name).toBe(REDACTED);
    expect(redacted.profile.last_name).toBe(REDACTED);
    expect(redacted.profile.phone).toBe(REDACTED);
    expect(redacted.profile.address).toBe(REDACTED);
    expect(redacted.profile.document_number).toBe(REDACTED);
    expect(redacted.profile.date_of_birth).toBe(REDACTED);
    expect(redacted.profile.nationality).toBe(REDACTED);
    expect(redacted.attendees[0]?.name).toBe(REDACTED);
    expect(redacted.attendees[1]?.name).toBe(REDACTED);

    // Technical facts survive.
    // NOT asserted here: that the opaque UUIDs survive. They do not — the
    // phone-candidate pattern eats the digit runs inside a digit-heavy UUID and
    // logs `5eed[REDACTED]` instead of the id. That is a real defect in this
    // module (RAPP-84), surfaced by feeding it a real row; it over-redacts, so
    // nothing leaks, but a log entry loses the one field that makes it
    // actionable. Asserting the broken behaviour here would cement it.
    expect(redacted.profile.role).toBe('player');
    expect(redacted.profile.preferred_language).toBe(participant.preferred_language);
    expect(redacted.attendees[0]?.present).toBe(true);
  });

  test('matches PII keys case-insensitively across naming styles', () => {
    const redacted = redactPii({
      firstName: 'a',
      last_name: 'b',
      phoneNumber: 'c',
      Email: 'd',
      ADDRESS: 'e',
      documentNumber: 'f',
      dateOfBirth: 'g',
    }) as Record<string, unknown>;

    for (const value of Object.values(redacted)) {
      expect(value).toBe(REDACTED);
    }
  });

  test('does not touch the original object (pure)', () => {
    const original = { name: 'Amina' };
    redactPii(original);
    expect(original.name).toBe('Amina');
  });
});

describe('redactPii — pattern-based redaction inside string values', () => {
  test('scrubs emails, phone numbers, and DNI/NIE embedded in free text under safe keys', () => {
    const redacted = redactPii({
      note: 'Contact amina@example.org or +34612345678, document X1234567L, DNI 12345678Z',
    }) as { note: string };

    expect(redacted.note).not.toContain('amina@example.org');
    expect(redacted.note).not.toContain('612345678');
    expect(redacted.note).not.toContain('X1234567L');
    expect(redacted.note).not.toContain('12345678Z');
  });

  test('leaves ordinary technical strings alone', () => {
    const redacted = redactPii({
      route: '/events/42/attendance',
      status: 'HTTP 503 from supabase',
    }) as Record<string, string>;

    expect(redacted.route).toBe('/events/42/attendance');
    expect(redacted.status).toBe('HTTP 503 from supabase');
  });
});

describe('redactPii — resilience', () => {
  test('survives circular references without throwing', () => {
    const node: Record<string, unknown> = { userId: 'user-1' };
    node.self = node;
    expect(() => redactPii(node)).not.toThrow();
  });

  test('passes primitives through', () => {
    expect(redactPii('plain')).toBe('plain');
    expect(redactPii(7)).toBe(7);
    expect(redactPii(null)).toBe(null);
  });
});

/**
 * Credentials (RAPP-25). Staff create accounts for participants with no email;
 * the generated password is returned once and stored nowhere. The one way it
 * could outlive that moment is a failure carrying it into an error context, so
 * the key is redacted like any other secret.
 */
test('a generated account password never survives redaction', () => {
  const redacted = redactPii({
    profileId: '5eed0000-0000-4000-8000-000000000030',
    email: 'blanca.k4m9@ramassa.invalid',
    password: 'xkm4-9rtp-w2n7',
  }) as Record<string, unknown>;

  expect(redacted.password).toBe(REDACTED);
  expect(redacted.email).toBe(REDACTED);
  // Opaque IDs are the one thing that may be logged, and must be: without them
  // an incident cannot be traced to a record at all.
  expect(redacted.profileId).toBe('5eed0000-0000-4000-8000-000000000030');
});

test('the other credential-shaped keys go too', () => {
  const redacted = redactPii({
    token: 'eyJhbGciOi',
    refreshToken: 'r-123',
    apiKey: 'sk-live-abc',
  }) as Record<string, unknown>;

  expect(Object.values(redacted)).toEqual([REDACTED, REDACTED, REDACTED]);
});

/**
 * The promise in this module's docstring: opaque IDs are loggable, and must be,
 * or an incident cannot be traced to a record. The seeded identifiers are the
 * hard case because they are almost all digits, which is indistinguishable from
 * a phone number to a pattern that only counts them.
 */
test('an opaque identifier survives intact, including the digit-heavy seeded ones', () => {
  const seededId = '5eed0000-0000-4000-8000-000000000030';
  const randomId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  expect(redactPii({ id: seededId })).toEqual({ id: seededId });
  expect(redactPii({ id: randomId })).toEqual({ id: randomId });
});

test('but a phone number quoted beside one still goes', () => {
  const redacted = redactPii({
    note: 'called 5eed0000-0000-4000-8000-000000000030 on +34600111222',
  }) as Record<string, unknown>;

  expect(redacted.note).toContain(REDACTED);
  expect(redacted.note).not.toContain('+34600111222');
});

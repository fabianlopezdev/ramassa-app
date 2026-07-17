import { describe, expect, test } from 'bun:test';
import { REDACTED, redactPii } from './redact';

describe('redactPii — key-based redaction', () => {
  test('scrubs the seeded PII fixture: name, phone, and document in nested objects', () => {
    const fixture = {
      userId: 'user-123',
      profile: {
        fullName: 'Amina Rahimi',
        phone: '+34 612 345 678',
        document_number: 'X1234567L',
        preferences: { language: 'fa' },
      },
      attendees: [
        { name: 'Fatima K.', present: true },
        { name: 'Olena S.', present: false },
      ],
    };

    const redacted = redactPii(fixture) as typeof fixture;

    expect(redacted.profile.fullName).toBe(REDACTED);
    expect(redacted.profile.phone).toBe(REDACTED);
    expect(redacted.profile.document_number).toBe(REDACTED);
    expect(redacted.attendees[0]?.name).toBe(REDACTED);
    expect(redacted.attendees[1]?.name).toBe(REDACTED);

    // Opaque IDs and technical facts survive.
    expect(redacted.userId).toBe('user-123');
    expect(redacted.profile.preferences.language).toBe('fa');
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

import { describe, expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  canOpenParticipantCard,
  participantCardHref,
  participantSegments,
  pendingInviteCount,
  resolveParticipantSegment,
} from './participant-segments';

const holding = (...codes: PermissionCode[]): ReadonlySet<PermissionCode> => new Set(codes);

describe('participantSegments', () => {
  test('the roster always shows; each other segment needs its own permission', () => {
    expect(participantSegments(holding('participants.view'))).toEqual(['players']);
    expect(participantSegments(holding('participants.view', 'participants.invite'))).toEqual([
      'players',
      'invites',
    ]);
    expect(participantSegments(holding('participants.view', 'rgpd.erase'))).toEqual([
      'players',
      'deletion-requests',
    ]);
    expect(
      participantSegments(holding('participants.view', 'participants.invite', 'rgpd.erase')),
    ).toEqual(['players', 'invites', 'deletion-requests']);
  });
});

describe('resolveParticipantSegment', () => {
  const all = ['players', 'invites', 'deletion-requests'] as const;

  test('a permitted request opens that segment', () => {
    expect(resolveParticipantSegment('invites', all)).toBe('invites');
    expect(resolveParticipantSegment('deletion-requests', all)).toBe('deletion-requests');
  });

  test('an unknown or forbidden request falls back to the roster', () => {
    expect(resolveParticipantSegment(undefined, all)).toBe('players');
    expect(resolveParticipantSegment('anything', all)).toBe('players');
    expect(resolveParticipantSegment('invites', ['players'])).toBe('players');
  });
});

describe('pendingInviteCount', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const invite = (accepted_at: string | null, expires_at: string) => ({ accepted_at, expires_at });

  test('counts only open invites: neither used nor expired', () => {
    expect(
      pendingInviteCount(
        [
          invite(null, '2026-12-01T00:00:00Z'),
          invite(null, '2026-12-02T00:00:00Z'),
          invite('2026-11-10T00:00:00Z', '2026-12-01T00:00:00Z'),
          invite(null, '2026-11-01T00:00:00Z'),
        ],
        now,
      ),
    ).toBe(2);
    expect(pendingInviteCount([], now)).toBe(0);
  });
});

describe('participant card link', () => {
  test('only a holder of participants.view may open her card', () => {
    expect(canOpenParticipantCard(holding('participants.view'))).toBe(true);
    expect(canOpenParticipantCard(holding('attendance.mark', 'messages.inbox'))).toBe(false);
  });

  test('points at the participant card route', () => {
    expect(participantCardHref('abc')).toBe('/participant/abc');
  });
});

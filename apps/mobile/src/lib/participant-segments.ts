/**
 * The Participants area's segments (RAPP-798) and the one rule for opening a
 * participant's card from any screen that names her (RAPP-799).
 */
import type { Href } from 'expo-router';
import { inviteStatus, type InviteRow } from '@ramassa/shared/accounts';
import type { PermissionCode } from '@ramassa/shared/permissions';

export type ParticipantSegment = 'players' | 'invites' | 'deletion-requests';

/** The segments this person may see, in display order. The roster is always first. */
export function participantSegments(
  permissions: ReadonlySet<PermissionCode>,
): readonly ParticipantSegment[] {
  const segments: ParticipantSegment[] = ['players'];
  if (permissions.has('participants.invite')) segments.push('invites');
  if (permissions.has('rgpd.erase')) segments.push('deletion-requests');
  return segments;
}

/** A requested segment (a route param) when she may see it, else the roster. */
export function resolveParticipantSegment(
  requested: string | undefined,
  allowed: readonly ParticipantSegment[],
): ParticipantSegment {
  return allowed.find((segment) => segment === requested) ?? 'players';
}

/** Invites still waiting for her to join: not used and not expired. */
export function pendingInviteCount(
  invites: readonly Pick<InviteRow, 'accepted_at' | 'expires_at'>[],
  now: Date,
): number {
  let count = 0;
  for (const invite of invites) {
    if (inviteStatus(invite, now) === 'pending') count += 1;
  }
  return count;
}

/** Her card is guarded by `participants.view`, so a link to it shows only with it. */
export function canOpenParticipantCard(permissions: ReadonlySet<PermissionCode>): boolean {
  return permissions.has('participants.view');
}

export function participantCardHref(participantId: string): Href {
  return `/participant/${participantId}` as Href;
}

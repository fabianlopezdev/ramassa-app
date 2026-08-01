/**
 * The invitations screen's shapes and pure readings (RAPP-25), split from the
 * fetches the way `participant-detail.ts` is: bun tests run this file with no
 * client in sight.
 */

/** An invitation as the staff list renders it, with the colleague who sent it. */
export interface InviteRow {
  readonly id: string;
  readonly email: string;
  readonly reference_entity: string | null;
  readonly created_at: string;
  readonly expires_at: string;
  readonly accepted_at: string | null;
  readonly invited_by: string;
  readonly inviter: { readonly first_name: string; readonly last_name: string } | null;
}

/**
 * The invite columns, with the inviter embedded through the FK by NAME.
 * `invites` points at `profiles` twice (who invited, who accepted), so an
 * unqualified embed is ambiguous and PostgREST refuses it rather than guessing.
 */
export const INVITE_COLUMNS =
  'id, email, reference_entity, created_at, expires_at, accepted_at, invited_by, inviter:profiles!invites_invited_by_fkey(first_name, last_name)';

export type InviteStatus = 'pending' | 'accepted' | 'expired';

/**
 * What one invite row means today. Accepted WINS over expired: an invite spent
 * in time stays accepted forever, because its expiry passing later does not
 * un-onboard anyone.
 */
export function inviteStatus(
  invite: Pick<InviteRow, 'accepted_at' | 'expires_at'>,
  now: Date,
): InviteStatus {
  if (invite.accepted_at !== null) return 'accepted';
  return new Date(invite.expires_at).getTime() > now.getTime() ? 'pending' : 'expired';
}

/**
 * The name an invite is signed with, or nothing. Same contract as
 * `noteAuthorName`: an unreadable inviter is the ABSENCE of a name the screen
 * translates, never a rendered "null null".
 */
export function inviterName(invite: Pick<InviteRow, 'inviter'>): string | null {
  return invite.inviter === null
    ? null
    : `${invite.inviter.first_name} ${invite.inviter.last_name}`;
}

/**
 * What the wizard's referring-entity field should show: what the player has
 * already put there if she has put anything, otherwise the entity her invite
 * carries.
 *
 * The precedence is the whole point, and it only runs one way. An invite is
 * what the TEAM believes; the profile is what SHE says, so a saved answer is
 * never overwritten by a prefill arriving a moment later from the network. That
 * includes her explicit "no entity" (`null` from the chip): choosing none is an
 * answer, and an invite must not undo it.
 */
export function prefilledReferenceEntity(
  savedValue: string | null | undefined,
  inviteEntity: string | null | undefined,
): string | null | undefined {
  if (savedValue === null) return null;
  if (savedValue !== undefined && savedValue !== '') return savedValue;
  return inviteEntity === undefined || inviteEntity === null || inviteEntity === ''
    ? savedValue
    : inviteEntity;
}

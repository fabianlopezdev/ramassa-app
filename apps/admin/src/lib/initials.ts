/**
 * Names shown in the top bar and the sidebar brand block (RAPP-631, RAPP-632):
 * pure helpers, so the fallbacks for a missing name or logo stay testable.
 */

export interface AccountName {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

/** The name the user menu shows: her full name, else her email. */
export function accountDisplayName(account: AccountName): string {
  const name = `${account.firstName} ${account.lastName}`.trim();
  return name.length > 0 ? name : account.email;
}

/** Up to two initials for her avatar when there is no photo. */
export function accountInitials(account: AccountName): string {
  const initials = `${account.firstName.trim().charAt(0)}${account.lastName.trim().charAt(0)}`;
  if (initials.length > 0) return initials.toLocaleUpperCase();
  return account.email.trim().charAt(0).toLocaleUpperCase();
}

/** Up to two initials from the organization's name, for the logo-less tile. */
export function organizationInitials(name: string): string {
  return name
    .split(/\s+/u)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase())
    .join('');
}

import type { AccountArea } from './account-area';

/** Ask only on the first main screen, after every required entry gate clears. */
export function canPromptForPush({
  area,
  pathname,
  home,
  isBlocked,
}: {
  readonly area: AccountArea;
  readonly pathname: string;
  readonly home: string | null;
  readonly isBlocked: boolean;
}): boolean {
  if (isBlocked) return false;
  if (area === 'player') return pathname === '/';
  if (area === 'team' || area === 'entity') return home !== null && pathname === home;
  return false;
}

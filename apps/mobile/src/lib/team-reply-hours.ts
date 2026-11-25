/**
 * Her chat says when the team replies only outside those hours (RAPP-971):
 * inside them a reply is on its way, so the line would only take room.
 */
import { useEffect, useState } from 'react';
import { isWithinTeamReplyHours } from '@ramassa/shared/messaging';

/** How often an open chat checks the clock, so the line appears at 17:00 without leaving. */
const RECHECK_MS = 60_000;

/** True while the team is outside its reply hours. */
export function useOutsideTeamReplyHours(): boolean {
  const [isOutside, setIsOutside] = useState(() => !isWithinTeamReplyHours(new Date()));
  useEffect(() => {
    const recheck = setInterval(() => {
      setIsOutside(!isWithinTeamReplyHours(new Date()));
    }, RECHECK_MS);
    return () => clearInterval(recheck);
  }, []);
  return isOutside;
}

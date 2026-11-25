/**
 * The team answers her chat Monday to Friday, 9:00 to 17:00, club time
 * (RAPP-971). Her chat says so only outside those hours: inside them a reply
 * is on its way, so the line would only take room.
 */
import { useEffect, useState } from 'react';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';

const REPLY_DAYS: ReadonlySet<string> = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const REPLY_START_HOUR = 9;
const REPLY_END_HOUR = 17;
/** How often an open chat checks the clock, so the line appears at 17:00 without leaving. */
const RECHECK_MS = 60_000;

const clubClock = new Intl.DateTimeFormat('en-US', {
  timeZone: MADRID_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function isWithinTeamReplyHours(now: Date): boolean {
  const parts = clubClock.formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return REPLY_DAYS.has(weekday) && hour >= REPLY_START_HOUR && hour < REPLY_END_HOUR;
}

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

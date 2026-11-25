import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { MADRID_TIME_ZONE } from './events';

/**
 * Today in Madrid, `YYYY-MM-DD`, whatever the phone's own time zone. Read with
 * the time zone library activity times use, which works on the phone; a
 * `Intl.DateTimeFormat` reading of the Madrid clock did not (RAPP-971).
 */
export function todayInMadrid(now: Date = new Date()): string {
  return format(new TZDate(now.getTime(), MADRID_TIME_ZONE), 'yyyy-MM-dd');
}

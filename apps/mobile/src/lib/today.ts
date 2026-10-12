/**
 * The Today tab (RAPP-246): what needs doing now, limited to what the person
 * may do and what the app can do itself. One section per area, in a fixed
 * order with field work first. Each later phase adds its own section here
 * (participants and material in phase 2, the review queue, forum reports,
 * mentoring and deletion requests in phases 3 to 5); the app ships only when
 * every phase is done, so no section points to the web admin.
 */
import type { TeamArea } from './team-shell';

export type TodaySection = 'attendance' | 'messages';

const ORDER: readonly TodaySection[] = ['attendance', 'messages'];

export function todaySections(areas: readonly TeamArea[]): readonly TodaySection[] {
  return ORDER.filter((section) => areas.includes(section));
}

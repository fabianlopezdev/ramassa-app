/**
 * Which layout the team shell chose (RAPP-245), for the screens inside it: a
 * screen in the large-button layout shows a way back to the start, and a
 * screen on a tablet shows its list and its detail side by side.
 */
import type { TeamLayout } from '@/lib/team-shell';
import { createContext, useContext } from 'react';

export const TeamLayoutContext = createContext<TeamLayout>('tabs');

export function useTeamLayout(): TeamLayout {
  return useContext(TeamLayoutContext);
}

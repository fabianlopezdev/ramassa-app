/**
 * An app follow-up as a step of its own (RAPP-782).
 *
 * When staff move the question a follow-up opens on (Tipus de document, the
 * situation, the specific needs) to another screen, no app control opens the
 * follow-up any more. It becomes a step of its own right after the screen
 * holding the question, opens on her answer there, and asks its fields with
 * the generic renderer, on the custom step route as `custom:app:<follow-up>`.
 * Its signatures, consents and wording stay the follow-up's.
 */
import type { DetailScreen } from '@ramassa/shared/intake';
import { followUpOfGroupId } from '@ramassa/shared/intake-builder';

/** The app's own title of each follow-up, in the onboarding namespace. */
export const FOLLOW_UP_TITLE_KEYS: Readonly<Record<DetailScreen, string>> = {
  'documentation-nie': 'documentNieNumberTitle',
  'documentation-passport': 'documentPassportNumberTitle',
  'documentation-other': 'documentOtherDetailsTitle',
  'applicant-status-details': 'otherSituationTitle',
  'specific-needs-details': 'supportNeedsDetailsTitle',
};

/** The key a step's signatures, consents and wording are kept under. */
export function placementKeyOfStep(screenId: string): string {
  return followUpOfGroupId(screenId) ?? screenId;
}

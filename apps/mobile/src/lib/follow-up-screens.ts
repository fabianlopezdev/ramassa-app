/**
 * The app's follow-up screens as staff set them (RAPP-720): which of their
 * own fields each one draws and requires, the wording staff gave them, and
 * whether one asks anything at all. A follow-up that asks nothing is skipped:
 * her answer opens it, but there is nothing on it to answer.
 */
import { useWizardIntake } from '@/lib/onboarding-intake-context';
import { useMemo } from 'react';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  ownFieldAsking,
  type DetailScreen,
  type FollowUpAsking,
  type OwnFieldAsking,
  type SystemFieldKey,
} from '@ramassa/shared/intake';
import {
  followUpAsking,
  followUpAsksSomething,
  ownFieldWording,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';

/** The screen whose placements a wizard frame draws: every support need shares one. */
export function placedScreenOf(screenId: string | undefined): string | undefined {
  return screenId?.startsWith('needs-detail:') === true ? 'specific-needs-details' : screenId;
}

/** Whether a follow-up her answer opens has anything to ask her. */
export function followUpShows(catalog: IntakeCatalog, screen: DetailScreen): boolean {
  return followUpAsksSomething(catalog, screen);
}

export interface OwnFieldOnScreen {
  readonly asking: OwnFieldAsking;
  /** Staff's wording in her language, else the app's own label. */
  readonly label: (appLabel: string) => string;
  readonly help: string | null;
}

/** What every follow-up asks of its own fields, for the screens' and the final checks. */
export function useFollowUpAsking(): FollowUpAsking {
  const { catalog } = useWizardIntake();
  return useMemo(() => followUpAsking(catalog), [catalog]);
}

/** How a follow-up asks one of its own fields, worded for her. */
export function useOwnField(screen: DetailScreen | null, key: SystemFieldKey): OwnFieldOnScreen {
  const { catalog } = useWizardIntake();
  const { language } = useLanguage();
  const asking = useFollowUpAsking();
  return useMemo(() => {
    if (screen === null) return { asking: 'not_asked', label: (appLabel) => appLabel, help: null };
    const wording = ownFieldWording(catalog, screen, key, language);
    return {
      asking: ownFieldAsking(asking, screen, key),
      label: (appLabel) => wording.label ?? appLabel,
      help: wording.help,
    };
  }, [catalog, screen, key, language, asking]);
}

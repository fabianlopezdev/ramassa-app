/**
 * The consents placed on one screen of her Onboarding (RAPP-699), for the
 * screen that draws them among its fields and signature blocks: an app screen
 * (`placed-fields.tsx`) or a Ramassà screen (`custom/[screenId].tsx`).
 *
 * Each shows as the one consent tick (`ConsentRow`), with its text in her
 * language, in the order the screen shares with its fields and blocks.
 * Continue refuses while a required one is unticked. Her ticks stay in her
 * draft (`consents`, by key) on Continue and on Back, until her registration
 * sends them with the rest.
 */

import { ConsentRow } from '@/components/authorization/consent-row';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardIntake } from '@/lib/onboarding-intake-context';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  consentsOn,
  consentText,
  untickedRequiredConsents,
  type PlacedConsent,
} from '@ramassa/shared/intake-builder';

type Ticks = Readonly<Record<string, boolean>>;

/** One consent of the screen, to draw at its place among the fields. */
interface PlacedConsentEntry {
  readonly sortOrder: number;
  readonly node: ReactNode;
}

export interface ScreenConsents {
  readonly consents: readonly PlacedConsent[];
  readonly hasErrors: boolean;
  /** Each consent drawn, with its place in the screen's order. */
  readonly entries: readonly PlacedConsentEntry[];
  /** Marks the required consents left unticked; true when none is left. */
  readonly check: () => boolean;
  /** Her draft's ticks with this screen's in them. */
  readonly drafted: (saved: Ticks | undefined) => Ticks;
}

export function useScreenConsents(screenKey: string | undefined): ScreenConsents {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const { catalog } = useWizardIntake();
  const consents = screenKey === undefined ? [] : consentsOn(catalog, 'onboarding', screenKey);
  const [ticks, setTicks] = useState<Ticks>(() => {
    const saved = onboardingDraftStore.loadDraft()?.consents;
    return Object.fromEntries(consents.map(({ key }) => [key, saved?.[key] === true]));
  });
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());

  return {
    consents,
    hasErrors: unticked.size > 0,
    entries: consents.map((consent) => ({
      sortOrder: consent.sortOrder,
      node: (
        <ConsentRow
          key={`consent-${consent.id}`}
          testID={`wizard-consent-${consent.key}`}
          label={consentText(consent.body, language).text}
          required={consent.required}
          requiredMark={t('authorizationRequiredMark')}
          checked={ticks[consent.key] === true}
          errorMessage={unticked.has(consent.key) ? t('customErrorConsent') : undefined}
          onToggle={() => {
            const next = !(ticks[consent.key] === true);
            setTicks((current) => ({ ...current, [consent.key]: next }));
            if (next && unticked.has(consent.key)) {
              setUnticked((current) => new Set([...current].filter((key) => key !== consent.key)));
            }
          }}
        />
      ),
    })),
    check() {
      const missing = untickedRequiredConsents(consents, ticks);
      setUnticked(new Set(missing));
      return missing.length === 0;
    },
    drafted: (saved) => ({ ...saved, ...ticks }),
  };
}

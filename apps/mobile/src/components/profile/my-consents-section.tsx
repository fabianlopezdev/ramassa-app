/**
 * Her optional consents from the season authorization (RAPP-304): the ones
 * the current version asks, worded as staff wrote them (RAPP-614). She changes
 * them here whenever she wants; every change is recorded with the words she
 * saw. A consent she gave that the current version no longer asks stays here,
 * with the words she agreed to, so she can always withdraw it. Image rights
 * drive the media consent, so a photo decision made here and one made in her
 * profile edit are the same decision. Shown only when her organization has
 * published an authorization.
 */

import { ConsentRow } from '@/components/authorization/consent-row';
import { ProfileSection } from '@/components/profile/profile-section';
import { useAuthorizationStatus, useMyConsents, useSetOptionalConsent } from '@/lib/authorization';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { IMAGE_RIGHTS_CONSENT, orderedConsents } from '@ramassa/shared/authorization';
import { resolveLocalizedText } from '@ramassa/shared/i18n/localized-content';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function MyConsentsSection({ mediaConsent }: { readonly mediaConsent: boolean }) {
  const { t, i18n } = useTranslation('profile');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca';
  const status = useAuthorizationStatus(true);
  const consents = useMyConsents(true);
  const change = useSetOptionalConsent();

  const content = status.data?.content;
  if (content === undefined) return null;

  const asked = orderedConsents(content)
    .filter((consent) => !consent.required)
    .map((consent) => ({
      key: consent.key,
      label: resolveLocalizedText(consent.label, language)?.text ?? '',
    }));
  // Given earlier, no longer asked: she can still withdraw it.
  const kept = Object.entries(consents.data ?? {})
    .filter(([key, consent]) => consent.granted && !(key in content.consents))
    .map(([key, consent]) => ({ key, label: consent.wording ?? key }));

  return (
    <ProfileSection title={t('consentsTitle')}>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
        {t('consentsIntro')}
      </Text>
      {[...asked, ...kept].map((consent) => {
        const granted =
          consents.data?.[consent.key]?.granted ??
          (consent.key === IMAGE_RIGHTS_CONSENT ? mediaConsent : false);
        return (
          <ConsentRow
            key={consent.key}
            testID={`profile-consent-${consent.key}`}
            label={consent.label}
            required={false}
            requiredMark=""
            checked={granted}
            onToggle={() =>
              change.mutate(
                { key: consent.key, granted: !granted, language },
                { onError: () => playHaptic('error') },
              )
            }
          />
        );
      })}
    </ProfileSection>
  );
}

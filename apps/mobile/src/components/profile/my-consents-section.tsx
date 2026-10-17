/**
 * Her optional consents from the season authorization (RAPP-304): image
 * rights, newsletter and team messaging groups. She changes them here whenever
 * she wants; every change is recorded. Image rights drive the media consent,
 * so a photo decision made here and one made in her profile edit are the same
 * decision. Shown only when her organization has published an authorization.
 */

import { ConsentRow } from '@/components/authorization/consent-row';
import { ProfileSection } from '@/components/profile/profile-section';
import { useAuthorizationStatus, useMyConsents, useSetOptionalConsent } from '@/lib/authorization';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { AUTHORIZATION_CONSENTS } from '@ramassa/shared/authorization';
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

  return (
    <ProfileSection title={t('consentsTitle')}>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
        {t('consentsIntro')}
      </Text>
      {AUTHORIZATION_CONSENTS.filter((consent) => !consent.required).map((consent) => {
        const granted =
          consents.data?.[consent.key] ?? (consent.key === 'image_rights' ? mediaConsent : false);
        return (
          <ConsentRow
            key={consent.key}
            testID={`profile-consent-${consent.key}`}
            label={resolveLocalizedText(content.consents[consent.key].label, language)?.text ?? ''}
            required={false}
            requiredMark=""
            checked={granted}
            onToggle={() =>
              change.mutate(
                { key: consent.key, granted: !granted },
                { onError: () => playHaptic('error') },
              )
            }
          />
        );
      })}
    </ProfileSection>
  );
}

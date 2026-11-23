/**
 * El meu perfil (RAPP-22, RAPP-794): opened from her photo at the top of every
 * tab, as a short menu on the shared raised cards (RAPP-863). Her data and her
 * attendance come first, as a pair of half-width raised cards (RAPP-874); the
 * other rows follow on the raised icon card. Each opens one screen, except the
 * last, which signs her out.
 *
 * It stays the RGPD self-service surface. She sees and corrects her data under
 * "Les meves dades", and gives or withdraws her consents and asks for erasure
 * under "Privacitat i permisos". The wizard's terms step promised she could
 * change the media consent "whenever you want, from your profile"; that
 * promise lands there.
 *
 * The route is `/profile`, as it was when the profile was a tab, so the links
 * that already point here keep working.
 *
 * It opens on her photo in the story layout of the avís and guide screens,
 * with her full name on the bottom of the photo as the screen's heading
 * (RAPP-960). With no photo, her initials stand on the soft brand blue.
 */

import { PublicOrganizationLogo } from '@/components/branding/public-organization-logo';
import { ICON_LICENCE } from '@/components/icons/icon';
import { PanelHeroScreen, PhotoHeroScreen, PhotoHeroTitle } from '@/components/layout/photo-hero';
import { RaisedHalfCard, RaisedHalfCardRow } from '@/components/layout/raised-half-card';
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { useSectionWash } from '@/components/layout/raised-surface';
import { logout } from '@/lib/auth';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useOwnPersonCard } from '@/lib/person-cards';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { useOwnProfile } from '@ramassa/shared/profile';
import { SECTION_BRAND_COLOR } from '@ramassa/shared/section-colors';
import { tokens } from '@ramassa/shared/tokens';

// The dev-menu entry, required inside a __DEV__ branch so neither the component
// nor its label reaches a production bundle (RAPP-19).
const DevMenuEntry = __DEV__
  ? (require('@/components/dev/dev-menu-entry') as typeof import('@/components/dev/dev-menu-entry'))
      .DevMenuEntry
  : null;

/** The first letter of her first and last names, upper-cased. */
function initialsOf(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName]
    .map((part) => [...(part ?? '').trim()][0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

/**
 * The top of her profile (RAPP-960): her photo with her name on it, or her
 * initials and her name on the soft brand blue. The menu sits on the sheet.
 */
function ProfileHeroScreen({
  testID,
  languageFontClass,
  children,
}: {
  readonly testID: string;
  readonly languageFontClass: string;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('profile');
  const { session } = useAuth();
  const { data: profile } = useOwnProfile();
  // Her card is already cached by the photo button that opened this screen.
  const card = useOwnPersonCard();
  const firstName = profile?.first_name ?? card?.firstName ?? null;
  const lastName = profile?.last_name ?? null;
  const fullName = [firstName, lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ');
  const avatarKey = profile === undefined ? (card?.avatarKey ?? null) : profile?.avatar_url;
  const accessToken = session?.access_token;
  const source = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: avatarKey ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, avatarKey],
  );
  const panelColor = useSectionWash(SECTION_BRAND_COLOR) ?? tokens.colors.neutral[100];
  const title = (
    <PhotoHeroTitle
      testID="profile-name"
      title={fullName === '' ? t('title') : fullName}
      onPanel={source === null}
      languageFontClass={languageFontClass}
    />
  );
  if (source === null || !avatarKey) {
    return (
      <PanelHeroScreen
        testID={testID}
        panelColor={panelColor}
        sheetColor={tokens.colors.neutral[50]}
        panel={
          <Text
            testID="profile-initials"
            accessible={false}
            className={`text-5xl font-bold text-primary ${languageFontClass}`}
          >
            {initialsOf(firstName, lastName)}
          </Text>
        }
        overlay={title}
      >
        {children}
      </PanelHeroScreen>
    );
  }
  return (
    <PhotoHeroScreen
      testID={testID}
      source={source}
      photoKey={avatarKey}
      focus={null}
      accessibilityLabel={fullName === '' ? t('title') : fullName}
      sheetColor={tokens.colors.neutral[50]}
      overlay={title}
    >
      {children}
    </PhotoHeroScreen>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation(['profile', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const openData = useCallback(() => push('/profile-data' as Href), [push]);
  const openAttendance = useCallback(() => push('/profile-attendance' as Href), [push]);
  const openLanguage = useCallback(() => push('/profile-language' as Href), [push]);
  const openAppLock = useCallback(() => push('/app-lock' as Href), [push]);
  const openPrivacy = useCallback(() => push('/profile-privacy' as Href), [push]);
  const signOut = useCallback(() => void logout(), []);

  /*
    The credits, together and centred in the frame's footer, at the very
    bottom of the phone (RAPP-877): the club's logo (RAPP-907), the funding
    the grant terms ask to mention (RAPP-64), then the icon set's licence
    credit (RAPP-834). Small type takes a tight line height, so a wrapped
    line stays close to the one above.
  */
  const credits = (
    <View className="items-center gap-xs">
      <View testID="profile-logo" className="w-full pb-md">
        <PublicOrganizationLogo variant="footer" />
      </View>
      <Text
        testID="generalitat-credit"
        className={`text-center text-xs leading-5 text-neutral-600 ${languageFontClass}`}
      >
        {t('common:fundingAcknowledgment')}
      </Text>
      <Text
        testID="icon-credit"
        className={`text-center text-xs leading-5 text-neutral-600 ${languageFontClass}`}
      >
        {ICON_LICENCE.credit}
      </Text>
    </View>
  );

  return (
    <ProfileHeroScreen testID="profile-menu" languageFontClass={languageFontClass}>
      <View className="gap-lg">
        <RaisedHalfCardRow>
          <RaisedHalfCard
            testID="profile-open-data"
            icon={playerNavIcons.myData}
            title={t('menu.data')}
            accessibilityLabel={t('menu.data')}
            languageFontClass={languageFontClass}
            onOpen={openData}
          />
          <RaisedHalfCard
            testID="profile-open-attendance"
            icon={playerNavIcons.attendance}
            title={t('menu.attendance')}
            accessibilityLabel={t('menu.attendance')}
            languageFontClass={languageFontClass}
            onOpen={openAttendance}
          />
        </RaisedHalfCardRow>
        <RaisedIconCard
          testID="profile-open-language"
          icon={playerNavIcons.language}
          title={t('menu.language')}
          accessibilityLabel={t('menu.language')}
          languageFontClass={languageFontClass}
          onOpen={openLanguage}
        />
        {/* The lock does not exist on the web. */}
        {Platform.OS === 'web' ? null : (
          <RaisedIconCard
            testID="open-app-lock"
            icon={playerNavIcons.appLock}
            title={t('menu.appLock')}
            accessibilityLabel={t('menu.appLock')}
            languageFontClass={languageFontClass}
            onOpen={openAppLock}
          />
        )}
        <RaisedIconCard
          testID="profile-open-privacy"
          icon={playerNavIcons.privacy}
          title={t('menu.privacy')}
          accessibilityLabel={t('menu.privacy')}
          languageFontClass={languageFontClass}
          onOpen={openPrivacy}
        />
        <RaisedIconCard
          testID="profile-sign-out"
          icon={playerNavIcons.signOut}
          title={t('signOutAction')}
          accessibilityLabel={t('signOutAction')}
          languageFontClass={languageFontClass}
          tone="danger"
          onOpen={signOut}
        />
        {DevMenuEntry === null ? null : <DevMenuEntry />}
      </View>
      <View className="pt-2xl">{credits}</View>
    </ProfileHeroScreen>
  );
}

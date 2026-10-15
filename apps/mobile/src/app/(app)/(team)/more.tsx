/**
 * More (RAPP-245): what is not an area of its own. Settings (language and app
 * lock) and sign-out, Stock for whoever receives, counts or edits material
 * (RAPP-250), forum and gallery moderation (RAPP-380, RAPP-381), mentoring
 * (RAPP-382), the feedback inbox (RAPP-383), notifications (RAPP-385), the
 * impact dashboard (RAPP-400), the team (RAPP-404), the organization's
 * settings (RAPP-403), and the player preview (RAPP-371); later slices add the
 * rest.
 *
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { PreviewStartFailed, useStartPreview } from '@/components/preview/preview-as-player';
import { TeamBackToHome } from '@/components/team/team-back-to-home';
import { teamScreens } from '@/lib/account-area';
import { logout } from '@/lib/auth';
import { continuousCorners } from '@/lib/continuous-corners';
import { teamAreas } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TeamMoreScreen() {
  const { t } = useTranslation('nav');
  const { t: tAuth } = useTranslation('auth');
  const { t: tProfile } = useTranslation('profile');
  const { t: tParticipants } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const preview = useStartPreview();
  const { permissions } = useAccountAccess();
  const hasStock = teamAreas(permissions).includes('stock');
  const team = teamScreens(permissions);
  const { t: tForum } = useTranslation('forum');
  const { t: tMentoring } = useTranslation('mentoring');
  const { t: tGallery } = useTranslation('gallery');
  const { t: tFeedback } = useTranslation('feedback');
  const { t: tNotifications } = useTranslation('notifications');
  const { t: tSettings } = useTranslation('settings');
  const { t: tAdmin } = useTranslation('admin');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();

  return (
    <SafeAreaView
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
      testID="team-more"
    >
      <PageWidth className="flex-1">
        <ScrollView contentContainerClassName="gap-md p-lg">
          <TeamBackToHome />
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('team.more')}
          </Text>
          {hasStock ? (
            <PressableScale
              testID="team-more-stock"
              accessibilityRole="button"
              accessibilityLabel={tParticipants('stock.title')}
              onPress={() => push('/stock' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tParticipants('stock.title')}
              </Text>
            </PressableScale>
          ) : null}
          {team.forumModeration ? (
            <PressableScale
              testID="team-more-forum"
              accessibilityRole="button"
              accessibilityLabel={tForum('moderationTitle')}
              onPress={() => push('/forum-moderation' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tForum('moderationTitle')}
              </Text>
            </PressableScale>
          ) : null}
          {team.galleryModeration ? (
            <PressableScale
              testID="team-more-gallery"
              accessibilityRole="button"
              accessibilityLabel={tGallery('moderationTitle')}
              onPress={() => push('/team-gallery' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tGallery('moderationTitle')}
              </Text>
            </PressableScale>
          ) : null}
          {team.feedback ? (
            <PressableScale
              testID="team-more-feedback"
              accessibilityRole="button"
              accessibilityLabel={tFeedback('inboxTitle')}
              onPress={() => push('/team-feedback' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tFeedback('inboxTitle')}
              </Text>
            </PressableScale>
          ) : null}
          {team.impact ? (
            <PressableScale
              testID="team-more-impact"
              accessibilityRole="button"
              accessibilityLabel={tAdmin('impactReportTitle')}
              onPress={() => push('/team-impact' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tAdmin('impactReportTitle')}
              </Text>
            </PressableScale>
          ) : null}
          {team.staff ? (
            <PressableScale
              testID="team-more-staff"
              accessibilityRole="button"
              accessibilityLabel={tSettings('team.title')}
              onPress={() => push('/team-staff' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tSettings('team.title')}
              </Text>
            </PressableScale>
          ) : null}
          {team.organization ? (
            <PressableScale
              testID="team-more-organization"
              accessibilityRole="button"
              accessibilityLabel={tSettings('tabOrganization')}
              onPress={() => push('/team-organization' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tSettings('tabOrganization')}
              </Text>
            </PressableScale>
          ) : null}
          {team.notifications ? (
            <PressableScale
              testID="team-more-notifications"
              accessibilityRole="button"
              accessibilityLabel={tNotifications('title')}
              onPress={() => push('/team-notifications' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tNotifications('title')}
              </Text>
            </PressableScale>
          ) : null}
          {team.mentoring ? (
            <PressableScale
              testID="team-more-mentoring"
              accessibilityRole="button"
              accessibilityLabel={tMentoring('adminTitle')}
              onPress={() => push('/team-mentoring' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tMentoring('adminTitle')}
              </Text>
            </PressableScale>
          ) : null}
          {/* Every team member, with no permission needed (ADR-026, RAPP-371). */}
          <PressableScale
            testID="team-more-preview"
            accessibilityRole="button"
            accessibilityLabel={tCommon('previewAsPlayer')}
            onPress={() => void preview.start(null)}
            isBusy={preview.isStarting}
            haptic="selection"
            style={continuousCorners}
            className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
          >
            <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
              {tCommon('previewAsPlayer')}
            </Text>
          </PressableScale>
          <PreviewStartFailed isShown={preview.hasFailed} />
          <PressableScale
            testID="team-more-settings"
            accessibilityRole="button"
            accessibilityLabel={tAuth('teamSettingsTitle')}
            onPress={() => push('/app-lock' as Href)}
            haptic="selection"
            style={continuousCorners}
            className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
          >
            <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
              {tAuth('teamSettingsTitle')}
            </Text>
          </PressableScale>
          <PressableScale
            testID="team-more-sign-out"
            accessibilityRole="button"
            accessibilityLabel={tProfile('signOutAction')}
            onPress={() => void logout()}
            haptic="tapLight"
            className="min-h-recommended justify-center px-md"
          >
            <Text
              className={`text-start text-md font-semibold text-primary-dark ${languageFontClass}`}
            >
              {tProfile('signOutAction')}
            </Text>
          </PressableScale>
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

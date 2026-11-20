/**
 * More (RAPP-245, RAPP-796): what is not an area of its own, in six headed
 * groups with field work first and sign-out last. The groups and which entries
 * she may open come from `moreGroups` in `lib/team-shell`, the same rule the
 * large-button home uses for its More button (RAPP-797); a group with no entry
 * for her is left out. The same screen opens from the tabs, the large-button
 * home and the tablet sidebar.
 */
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ScreenSection } from '@/components/layout/screen-section';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { PreviewStartFailed, useStartPreview } from '@/components/preview/preview-as-player';
import { useTeamLayout } from '@/components/team/team-layout-context';
import { TeamListRow } from '@/components/team/team-list-row';
import { useGuardedLogout } from '@/lib/sign-out-guard';
import { usePendingSigningCount } from '@/lib/tablet-signing';
import { moreGroups, type MoreEntry, type MoreGroup } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Entries that open a screen, with the testID each has had since it arrived. */
const ROUTES: Readonly<
  Partial<Record<MoreEntry, { readonly testID: string; readonly href: Href }>>
> = {
  collectSignatures: {
    testID: 'team-more-collect-signatures',
    href: '/collect-signatures' as Href,
  },
  stock: { testID: 'team-more-stock', href: '/stock' as Href },
  mentoring: { testID: 'team-more-mentoring', href: '/team-mentoring' as Href },
  feedback: { testID: 'team-more-feedback', href: '/team-feedback' as Href },
  // One entry for forum and gallery reports (decision D4).
  moderation: { testID: 'team-more-forum', href: '/forum-moderation' as Href },
  notifications: { testID: 'team-more-notifications', href: '/team-notifications' as Href },
  surveys: { testID: 'team-more-surveys', href: '/team-surveys' as Href },
  impact: { testID: 'team-more-impact', href: '/team-impact' as Href },
  data: { testID: 'team-more-data', href: '/team-data' as Href },
  documents: { testID: 'team-more-documents', href: '/team-documents' as Href },
  staff: { testID: 'team-more-staff', href: '/team-staff' as Href },
  entities: { testID: 'team-more-entities', href: '/team-entities' as Href },
  organization: { testID: 'team-more-organization', href: '/team-organization' as Href },
  settings: { testID: 'team-more-settings', href: '/app-lock' as Href },
};

function TeamMoreScreen() {
  const signOut = useGuardedLogout();
  // In the large-button layout More is a screen pushed from the home, so
  // the native header goes back to it (RAPP-815); tabs and the sidebar need none.
  const homeHeader = useTeamLayout() === 'home' ? <NativeScreenHeader /> : null;
  const pendingSignings = usePendingSigningCount();
  const { t } = useTranslation('nav');
  const { t: tAuth } = useTranslation('auth');
  const { t: tProfile } = useTranslation('profile');
  const { t: tParticipants } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const { t: tMentoring } = useTranslation('mentoring');
  const { t: tFeedback } = useTranslation('feedback');
  const { t: tForum } = useTranslation('forum');
  const { t: tNotifications } = useTranslation('notifications');
  const { t: tSurveys } = useTranslation('surveys');
  const { t: tEntities } = useTranslation('entity-management');
  const { t: tSettings } = useTranslation('settings');
  const { t: tAdmin } = useTranslation('admin');
  const preview = useStartPreview();
  const { permissions } = useAccountAccess();
  const groups = useMemo(() => moreGroups(permissions), [permissions]);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();

  const groupTitles: Readonly<Record<MoreGroup, string>> = {
    field: t('team.moreGroups.field'),
    players: t('team.moreGroups.players'),
    communication: t('team.moreGroups.communication'),
    data: t('team.moreGroups.data'),
    organization: t('team.moreGroups.organization'),
    app: t('team.moreGroups.app'),
  };
  const labels: Readonly<Record<MoreEntry, string>> = {
    collectSignatures: tParticipants('signing.title'),
    stock: tParticipants('stock.title'),
    mentoring: tMentoring('adminTitle'),
    feedback: tFeedback('inboxTitle'),
    moderation: tForum('moderationScreenTitle'),
    notifications: tNotifications('title'),
    surveys: tSurveys('title'),
    impact: tAdmin('impactReportTitle'),
    data: t('staff.data'),
    documents: tSettings('documentsTitle'),
    staff: tSettings('team.title'),
    entities: tEntities('managementTitle'),
    organization: t('team.organizationData'),
    preview: tCommon('previewAsPlayer'),
    settings: tAuth('teamSettingsTitle'),
    signOut: tProfile('signOutAction'),
  };

  const renderEntry = (entry: MoreEntry) => {
    if (entry === 'preview') {
      // Every team member, with no permission needed (ADR-026, RAPP-371).
      return (
        <TeamListRow
          key={entry}
          testID="team-more-preview"
          label={labels.preview}
          onPress={() => void preview.start(null)}
          isBusy={preview.isStarting}
        />
      );
    }
    if (entry === 'signOut') {
      return (
        <TeamListRow
          key={entry}
          testID="team-more-sign-out"
          label={labels.signOut}
          tone="action"
          onPress={signOut}
        />
      );
    }
    const route = ROUTES[entry];
    if (route === undefined) return null;
    // Signing the authorization on this tablet (RAPP-305), with the count of
    // signings still waiting to sync.
    const waiting =
      entry === 'collectSignatures' && pendingSignings > 0
        ? tParticipants('signing.pending', { count: pendingSignings })
        : undefined;
    return (
      <TeamListRow
        key={entry}
        testID={route.testID}
        label={labels[entry]}
        accessibilityHint={waiting}
        value={waiting === undefined ? undefined : String(pendingSignings)}
        isValueHighlighted={waiting !== undefined}
        onPress={() => push(route.href)}
      />
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
      testID="team-more"
    >
      {homeHeader}
      <PageWidth className="flex-1">
        {/* The inset keeps the last entry, sign-out, clear of the floating tab bar. */}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-lg p-lg pb-3xl"
        >
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('team.more')}
          </Text>
          {groups.map(({ group, entries }, index) => (
            <ScreenSection
              key={group}
              title={groupTitles[group]}
              isLast={index === groups.length - 1}
            >
              {entries.map(renderEntry)}
            </ScreenSection>
          ))}
          <PreviewStartFailed isShown={preview.hasFailed} />
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

export default withScreenEntrance('more', TeamMoreScreen);
